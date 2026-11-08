import type {PreparedImage} from '../types';import {resizedCanvas,canvasBlob} from './images';import {getUnwarpModel} from './unwarp-model';import {appPath} from '../paths';import {cancelOcr} from '../ocr/adapter';
export async function rectifyImage(image:PreparedImage,signal:AbortSignal,status:(s:string)=>void):Promise<PreparedImage>{
 cancelOcr();const model=await getUnwarpModel(signal,status);signal.throwIfAborted();
 const canvas=await resizedCanvas(image.blob,1800,2200000);signal.throwIfAborted();const ctx=canvas.getContext('2d',{willReadFrequently:true})!,pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 const result=await new Promise<{rgba:Uint8ClampedArray<ArrayBuffer>;width:number;height:number}>((resolve,reject)=>{
  const worker=new Worker(new URL('./unwarp.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal.removeEventListener('abort',abort);clearTimeout(timer);};
  const abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};
  const timer=setTimeout(()=>{cleanup();reject(new Error('展平耗时较长，已保留原照片。可裁剪书页后重试。'));},150000);
  signal.addEventListener('abort',abort,{once:true});worker.onerror=()=>{cleanup();reject(new Error('此浏览器暂时无法展平，已保留原照片，可继续识别。'));};
  worker.onmessage=e=>{if(e.data.status){status(e.data.status);return;}cleanup();e.data.error?reject(new Error(e.data.error)):resolve(e.data.result);};
  worker.postMessage({rgba:pixels.data,width:canvas.width,height:canvas.height,model,wasmPath:new URL(appPath('ocr/'),location.origin).href},[pixels.data.buffer,model]);
 });
 signal.throwIfAborted();canvas.width=result.width;canvas.height=result.height;ctx.putImageData(new ImageData(result.rgba,result.width,result.height),0,0);
 const blob=await canvasBlob(canvas);canvas.width=1;return {...image,blob,width:result.width,height:result.height};
}
