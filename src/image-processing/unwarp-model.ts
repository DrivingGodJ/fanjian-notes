import {MODEL_CACHE,downloadModels} from '../ocr/model-cache';import {appPath} from '../paths';
const asset={url:appPath('ocr/uvdoc.onnx'),bytes:31684150,sha256:'54cab30dc2cf347b4f3d6971c833b1c3d84f5ef17280f1f6d15796bff20e63d6'};
export async function unwarpModelReady(){const c=await caches.open(MODEL_CACHE);return (await c.match(asset.url))?.headers.get('x-asset-sha256')===asset.sha256;}
export async function getUnwarpModel(signal?:AbortSignal,status:(s:string)=>void=()=>{}){
 await downloadModels((_,label)=>status(label),signal);signal?.throwIfAborted();const cache=await caches.open(MODEL_CACHE),cached=await cache.match(asset.url);
 if(cached?.headers.get('x-asset-sha256')===asset.sha256)return cached.arrayBuffer();
 status('下载可选书页展平模型（30.2 MiB，仅静态文件）');
 let response:Response;try{response=await fetch(asset.url,{signal,cache:'no-store'});}catch(e){if(signal?.aborted)throw e;throw new Error('书页展平模型未缓存，请联网下载一次后再离线使用。');}
 if(!response.ok)throw new Error(`书页展平模型下载失败（${response.status}），可继续普通识别。`);
 const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');signal?.throwIfAborted();
 if(bytes.byteLength!==asset.bytes||hash!==asset.sha256)throw new Error('展平模型校验失败，请重试。');
 await cache.put(asset.url,new Response(bytes,{headers:{'content-type':'application/octet-stream','x-asset-sha256':hash}}));return bytes;
}
