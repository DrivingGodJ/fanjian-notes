import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,Check,HardDrive,LoaderCircle,ShieldCheck,Trash2,WifiOff,X} from 'lucide-react';
import {cacheStatus,clearModels,downloadModels,type CacheStatus} from '../ocr/model-cache';
import {cancelOcr} from '../ocr/adapter';
export function ModelManager({onClose,onboarding=false,onDismiss}:{onClose:()=>void;onboarding?:boolean;onDismiss?:()=>void}){
 const [status,setStatus]=useState<CacheStatus>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[label,setLabel]=useState(''),[persistent,setPersistent]=useState(false),[appReady,setAppReady]=useState(false);
 const abort=useRef<AbortController>(null);
 const refresh=()=>cacheStatus().then(setStatus).catch(e=>setError(e.message));
 useEffect(()=>{let disposed=false;refresh();navigator.storage?.persisted?.().then(setPersistent);if(!import.meta.env.DEV)navigator.serviceWorker?.ready.then(()=>{if(!disposed)setAppReady(true);});return()=>{disposed=true;abort.current?.abort();};},[]);
 const download=async()=>{setError('');setBusy(true);abort.current=new AbortController();try{await downloadModels((s,l)=>{setStatus(s);setLabel(l);},abort.current.signal);await refresh();}catch(e){if((e as Error).name!=='AbortError')setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="modal-backdrop" onClick={onboarding&&!status?.ready?undefined:onClose}><section role="dialog" aria-modal="true" aria-label={onboarding?'首次使用模型安装引导':'离线模型管理'} className="modal models" onClick={e=>e.stopPropagation()}><header><div className="panel-icon"><HardDrive size={23}/></div><button className="icon-button" aria-label="关闭模型管理" onClick={onboarding&&!status?.ready?(onDismiss??onClose):onClose}><X size={20}/></button></header><p className="eyebrow">{onboarding?'FIRST-TIME SETUP':'READ ANYWHERE'}</p><h2>{onboarding?'首次使用 · 安装离线识别模型':'把阅读能力，留在本机'}</h2><p className="muted">{onboarding?'照片全程在手机本地识别，不上传云端。首次使用需先下载离线 OCR 模型（约 67 MB），安装完成后无网也能直接拍照转简体。':'首次需要联网下载。准备完成后，即使没有网络，也可以继续识别照片。'}</p>
 <div className="model-item"><span className="model-icon">文</span><div><strong>繁体中文 · PP-OCRv5 Mobile</strong><small>官方 PaddleOCR · WebAssembly · 本地 Worker</small></div>{status?.ready?<Check className="green" size={21}/>:<ArrowDownToLine size={21}/>}</div>
 <div className="model-progress"><div><span>{busy?label:status?.ready?'OCR 资源已缓存':'模型资源待缓存'}</span><strong>{status?`${(status.bytes/1048576).toFixed(1)} / ${(status.totalBytes/1048576).toFixed(1)} MB`:'检查中…'}</strong></div><progress max="1" value={status?status.bytes/status.totalBytes:0}/></div>
 {!onboarding&&<ul className="cache-checks"><li><span className={status?.ready?'green':''}>{status?.ready?<Check size={16}/>:<HardDrive size={16}/>}OCR 模型与运行时</span><b>{status?.cached??0} / {status?.total??'—'} 项</b></li><li><span>{appReady?<Check size={16}/>:<WifiOff size={16}/>}应用离线文件</span><b>{appReady?'已安装服务缓存':import.meta.env.DEV?'开发模式未缓存':'缓存准备中…'}</b></li><li><span><ShieldCheck size={16}/>本地持久存储</span><button onClick={async()=>{const granted=await navigator.storage?.persist?.();setPersistent(!!granted);}}>{persistent?'已获准':'申请保留'}</button></li></ul>}
 {error&&<p role="alert" className="error">{error}</p>}
 <div className="model-actions">
  {busy?<button className="secondary" onClick={()=>abort.current?.abort()}>取消下载</button>:onboarding?
   (status?.ready?<button className="primary" onClick={onClose}><Check size={18}/>安装完成，开始使用</button>:<><button className="secondary" onClick={onDismiss??onClose}>稍后再说</button><button className="primary" onClick={download}><ArrowDownToLine size={18}/>立即安装离线模型</button></>)
   :<button className="primary" onClick={download}>{status?.ready?<Check size={18}/>:<ArrowDownToLine size={18}/>} {status?.ready?'检查并补全缓存':'下载离线资源'}</button>}
  {!onboarding&&<button className="icon-button" aria-label="清理模型缓存" disabled={busy} onClick={async()=>{cancelOcr();await clearModels();await refresh();}}><Trash2 size={18}/></button>}
 </div>
 <p className="fine-print">浏览器可能因空间不足清理缓存；请在出发前检查状态。离线识别还需要完整缓存应用文件。{busy&&<LoaderCircle className="spin inline" size={12}/>}</p><p className="fine-print">安装到手机：iPhone Safari 分享 → 添加到主屏幕；Android 浏览器菜单 → 安装应用。</p></section></div>;
}
