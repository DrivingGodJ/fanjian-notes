import { Converter } from 'opencc-js/t2cn';

// twp includes vocabulary conversion (軟體 → 软件), in addition to glyph conversion.
const converter = Converter({from: 'twp', to: 'cn'});
export function toSimplified(line: string): string { return converter(line); }
export const characters = (text: string): string[] => Array.from(text.normalize('NFC'));
export const isHan = (text: string): boolean => /^\p{Script=Han}$/u.test(text);

export interface AlignedChange {
  sourceStart: number; sourceEnd: number; original: string; simplified: string;
  kind: 'character' | 'phrase';
}
export interface ConversionAlignment { text: string; changes: AlignedChange[]; ambiguous: boolean }

function alignSlice(a: string[], b: string[], sourceOffset: number): { changes: AlignedChange[]; ambiguous: boolean } {
  const n = a.length, m = b.length;
  if (n === 0 && m === 0) return {changes: [], ambiguous: false};
  if (a.join('') === b.join('')) return {changes: [], ambiguous: false};
  if (n > 500 || m > 500) return {ambiguous: true, changes: [{sourceStart:sourceOffset,sourceEnd:sourceOffset+n,original:a.join(''),simplified:b.join(''),kind:'phrase'}]};
  const d = Array.from({length:n+1}, () => new Uint16Array(m+1));
  const paths = Array.from({length:n+1}, () => new Uint8Array(m+1));
  for (let i=0;i<=n;i++) { d[i][0]=i; paths[i][0]=1; }
  for (let j=0;j<=m;j++) { d[0][j]=j; paths[0][j]=1; }
  for (let i=1;i<=n;i++) for (let j=1;j<=m;j++) {
    const diag=d[i-1][j-1]+Number(a[i-1]!==b[j-1]), del=d[i-1][j]+1, ins=d[i][j-1]+1;
    d[i][j]=Math.min(diag,del,ins);
    paths[i][j]=Math.min(2,(diag===d[i][j]?paths[i-1][j-1]:0)+(del===d[i][j]?paths[i-1][j]:0)+(ins===d[i][j]?paths[i][j-1]:0));
  }
  const ambiguous=paths[n][m]>1;
  if (ambiguous) return {ambiguous,changes:[{sourceStart:sourceOffset,sourceEnd:sourceOffset+n,original:a.join(''),simplified:b.join(''),kind:'phrase'}]};
  const ops: {i:number; a:string; b:string}[]=[];
  let i=n,j=m;
  while(i||j) {
    if (i&&j&&d[i][j]===d[i-1][j-1]+Number(a[i-1]!==b[j-1])) {ops.push({i:i-1,a:a[--i],b:b[--j]});}
    else if(i&&d[i][j]===d[i-1][j]+1) {ops.push({i:i-1,a:a[--i],b:''});}
    else {ops.push({i,a:'',b:b[--j]});}
  }
  ops.reverse();
  const changes: AlignedChange[]=[];
  let group: typeof ops=[];
  const flush=()=>{
    if(!group.length) return;
    const original=group.map(o=>o.a).join(''), simplified=group.map(o=>o.b).join('');
    const start=sourceOffset+group[0].i, end=sourceOffset+Math.min(n,Math.max(...group.map(o=>o.i+(o.a?1:0))));
    if (group.every(o=>o.a&&o.b)) {
      group.forEach(o=>{if(isHan(o.a)&&isHan(o.b)) changes.push({sourceStart:sourceOffset+o.i,sourceEnd:sourceOffset+o.i+1,original:o.a,simplified:o.b,kind:'character'});});
    } else if (simplified) changes.push({sourceStart:start,sourceEnd:end,original,simplified,kind:'phrase'});
    group=[];
  };
  for(const op of ops) {if(op.a===op.b) flush(); else group.push(op);}
  flush();
  return {changes,ambiguous};
}

/** Levenshtein alignment; splits at unique identical anchors so local phrase length changes don't obscure whole-line characters. */
export function alignConversion(source: string, target = toSimplified(source)): ConversionAlignment {
  const a = characters(source), b = characters(target), n = a.length, m = b.length;
  if (source === target) return {text: target, changes: [], ambiguous: false};
  const whole = alignSlice(a, b, 0);
  if (!whole.ambiguous || n > 500 || m > 500) return {text: target, changes: whole.changes, ambiguous: whole.ambiguous};

  const countA = new Map<string, number>(), countB = new Map<string, number>();
  const posA = new Map<string, number>(), posB = new Map<string, number>();
  a.forEach((c, idx) => { countA.set(c, (countA.get(c) ?? 0) + 1); posA.set(c, idx); });
  b.forEach((c, idx) => { countB.set(c, (countB.get(c) ?? 0) + 1); posB.set(c, idx); });

  const pairs: { ai: number; bi: number }[] = [];
  for (const [c, cnt] of countA) {
    if (cnt === 1 && countB.get(c) === 1) pairs.push({ai: posA.get(c)!, bi: posB.get(c)!});
  }
  pairs.sort((u, v) => u.ai - v.ai);

  // Longest strictly increasing subsequence on bi
  const dp = new Array(pairs.length).fill(1), prev = new Array(pairs.length).fill(-1);
  let best = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = 0; j < i; j++) {
      if (pairs[j].bi < pairs[i].bi && dp[j] + 1 > dp[i]) { dp[i] = dp[j] + 1; prev[i] = j; }
    }
    if (dp[i] > dp[best]) best = i;
  }
  const anchors: { ai: number; bi: number }[] = [];
  if (pairs.length) {
    for (let k = best; k !== -1; k = prev[k]) anchors.push(pairs[k]);
    anchors.reverse();
  }
  if (!(anchors.length >= 2 || (anchors.length === 1 && Math.max(n, m) >= 5))) {
    return {text: target, changes: whole.changes, ambiguous: true};
  }

  const changes: AlignedChange[] = [];
  let pa = 0, pb = 0, anyAmbiguous = false;
  for (const {ai, bi} of [...anchors, {ai: n, bi: m}]) {
    if (ai > pa || bi > pb) {
      const seg = alignSlice(a.slice(pa, ai), b.slice(pb, bi), pa);
      changes.push(...seg.changes);
      if (seg.ambiguous) anyAmbiguous = true;
    }
    pa = ai + 1;
    pb = bi + 1;
  }
  return {text: target, changes, ambiguous: anyAmbiguous};
}
