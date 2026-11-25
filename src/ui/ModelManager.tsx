import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowDownToLine,Check,ChevronDown,ChevronUp,HardDrive,LoaderCircle,ShieldCheck,Trash2,WifiOff,X} from 'lucide-react';
import {cacheStatus,clearModels,downloadModels,getSourceMode,runModelDiagnostics,setSourceMode,type CacheStatus,type DiagnosticReport,type SourceMode} from '../ocr/model-cache';
import {cancelOcr} from '../ocr/adapter';
import {getUnwarpModel,unwarpModelReady} from '../image-processing/unwarp-model';

export function ModelManager({onClose,onboarding=false,onDismiss}:{onClose:()=>void;onboarding?:boolean;onDismiss?:()=>void}){
 const [status,setStatus]=useState<CacheStatus>(),[unwarpReady,setUnwarpReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[label,setLabel]=useState(''),[persistent,setPersistent]=useState(false),[appReady,setAppReady]=useState(false);
 const [sourceMode,updateSourceMode]=useState<SourceMode>(()=>getSourceMode());
 const [showTroubleshoot,setShowTroubleshoot]=useState(!onboarding);
 const [diag,setDiag]=useState<DiagnosticReport|null>(null),[diagnosing,setDiagnosing]=useState(false),[logs,setLogs]=useState<string[]>([]);
 const abort=useRef<AbortController>(null);
 const refresh=()=>Promise.all([cacheStatus().then(setStatus),unwarpModelReady().then(setUnwarpReady)]).catch(e=>setError(e.message));
 useEffect(()=>{let disposed=false;refresh();navigator.storage?.persisted?.().then(setPersistent);if(!import.meta.env.DEV)navigator.serviceWorker?.ready.then(()=>{if(!disposed)setAppReady(true);});return()=>{disposed=true;abort.current?.abort();};},[]);

 const appendLog=(entry:string)=>setLogs(prev=>[...prev.slice(-3),entry]);

 const download=async(overrideMode?:SourceMode)=>{
  const mode=overrideMode??sourceMode;
  setError('');setLogs([]);setBusy(true);abort.current=new AbortController();
  try{
   await downloadModels((s,l)=>{setStatus(s);setLabel(l);},abort.current.signal,{mode,onLog:appendLog});
   if(!(await unwarpModelReady())){
    await getUnwarpModel(abort.current.signal,setLabel);
   }
   await refresh();
  }catch(e){
   if((e as Error).name!=='AbortError'){
    setError((e as Error).message);
    setShowTroubleshoot(true);
   }
  }finally{setBusy(false);}
 };

 const diagnose=async()=>{
  setDiagnosing(true);
  try{setDiag(await runModelDiagnostics());}
  finally{setDiagnosing(false);}
 };

 const changeMode=(next:SourceMode)=>{updateSourceMode(next);setSourceMode(next);};
 const allReady=!!status?.ready&&unwarpReady;

 return <div className="modal-backdrop" onClick={onboarding&&!status?.ready?undefined:onClose}><section role="dialog" aria-modal="true" aria-label={onboarding?'首次使用模型安装引导':'离线模型管理'} className="modal models" onClick={e=>e.stopPropagation()}><header><div className="panel-icon"><HardDrive size={23}/></div><button className="icon-button" aria-label="关闭模型管理" onClick={onboarding&&!status?.ready?(onDismiss??onClose):onClose}><X size={20}/></button></header><p className="eyebrow">{onboarding?'FIRST-TIME SETUP':'READ ANYWHERE'}</p><h2>{onboarding?'首次使用 · 安装离线识别模型':'把阅读能力，留在本机'}</h2><p className="muted">{onboarding?'照片全程在手机本地识别，不上传云端。首次使用需先下载离线 OCR 与 3D 书页矫正模型（约 97 MB），支持自动换源加速。':'首次需要联网下载。准备完成后，即使没有网络，也可以继续识别与 3D 矫正书页。'}</p>
 <div className="model-item"><span className="model-icon">文</span><div><strong>繁体中文 · PP-OCRv5 Mobile</strong><small>67.2 MB · 官方 PaddleOCR · WebAssembly · 本地 Worker</small></div>{status?.ready?<Check className="green" size={21}/>:<ArrowDownToLine size={21}/>}</div>
 <div className="model-item"><span className="model-icon">平</span><div><strong>UVDoc · 书页 3D 曲面与透视矫正</strong><small>30.2 MB · {unwarpReady?'已缓存，支持离线 3D 矫正':'待缓存，用于拉平弯曲与斜拍书页'}</small></div>{unwarpReady?<Check className="green" size={21}/>:<ArrowDownToLine size={21}/>}</div>
 <div className="model-progress"><div><span>{busy?label:allReady?'全部离线资源已缓存':status?.ready?'OCR 已缓存，待缓存 3D 矫正模型':'模型资源待缓存'}</span><strong>{status?`${(status.bytes/1048576).toFixed(1)} / ${(status.totalBytes/1048576).toFixed(1)} MB`:'检查中…'}</strong></div><progress max="1" value={status?status.bytes/status.totalBytes:0}/></div>
 {!onboarding&&<ul className="cache-checks"><li><span className={status?.ready?'green':''}>{status?.ready?<Check size={16}/>:<HardDrive size={16}/>}OCR 模型与运行时</span><b>{status?.cached??0} / {status?.total??'—'} 项</b></li><li><span className={unwarpReady?'green':''}>{unwarpReady?<Check size={16}/>:<HardDrive size={16}/>}3D 书页矫正模型</span><b>{unwarpReady?'已缓存':'未缓存'}</b></li><li><span>{appReady?<Check size={16}/>:<WifiOff size={16}/>}应用离线文件</span><b>{appReady?'已安装服务缓存':import.meta.env.DEV?'开发模式未缓存':'缓存准备中…'}</b></li><li><span><ShieldCheck size={16}/>本地持久存储</span><button onClick={async()=>{const granted=await navigator.storage?.persist?.();setPersistent(!!granted);}}>{persistent?'已获准':'申请保留'}</button></li></ul>}

 <button type="button" className="troubleshoot-toggle" onClick={()=>setShowTroubleshoot(!showTroubleshoot)}>
  <span>下载慢或失败？换源与网络诊断</span>
  {showTroubleshoot?<ChevronUp size={15}/>:<ChevronDown size={15}/>}
 </button>
 {showTroubleshoot&&<div className="troubleshoot-box">
  <label className="source-label">下载线路
   <select aria-label="模型下载线路" className="source-select" disabled={busy} value={sourceMode} onChange={e=>changeMode(e.target.value as SourceMode)}>
    <option value="auto">自动换源（本站优先，失败自动切镜像）</option>
    <option value="mirror-first">优先加速镜像（推荐国内手机网络）</option>
    <option value="origin-only">仅使用本站直连</option>
   </select>
  </label>
  <div className="troubleshoot-actions">
   <button type="button" className="secondary small" disabled={diagnosing||busy} onClick={diagnose}><Activity size={14}/>{diagnosing?'诊断中…':'一键网络诊断'}</button>
   <button type="button" className="secondary small" disabled={busy} onClick={async()=>{cancelOcr();await clearModels();await refresh();await download();}}>清理缓存并重试</button>
  </div>
  {diag&&<div className="diag-report">
   <p className="diag-summary">{diag.summary}</p>
   <ul className="diag-list">
    {diag.checks.map(c=><li key={c.id} className="diag-row"><span>{c.label}</span><b className={c.ok?'diag-ok':'diag-fail'}>{c.detail}</b></li>)}
    {diag.storage&&<li className="diag-row"><span>手机可用存储配额</span><b className={diag.storage.low?'diag-fail':'diag-ok'}>{diag.storage.freeMb} MB 可用</b></li>}
   </ul>
   {diag.recommendedMode==='mirror-first'&&sourceMode!=='mirror-first'&&<button type="button" className="primary small full" disabled={busy} onClick={()=>{changeMode('mirror-first');void download('mirror-first');}}>切换到加速镜像并重试</button>}
  </div>}
  {logs.length>0&&<div className="download-logs" aria-live="polite">{logs.map((line,i)=><div key={i}>{line}</div>)}</div>}
 </div>}

 {error&&<p role="alert" className="error">{error}</p>}
 <div className="model-actions">
  {busy?<button className="secondary" onClick={()=>abort.current?.abort()}>取消下载</button>:onboarding?
   (allReady?<button className="primary" onClick={onClose}><Check size={18}/>安装完成，开始使用</button>:<><button className="secondary" onClick={onDismiss??onClose}>稍后再说</button><button className="primary" onClick={()=>download()}><ArrowDownToLine size={18}/>立即安装离线模型</button></>)
   :<button className="primary" onClick={()=>download()}>{allReady?<Check size={18}/>:<ArrowDownToLine size={18}/>} {allReady?'检查并补全缓存':'下载离线资源'}</button>}
  {!onboarding&&<button className="icon-button" aria-label="清理模型缓存" disabled={busy} onClick={async()=>{cancelOcr();await clearModels();await refresh();}}><Trash2 size={18}/></button>}
 </div>
 <p className="fine-print">浏览器可能因空间不足清理缓存；请在出发前检查状态。离线识别还需要完整缓存应用文件。{busy&&<LoaderCircle className="spin inline" size={12}/>}</p><p className="fine-print">安装到手机：iPhone Safari 分享 → 添加到主屏幕；Android 浏览器菜单 → 安装应用。</p></section></div>;
}
