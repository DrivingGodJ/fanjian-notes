import type {OcrLine} from '../types';import {resizedCanvas} from '../image-processing/images';import {appPath} from '../paths';import {cancelOcr} from '../ocr/adapter';import {downloadModels} from '../ocr/model-cache';
export async function locateRecognizedCharacters(image:{blob:Blob;width:number;height:number},lines:OcrLine[],signal?:AbortSignal,status:(s:string)=>void=()=>{}):Promise<OcrLine[]>{
 if(!lines.length)return [];lines=lines.map(l=>({...l,text:l.text.normalize('NFC')}));signal?.throwIfAborted();cancelOcr();
 await downloadModels((_,s)=>status(s),signal);
 const [archive,config,canvas]=await Promise.all([fetch(appPath('ocr/rec.tar'),{signal}).then(r=>{if(!r.ok)throw Error('无法读取逐字识别模型');return r.arrayBuffer();}),fetch(appPath('ocr/rec-params.json'),{signal}).then(r=>{if(!r.ok)throw Error('无法读取逐字识别字典');return r.json();}),resizedCanvas(image.blob,1800,2800000)]);
 signal?.throwIfAborted();const pixels=canvas.getContext('2d',{willReadFrequently:true})!.getImageData(0,0,canvas.width,canvas.height),size={width:canvas.width,height:canvas.height};canvas.width=1;
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./recognition.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);clearTimeout(timer);};
  const abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};const timer=setTimeout(()=>{cleanup();reject(new Error('逐字核对耗时过长，请裁剪文字区域后重试。'));},150000);
  signal?.addEventListener('abort',abort,{once:true});worker.onerror=()=>{cleanup();reject(new Error('逐字核对未完成，请重试定位。'));};
  worker.onmessage=e=>{if(e.data.status){status(e.data.status);return;}cleanup();e.data.error?reject(new Error(e.data.error)):resolve(e.data.result);};
  worker.postMessage({rgba:pixels.data,...size,target:{width:image.width,height:image.height},lines,archive,config,wasmPath:new URL(appPath('ocr/'),location.origin).href},[pixels.data.buffer,archive]);
 });
}
