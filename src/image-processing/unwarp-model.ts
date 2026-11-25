import {MODEL_CACHE,fetchAssetBuffer,isQuotaError} from '../ocr/model-cache';
import {appPath} from '../paths';

export const UNWARP_ASSET_BYTES=31684150;
const asset={url:appPath('ocr/uvdoc.onnx'),bytes:UNWARP_ASSET_BYTES,sha256:'54cab30dc2cf347b4f3d6971c833b1c3d84f5ef17280f1f6d15796bff20e63d6'};

export async function unwarpModelReady(){
 if(!('caches' in globalThis))return false;
 const c=await caches.open(MODEL_CACHE);
 return (await c.match(asset.url))?.headers.get('x-asset-sha256')===asset.sha256;
}

export async function getUnwarpModel(signal?:AbortSignal,status:(s:string)=>void=()=>{}){
 if(!('caches' in globalThis))throw new Error('需要 HTTPS 或 localhost 才能缓存矫正模型。');
 signal?.throwIfAborted();
 const cache=await caches.open(MODEL_CACHE),cached=await cache.match(asset.url);
 if(cached?.headers.get('x-asset-sha256')===asset.sha256)return cached.arrayBuffer();

 const directUrl=new URL(asset.url,location.href);
 directUrl.searchParams.set('direct','1');
 let bytes:ArrayBuffer|undefined;
 let lastReason='网络不可达';

 for(let attempt=1;attempt<=2;attempt++){
  signal?.throwIfAborted();
  const attemptUrl=attempt===1?directUrl.href:(()=>{const u=new URL(directUrl.href);u.searchParams.set('attempt',String(attempt));return u.href;})();
  status(`下载 3D 书页矫正模型 (0.0/30.2 MB)${attempt>1?` · 第${attempt}次`:''}`);
  try{
   const buf=await fetchAssetBuffer(attemptUrl,signal,loaded=>{
    status(`下载 3D 书页矫正模型 (${(loaded/1048576).toFixed(1)}/30.2 MB)`);
   });
   signal?.throwIfAborted();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf))).map(x=>x.toString(16).padStart(2,'0')).join('');
   if(buf.byteLength!==asset.bytes||hash!==asset.sha256)throw new Error('矫正模型校验失败');
   bytes=buf;
   break;
  }catch(e){
   if(e instanceof DOMException&&e.name==='AbortError'&&signal?.aborted)throw e;
   if(isQuotaError(e))throw new Error('手机可用存储空间不足，请清理空间后重试。');
   lastReason=e instanceof Error?e.message:'网络错误';
   if(attempt<2)await new Promise(r=>setTimeout(r,600));
  }
 }

 if(!bytes)throw new Error(`3D 书页矫正模型下载失败（${lastReason}），将使用基础矫正。`);
 try{
  await cache.put(asset.url,new Response(bytes,{headers:{'content-type':'application/octet-stream','x-asset-sha256':asset.sha256}}));
 }catch(e){
  if(isQuotaError(e))throw new Error('手机可用存储空间不足，请清理空间后重试。');
  throw e;
 }
 return bytes;
}
