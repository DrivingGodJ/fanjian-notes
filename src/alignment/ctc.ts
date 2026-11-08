export interface RecognitionToken {character:string;start:number;end:number;anchor:number;confidence:number}
/** Keep CTC time evidence instead of discarding it after decoding text. Blank is class zero. */
export function decodeCtc(data:Float32Array,steps:number,classes:number,dict:string[],contentFraction=1):RecognitionToken[]{
 if(data.length!==steps*classes||steps<1||classes!==dict.length+1)throw new Error('识别时序维度无效');
 const result:RecognitionToken[]=[];let previous=0;
 for(let t=0;t<steps;t++){
  let index=0,score=-Infinity;for(let k=0;k<classes;k++){const value=data[t*classes+k];if(value>score){score=value;index=k;}}
  if(index&&index===previous){const token=result.at(-1)!;token.end=(t+1)/steps/contentFraction;if(score>token.confidence){token.confidence=score;token.anchor=(t+.5)/steps/contentFraction;}}
  else if(index){result.push({character:dict[index-1],start:t/steps/contentFraction,end:(t+1)/steps/contentFraction,anchor:(t+.5)/steps/contentFraction,confidence:score});}
  previous=index;
 }return result.filter(t=>t.anchor<1.02);
}
/** Only accept exact character matches that occur unambiguously in every optimal edit path. */
export function matchRecognizedCharacters(source:string,witness:string,manual=false):Map<number,number>{
 const sourceChars=Array.from(source),targetChars=Array.from(witness),aa=sourceChars.map((c,i)=>({c,i})).filter(x=>!/^\s$/u.test(x.c)),bb=targetChars.map((c,i)=>({c,i})).filter(x=>!/^\s$/u.test(x.c));
 const n=aa.length,m=bb.length,result=new Map<number,number>();if(n>500||m>500)return result;
 const matrix=()=>Array.from({length:n+1},()=>new Uint16Array(m+1)),f=matrix(),b=matrix();
 for(let i=0;i<=n;i++){f[i][0]=i;b[i][m]=n-i;}for(let j=0;j<=m;j++){f[0][j]=j;b[n][j]=m-j;}
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)f[i][j]=Math.min(f[i-1][j]+1,f[i][j-1]+1,f[i-1][j-1]+Number(aa[i-1].c!==bb[j-1].c));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)b[i][j]=Math.min(b[i+1][j]+1,b[i][j+1]+1,b[i+1][j+1]+Number(aa[i].c!==bb[j].c));
 for(let i=0;i<n;i++){
  const candidates:number[]=[];let deletion=false;for(let j=0;j<=m;j++){if(f[i][j]+1+b[i+1][j]===f[n][m])deletion=true;if(j<m&&(manual||aa[i].c===bb[j].c)&&f[i][j]+Number(aa[i].c!==bb[j].c)+b[i+1][j+1]===f[n][m])candidates.push(j);}
  if(!deletion&&candidates.length===1)result.set(aa[i].i,bb[candidates[0]].i);
 }return result;
}
export function tarModel(bytes:Uint8Array):Uint8Array{
 const decoder=new TextDecoder();for(let p=0;p+512<=bytes.length;){const h=bytes.subarray(p,p+512),name=decoder.decode(h.subarray(0,100)).replace(/\0.*/,''),raw=decoder.decode(h.subarray(124,136)).replace(/\0.*/,'').trim();if(!name)break;const size=parseInt(raw,8);if(!Number.isFinite(size)||size<0||p+512+size>bytes.length)throw new Error('识别模型归档损坏');if(name.endsWith('/inference.onnx'))return bytes.slice(p+512,p+512+size);p+=512+Math.ceil(size/512)*512;}
 throw new Error('未找到识别模型');
}
