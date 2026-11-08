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

/** Levenshtein alignment; tied paths or non-bijective edits become phrase hints. */
export function alignConversion(source: string, target = toSimplified(source)): ConversionAlignment {
  const a = characters(source), b = characters(target), n = a.length, m = b.length;
  if (source === target) return {text: target, changes: [], ambiguous: false};
  // Bound quadratic allocation on pathological OCR/user input.
  if (n > 500 || m > 500) return {text: target, ambiguous: true, changes: [{sourceStart:0,sourceEnd:n,original:source,simplified:target,kind:'phrase'}]};
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
  if (ambiguous) return {text:target,ambiguous,changes:[{sourceStart:0,sourceEnd:n,original:source,simplified:target,kind:'phrase'}]};
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
    const start=group[0].i, end=Math.min(n,Math.max(...group.map(o=>o.i+(o.a?1:0))));
    if (group.every(o=>o.a&&o.b)) {
      group.forEach(o=>{if(isHan(o.a)&&isHan(o.b)) changes.push({sourceStart:o.i,sourceEnd:o.i+1,original:o.a,simplified:o.b,kind:'character'});});
    } else if (simplified) changes.push({sourceStart:start,sourceEnd:end,original,simplified,kind:'phrase'});
    group=[];
  };
  for(const op of ops) {if(op.a===op.b) flush(); else group.push(op);}
  flush();
  return {text:target,changes,ambiguous};
}
