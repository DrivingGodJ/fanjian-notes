import {appPath} from '../paths';
export const MODEL_CACHE=`fanjian-ocr-v2:${import.meta.env.BASE_URL}`;
const manifestPath=appPath('ocr/manifest.json');
export interface Asset { url:string; bytes:number; sha256:string }
export interface AssetManifest { version:string; assets:Asset[] }
export interface CacheStatus { cached:number; total:number; bytes:number; totalBytes:number; ready:boolean }
let manifest:AssetManifest|undefined;
export async function getManifest():Promise<AssetManifest> {
  if(!('caches' in globalThis))throw new Error('本地识别需要 HTTPS 或 localhost 安全连接。请使用 HTTPS 版本打开。');
  if(manifest)return manifest;
  const cache=await caches.open(MODEL_CACHE);
  let response:Response|undefined;
  try { response=await fetch(manifestPath);if(response.ok)await cache.put(manifestPath,response.clone()); }
  catch { response=await cache.match(manifestPath); }
  if(!response?.ok)response=await cache.match(manifestPath);
  if(!response?.ok)throw new Error('模型资源尚未准备。请先联网准备离线资源，再重试。开发时请运行 npm run assets:ocr。');
  const loaded:AssetManifest=await response.json();
  const base=new URL(manifestPath,location.href);
  manifest={...loaded,assets:loaded.assets.map(asset=>{
    const url=new URL(asset.url,base);
    if(url.origin!==base.origin||!url.pathname.startsWith(new URL('./',base).pathname))throw new Error('模型清单包含无效资源地址。');
    return {...asset,url:url.href};
  })};return manifest;
}
export async function cacheStatus():Promise<CacheStatus> {
  const m=await getManifest(), cache=await caches.open(MODEL_CACHE);let cached=0,bytes=0;
  for(const a of m.assets){const r=await cache.match(a.url);if(r?.headers.get('x-asset-sha256')===a.sha256){cached++;bytes+=a.bytes;}}
  return {cached,total:m.assets.length,bytes,totalBytes:m.assets.reduce((s,a)=>s+a.bytes,0),ready:cached===m.assets.length};
}
export async function downloadModels(onProgress:(s:CacheStatus,label:string)=>void,signal?:AbortSignal) {
  if(!('caches' in globalThis))throw new Error('需要 HTTPS 或 localhost 才能缓存模型。');
  const m=await getManifest(),cache=await caches.open(MODEL_CACHE);let status=await cacheStatus();
  await cache.put(manifestPath,new Response(JSON.stringify(m),{headers:{'content-type':'application/json'}}));
  for(const a of m.assets){
    signal?.throwIfAborted();
    if((await cache.match(a.url))?.headers.get('x-asset-sha256')===a.sha256)continue;
    onProgress(status,`缓存 ${a.url.split('/').pop()}`);
    const response=await fetch(a.url,{signal,cache:'no-store'});
    if(!response.ok)throw new Error(`模型下载失败（${response.status}），请联网后重试。`);
    const buffer=await response.arrayBuffer();signal?.throwIfAborted();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==a.sha256||buffer.byteLength!==a.bytes)throw new Error('模型资源校验失败，请重试下载。');
    const headers=new Headers(response.headers);
    // Module imports send different Origin headers. Do not let Vary invalidate a verified local asset.
    for(const name of ['vary','content-encoding','content-length','transfer-encoding'])headers.delete(name);
    headers.set('x-asset-sha256',hash);
    await cache.put(a.url,new Response(buffer,{headers}));status=await cacheStatus();onProgress(status,`已缓存 ${status.cached}/${status.total} 项资源`);
  }
  return status;
}
export async function clearModels(){await caches.delete(MODEL_CACHE);}
