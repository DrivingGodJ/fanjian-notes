import {appPath} from '../paths';
export const MODEL_CACHE=`fanjian-ocr-v2:${import.meta.env.BASE_URL}`;
const manifestPath=appPath('ocr/manifest.json');
const SOURCE_MODE_KEY='fanjian-model-source';
const MIRROR_HOSTS=new Set(['fastly.jsdelivr.net','cdn.jsdelivr.net','unpkg.com']);

export type SourceMode='auto'|'mirror-first'|'origin-only';
export interface Asset { url:string; bytes:number; sha256:string; mirrors?:string[] }
export interface AssetManifest { version:string; assets:Asset[] }
export interface CacheStatus { cached:number; total:number; bytes:number; totalBytes:number; ready:boolean }
export interface CandidateSource { label:string; url:string; isMirror:boolean }
export interface DiagnosticCheck { id:string; label:string; ok:boolean; ms?:number; detail:string }
export interface DiagnosticReport {
 online:boolean;
 checks:DiagnosticCheck[];
 storage?:{ usedMb:number; quotaMb:number; freeMb:number; low:boolean };
 recommendedMode:SourceMode;
 summary:string;
}

let manifest:AssetManifest|undefined;

export function getSourceMode():SourceMode{
 try{
  const saved=localStorage.getItem(SOURCE_MODE_KEY);
  if(saved==='auto'||saved==='mirror-first'||saved==='origin-only')return saved;
 }catch{}
 return 'auto';
}

export function setSourceMode(mode:SourceMode){
 try{localStorage.setItem(SOURCE_MODE_KEY,mode);}catch{}
}

function mirrorLabel(hostname:string){
 if(hostname==='fastly.jsdelivr.net')return 'Fastly 镜像';
 if(hostname==='cdn.jsdelivr.net')return 'jsDelivr 镜像';
 if(hostname==='unpkg.com')return 'unpkg 镜像';
 return hostname;
}

export function buildCandidateSources(asset:Asset,mode:SourceMode='auto'):CandidateSource[]{
 const originUrl=new URL(asset.url,typeof location!=='undefined'?location.href:'http://localhost/');
 originUrl.searchParams.set('direct','1');
 const originSource:CandidateSource={label:'本站直连',url:originUrl.href,isMirror:false};
 if(mode==='origin-only')return [originSource];

 const mirrorSources:CandidateSource[]=[];
 for(const raw of asset.mirrors??[]){
  try{
   const parsed=new URL(raw);
   if(parsed.protocol==='https:'&&MIRROR_HOSTS.has(parsed.hostname)){
    mirrorSources.push({label:mirrorLabel(parsed.hostname),url:parsed.href,isMirror:true});
   }
  }catch{}
 }
 return mode==='mirror-first'?[...mirrorSources,originSource]:[originSource,...mirrorSources];
}

