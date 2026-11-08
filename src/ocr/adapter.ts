import type { PaddleOCRCreateOptions } from '@paddleocr/paddleocr-js';
import type { OcrLine, PreparedImage } from '../types';
import { normalizeResult } from './normalize';
import { resizedCanvas } from '../image-processing/images';
import { downloadModels } from './model-cache';
import {appPath} from '../paths';
type OcrInstance=Awaited<ReturnType<typeof import('@paddleocr/paddleocr-js')['PaddleOCR']['create']>>;
let instance:OcrInstance|undefined,worker:Worker|undefined;
const options:PaddleOCRCreateOptions={
  lang:'chinese_cht',ocrVersion:'PP-OCRv5',initialize:false,unsupportedBehavior:'error',
  textDetectionModelName:'PP-OCRv5_mobile_det',textRecognitionModelName:'PP-OCRv5_mobile_rec',
  textDetectionModelAsset:{url:new URL(appPath('ocr/det.tar'),location.origin).href},
  textRecognitionModelAsset:{url:new URL(appPath('ocr/rec.tar'),location.origin).href},
  worker:{createWorker:()=>{worker=new Worker(appPath('ocr/worker.js'),{type:'module'});return worker;}},
  ortOptions:{backend:'wasm',wasmPaths:new URL(appPath('ocr/'),location.origin).href,numThreads:1,simd:true},
  textRecognitionBatchSize:1,textDetectionBatchSize:1
};
export function cancelOcr(){worker?.terminate();worker=undefined;instance=undefined;}
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{
    const abort=()=>{cancelOcr();reject(new DOMException('已取消','AbortError'));};
    if(signal.aborted){abort();return;}
    const timer=setTimeout(()=>{cancelOcr();reject(new Error('识别耗时过长。请裁剪文字区域或换一张较小、清晰的照片后重试。'));},150000);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);});
    signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  });
}
export async function recognize(image:PreparedImage,signal:AbortSignal,status:(label:string,progress?:number)=>void):Promise<OcrLine[]> {
  try{
    status('检查本地模型资源');
    await downloadModels((s,label)=>status(label,s.bytes/s.totalBytes*.45),signal);
    signal.throwIfAborted();
    if(!instance){status('初始化本地识别引擎（首次可能需要较长时间）',.5);const {PaddleOCR}=await import('@paddleocr/paddleocr-js');signal.throwIfAborted();instance=await PaddleOCR.create(options);}
    await abortable(instance.initialize(),signal);
    status('识别图片中的繁体文字',.65);
    const canvas=await resizedCanvas(image.blob,1600,2200000);signal.throwIfAborted();
    const [result]=await abortable(instance.predict(canvas,{textDetLimitSideLen:960,textDetLimitType:'max',textRecScoreThresh:.35}),signal);
    canvas.width=1;canvas.height=1;
    if(!result)throw new Error('没有返回识别结果，请重试。');
    status('对齐字符与生成旁注',.93);return normalizeResult(result,image);
  }catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))cancelOcr();if(error instanceof TypeError&&/fetch|network/i.test(error.message))throw new Error('本地资源读取失败。请联网打开离线模型管理，检查并补全缓存后重试。');throw error;}
}
