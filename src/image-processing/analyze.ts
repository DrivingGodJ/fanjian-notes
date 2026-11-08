import {resizedCanvas} from './images';
import type {OcrLine} from '../types';
import {estimateDeskew,pixelSampler,type DeskewResult,type GrayImage} from './analysis';
import {CharacterAlignmentEngine,ALIGNMENT_VERSION} from '../alignment/CharacterAlignmentEngine';
import type {Reading} from '../types';
import {canonicalizeQuad,inferDirection} from '../alignment/geometry';
import {locateRecognizedCharacters} from '../alignment/recognition';
async function grayImage(blob:Blob,maxSide:number,maxPixels:number):Promise<GrayImage>{
 const canvas=await resizedCanvas(blob,maxSide,maxPixels),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),gray=new Uint8Array(canvas.width*canvas.height);
 for(let i=0;i<gray.length;i++)gray[i]=Math.round(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114);
 const result={data:gray,width:canvas.width,height:canvas.height};canvas.width=1;return result;
}
async function analyze<T>(operation:'deskew'|'align',image:GrayImage,target:{width:number;height:number},lines:OcrLine[],signal?:AbortSignal):Promise<T>{
 signal?.throwIfAborted();
 if(typeof Worker==='undefined')return (operation==='deskew'?estimateDeskew(image):new CharacterAlignmentEngine().alignAll(lines,pixelSampler(image,target))) as T;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);clearTimeout(timer);};
  const abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};
  const timer=setTimeout(()=>{cleanup();reject(new Error('图像分析耗时过长，请裁剪文字区域后重试。'));},45000);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>{cleanup();event.data.error?reject(new Error(event.data.error)):resolve(event.data.result);};
  worker.onerror=()=>{cleanup();reject(new Error('图像分析失败，请尝试较小的照片。'));};
  worker.postMessage({operation,image,target,lines},[image.data.buffer]);
 });
}
export async function detectImageSkew(blob:Blob,signal?:AbortSignal){const image=await grayImage(blob,850,650000);return analyze<DeskewResult>('deskew',image,image,[],signal);}
export async function alignImageCharacters(image:{blob:Blob;width:number;height:number},lines:OcrLine[],signal?:AbortSignal){
 return (await analyzeImageLines(image,lines,signal)).annotations;
}
export async function analyzeImageLines(image:{blob:Blob;width:number;height:number},lines:OcrLine[],signal?:AbortSignal,status?:(s:string)=>void){
 const located=await locateRecognizedCharacters(image,lines,signal,status);signal?.throwIfAborted();return {lines:located,annotations:new CharacterAlignmentEngine().alignAll(located)};
}
export async function improveReading(reading:Reading,signal?:AbortSignal):Promise<Reading>{
 const lines=reading.lines.map(l=>{const manual=l.directionSource==='manual'||l.modified&&!l.directionSource,direction=manual?l.direction:inferDirection(l.polygon);return {...l,direction,polygon:canonicalizeQuad(l.polygon,direction)};});
 const result=await analyzeImageLines({blob:reading.image,width:reading.width,height:reading.height},lines,signal),fresh=result.annotations,old=new Map(reading.annotations.map(a=>[a.id,a]));
 const annotations=fresh.map(a=>{const previous=old.get(a.id);if(!previous)return a;
  if(previous.method==='manual')return {...a,center:previous.center,sourcePolygon:previous.sourcePolygon,position:previous.position,offset:previous.offset,method:'manual' as const,positionConfidence:previous.positionConfidence,visible:previous.visible,deleted:previous.deleted,modified:true,needsReview:false};
  return {...a,visible:a.needsReview?false:previous.needsReview&&!previous.modified?true:previous.visible,deleted:previous.deleted,modified:previous.modified};
 });
 return {...reading,lines:result.lines,annotations,alignmentVersion:ALIGNMENT_VERSION,updatedAt:Date.now()};
}