export async function getManifest():Promise<AssetManifest> {
 if(!('caches' in globalThis))throw new Error('本地识别需要 HTTPS 或 localhost 安全连接。请使用 HTTPS 版本打开。');
 if(manifest)return manifest;
 const cache=await caches.open(MODEL_CACHE);
 const directUrl=new URL(manifestPath,location.href);
 directUrl.searchParams.set('direct','1');
 let response:Response|undefined;
 try{
  response=await fetch(directUrl.href,{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(response.ok)await cache.put(manifestPath,response.clone());
 }catch{response=await cache.match(manifestPath);}
 if(!response?.ok)response=await cache.match(manifestPath);
 if(!response?.ok)throw new Error('模型资源尚未准备。请先联网准备离线资源，再重试。开发时请运行 npm run assets:ocr。');
 const loaded:AssetManifest=await response.json();
 const base=new URL(manifestPath,location.href);
 manifest={...loaded,assets:loaded.assets.map(asset=>{
   const url=new URL(asset.url,base);
   if(url.origin!==base.origin||!url.pathname.startsWith(new URL('./',base).pathname))throw new Error('模型清单包含无效资源地址。');
   return {...asset,url:url.href};
 })};
 return manifest;
}

export async function cacheStatus():Promise<CacheStatus> {
 const m=await getManifest(),cache=await caches.open(MODEL_CACHE);
 let cached=0,bytes=0;
 for(const a of m.assets){
  const r=await cache.match(a.url);
  if(r?.headers.get('x-asset-sha256')===a.sha256){cached++;bytes+=a.bytes;}
 }
 return {cached,total:m.assets.length,bytes,totalBytes:m.assets.reduce((s,a)=>s+a.bytes,0),ready:cached===m.assets.length};
}

export async function fetchAssetBuffer(
 url:string,
 signal:AbortSignal|undefined,
 onBytes:(loaded:number)=>void,
 idleTimeoutMs=25000
):Promise<ArrayBuffer>{
 const inner=new AbortController();
 let timedOut=false;
 const onParentAbort=()=>inner.abort();
 if(signal?.aborted)throw new DOMException('已取消','AbortError');
 signal?.addEventListener('abort',onParentAbort,{once:true});

 let timer:ReturnType<typeof setTimeout>|undefined;
 const resetTimer=()=>{
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{timedOut=true;inner.abort();},idleTimeoutMs);
 };
 resetTimer();

 try{
  const response=await fetch(url,{signal:inner.signal,cache:'no-store'});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  if(!response.body){
   const buf=await response.arrayBuffer();
   onBytes(buf.byteLength);
   return buf;
  }
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let loaded=0,lastEmit=0;
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   resetTimer();
   chunks.push(value);
   loaded+=value.byteLength;
   const now=Date.now();
   if(now-lastEmit>=100){lastEmit=now;onBytes(loaded);}
  }
  onBytes(loaded);
  const out=new Uint8Array(loaded);
  let offset=0;
  for(const c of chunks){out.set(c,offset);offset+=c.byteLength;}
  return out.buffer;
 }catch(e){
  if(timedOut&&!signal?.aborted)throw new Error('下载超时无响应');
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  throw e;
 }finally{
  if(timer)clearTimeout(timer);
  signal?.removeEventListener('abort',onParentAbort);
 }
}

const isQuotaError=(e:unknown)=>e instanceof DOMException&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED');
export {isQuotaError};

function contentTypeFor(url:string){
 if(url.endsWith('.js')||url.endsWith('.mjs'))return 'application/javascript; charset=utf-8';
 if(url.endsWith('.json'))return 'application/json; charset=utf-8';
 if(url.endsWith('.wasm'))return 'application/wasm';
 return 'application/octet-stream';
}

export async function downloadModels(
 onProgress:(s:CacheStatus,label:string)=>void,
 signal?:AbortSignal,
 options?:{mode?:SourceMode;onLog?:(entry:string)=>void}
) {
 if(!('caches' in globalThis))throw new Error('需要 HTTPS 或 localhost 才能缓存模型。');
 const mode=options?.mode??getSourceMode();
 const m=await getManifest(),cache=await caches.open(MODEL_CACHE);
 let status=await cacheStatus();
 await cache.put(manifestPath,new Response(JSON.stringify(m),{headers:{'content-type':'application/json'}}));

 for(const a of m.assets){
  signal?.throwIfAborted();
  if((await cache.match(a.url))?.headers.get('x-asset-sha256')===a.sha256)continue;
  const shortName=a.url.split('/').pop()??a.url;
  const mb=(a.bytes/1048576).toFixed(1);
  const candidates=buildCandidateSources(a,mode);
  let savedBuffer:ArrayBuffer|undefined;
  let savedHash='';
  let lastReason='网络不可达';

  for(const source of candidates){
   const maxAttempts=source.isMirror?1:2;
   for(let attempt=1;attempt<=maxAttempts;attempt++){
    signal?.throwIfAborted();
    const attemptUrl=attempt===1?source.url:(()=>{const u=new URL(source.url);u.searchParams.set('attempt',String(attempt));return u.href;})();
    onProgress(status,`下载 ${shortName} (${mb} MB) · ${source.label}${attempt>1?` 第${attempt}次`:''}`);
    try{
     const buffer=await fetchAssetBuffer(attemptUrl,signal,loaded=>{
      onProgress(
       {...status,bytes:Math.min(status.totalBytes,status.bytes+loaded)},
       `下载 ${shortName} (${(loaded/1048576).toFixed(1)}/${mb} MB) · ${source.label}`
      );
     });
     signal?.throwIfAborted();
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
     if(hash!==a.sha256||buffer.byteLength!==a.bytes)throw new Error('校验和不一致');
     savedBuffer=buffer;savedHash=hash;
     break;
    }catch(err){
     if(err instanceof DOMException&&err.name==='AbortError'&&signal?.aborted)throw err;
     if(isQuotaError(err))throw new Error('手机可用存储空间不足，请清理空间后重试。');
     lastReason=err instanceof Error?err.message:'网络错误';
     if(attempt<maxAttempts){
      options?.onLog?.(`${shortName}：${source.label}失败（${lastReason}），重试中…`);
      await new Promise(r=>setTimeout(r,600));
     }else{
      options?.onLog?.(`${shortName}：${source.label}失败（${lastReason}），自动切换下一线路…`);
     }
    }
   }
   if(savedBuffer)break;
  }

  if(!savedBuffer){
   throw new Error(`${shortName} 下载失败（${lastReason}）。请打开“换源与网络诊断”切换线路或检查网络。`);
  }

  try{
   await cache.put(a.url,new Response(savedBuffer,{
    headers:{'content-type':contentTypeFor(a.url),'x-asset-sha256':savedHash}
   }));
  }catch(err){
   if(isQuotaError(err))throw new Error('手机可用存储空间不足，请清理空间后重试。');
   throw err;
  }
  status=await cacheStatus();
  onProgress(status,`已缓存 ${status.cached}/${status.total} 项资源`);
 }
 return status;
}

export async function runModelDiagnostics():Promise<DiagnosticReport>{
 const online=typeof navigator==='undefined'?true:navigator.onLine;
 const originUrl=new URL(appPath('ocr/rec-params.json'),typeof location!=='undefined'?location.href:'http://localhost/');
 originUrl.searchParams.set('direct','1');

 const probes:{id:string;label:string;url:string}[]=[
  {id:'origin',label:'本站直连 (GitHub Pages)',url:originUrl.href},
  {id:'fastly',label:'Fastly 加速镜像',url:'https://fastly.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort-wasm-simd-threaded.mjs'},
  {id:'jsdelivr',label:'jsDelivr 镜像',url:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/ort-wasm-simd-threaded.mjs'},
  {id:'unpkg',label:'unpkg 镜像',url:'https://unpkg.com/onnxruntime-web@1.24.3/dist/ort-wasm-simd-threaded.mjs'}
 ];

 const checks=await Promise.all(probes.map(async p=>{
  const t0=Date.now();
  try{
   const r=await fetch(p.url,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(6000)});
   const ms=Date.now()-t0;
   return {id:p.id,label:p.label,ok:r.ok,ms,detail:r.ok?`正常 · ${ms} ms`:`HTTP ${r.status}`};
  }catch(e){
   return {id:p.id,label:p.label,ok:false,detail:e instanceof Error&&/abort|timeout/i.test(e.message)?'连接超时':'无法连接'};
  }
 }));

 let storage:DiagnosticReport['storage'];
 try{
  const est=await navigator.storage?.estimate?.();
  if(est?.quota&&est.usage!==undefined){
   const usedMb=Math.round(est.usage/1048576),quotaMb=Math.round(est.quota/1048576),freeMb=Math.max(0,quotaMb-usedMb);
   storage={usedMb,quotaMb,freeMb,low:freeMb<120};
  }
 }catch{}

 const origin=checks[0],mirrors=checks.slice(1).filter(c=>c.ok).sort((a,b)=>(a.ms??9999)-(b.ms??9999));
 let recommendedMode:SourceMode='auto';
 let summary='各线路连通正常，可直接下载。';
 if(!online){
  summary='设备处于离线状态，请连接 Wi-Fi 或移动数据后重试。';
 }else if(storage?.low){
  summary=`浏览器剩余配额仅约 ${storage.freeMb} MB，请先清理浏览器缓存空间。`;
 }else if(!origin.ok&&mirrors.length>0){
  recommendedMode='mirror-first';
  summary=`本站直连受阻，检测到 ${mirrors[0].label} 可用（${mirrors[0].ms} ms），建议切换为“优先加速镜像”。`;
 }else if(origin.ok&&mirrors.length>0&&(origin.ms??0)>1200&&(mirrors[0].ms??9999)<(origin.ms??0)*.6){
  recommendedMode='mirror-first';
  summary=`本站直连较慢（${origin.ms} ms），${mirrors[0].label} 更快（${mirrors[0].ms} ms），建议切换镜像加速。`;
 }else if(!origin.ok&&mirrors.length===0){
  summary='所有线路均无法连通，请检查手机网络、代理或 DNS 设置。';
 }

 return {online,checks,storage,recommendedMode,summary};
}

export async function clearModels(){await caches.delete(MODEL_CACHE);}
