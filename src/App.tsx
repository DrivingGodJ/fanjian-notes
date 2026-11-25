import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowRight,BookOpen,Camera as CameraIcon,Check,ChevronRight,HardDrive,ImagePlus,LoaderCircle,Plus,RefreshCw,ShieldCheck,Trash2,X} from 'lucide-react';
import {registerSW} from 'virtual:pwa-register';
import type {PreparedImage,Reading} from './types';
import {DEFAULT_STYLE} from './types';
import {prepareImage} from './image-processing/images';
import {ALIGNMENT_VERSION} from './alignment/CharacterAlignmentEngine';
import {analyzeImageLines,autoPreprocessImage,improveReading,type PreprocessOptions} from './image-processing/analyze';
import {recognize} from './ocr/adapter';
import {listReadings,saveReading,deleteReading} from './storage/readings';
import {cacheStatus,MODEL_CACHE} from './ocr/model-cache';
import {unwarpModelReady} from './image-processing/unwarp-model';
import {Camera} from './camera/Camera';
import {Reader} from './ui/Reader';
import {ModelManager} from './ui/ModelManager';
import {useBlobUrl} from './ui/hooks';

type Screen='home'|'processing'|'reader'|'history';
const ONBOARDING_KEY='fanjian-onboarding-dismissed';
const isMobileDevice=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function App(){
 const [screen,setScreen]=useState<Screen>('home'),[camera,setCamera]=useState(false),[models,setModels]=useState(false),[onboarding,setOnboarding]=useState(false);
 const [prepared,setPrepared]=useState<PreparedImage>(),[pendingOptions,setPendingOptions]=useState<PreprocessOptions>({correct:true,enhance:true});
 const [reading,setReading]=useState<Reading>(),[saved,setSaved]=useState(false);
 const latestReading=useRef(reading);latestReading.current=reading;
 const [recent,setRecent]=useState<Reading[]>([]),[toast,setToast]=useState(''),[error,setError]=useState(''),[step,setStep]=useState(''),[progress,setProgress]=useState(0),[importing,setImporting]=useState(false),[modelReady,setModelReady]=useState(false),[offline,setOffline]=useState(!navigator.onLine),[update,setUpdate]=useState<(()=>void)>(),[checkingUpdate,setCheckingUpdate]=useState(false),[forceRefreshReady,setForceRefreshReady]=useState(false);
 const upload=useRef<HTMLInputElement>(null),capture=useRef<HTMLInputElement>(null),controller=useRef<AbortController>(null),taskId=useRef(0),swRegRef=useRef<ServiceWorkerRegistration|null>(null),forceTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=(message:string)=>setToast(message);
 const refresh=()=>listReadings().then(setRecent).catch(()=>notify('此浏览器的本地记录不可用，仍可识别与导出。'));
 const refreshModelStatus=()=>Promise.all([cacheStatus(),unwarpModelReady()]).then(([s,u])=>{const ready=s.ready&&u;setModelReady(ready);return ready;}).catch(()=>false);

 useEffect(()=>{
  refresh();
  refreshModelStatus().then(ready=>{
   let dismissed=false;
   try{dismissed=!!localStorage.getItem(ONBOARDING_KEY);}catch{}
   if(!ready&&!dismissed)setOnboarding(true);
  });
  const apply=registerSW({
   onRegisteredSW(_swUrl,registration){swRegRef.current=registration??null;},
   onNeedRefresh(){setUpdate(()=>()=>apply(true));},
   onOfflineReady(){notify('应用文件已缓存，可继续准备离线模型');}
  });
  const online=()=>setOffline(!navigator.onLine);
  const onVisible=()=>{if(document.visibilityState==='visible')swRegRef.current?.update().catch(()=>{});};
  window.addEventListener('online',online);window.addEventListener('offline',online);document.addEventListener('visibilitychange',onVisible);
  return()=>{controller.current?.abort();if(forceTimerRef.current)clearTimeout(forceTimerRef.current);window.removeEventListener('online',online);window.removeEventListener('offline',online);document.removeEventListener('visibilitychange',onVisible);};
 },[]);

 const checkForUpdate=async()=>{
  if(!navigator.onLine){notify('当前处于离线状态，联网后可检查更新');return;}
  if(update){notify('正在更新到最新版本…');update();return;}
  if(forceRefreshReady){
   notify('正在强制刷新页面（保留离线模型）…');
   try{
    if('serviceWorker' in navigator){
     const regs=await navigator.serviceWorker.getRegistrations();
     await Promise.all(regs.map(r=>r.unregister()));
    }
    if('caches' in globalThis){
     const keys=await caches.keys();
     await Promise.all(keys.filter(k=>k!==MODEL_CACHE).map(k=>caches.delete(k)));
    }
   }catch{}
   location.reload();
   return;
  }
  setCheckingUpdate(true);
  try{
   const activateAndReload=(worker:ServiceWorker)=>{
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
    worker.postMessage({type:'SKIP_WAITING'});
   };
   const reg=swRegRef.current??(await navigator.serviceWorker?.getRegistration?.());
   if(reg){
    await reg.update();
    if(reg.waiting){notify('发现新版本，正在更新…');activateAndReload(reg.waiting);return;}
    if(reg.installing){
     notify('发现新版本，正在下载…');
     const worker=reg.installing;
     await new Promise<void>(resolve=>{
      const timer=setTimeout(resolve,15000);
      const onChange=()=>{if(worker.state==='installed'||worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',onChange);resolve();}};
      worker.addEventListener('statechange',onChange);
     });
     if(reg.waiting){activateAndReload(reg.waiting);return;}
    }
   }
   setForceRefreshReady(true);
   if(forceTimerRef.current)clearTimeout(forceTimerRef.current);
   forceTimerRef.current=setTimeout(()=>setForceRefreshReady(false),10000);
   notify('当前已是最新版本；如需强制刷新，再点一次更新按钮');
  }catch{
   setForceRefreshReady(true);
   if(forceTimerRef.current)clearTimeout(forceTimerRef.current);
   forceTimerRef.current=setTimeout(()=>setForceRefreshReady(false),10000);
   notify('检查更新未响应；再点一次更新按钮可强制刷新');
  }finally{setCheckingUpdate(false);}
 };

 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);

 const runPipeline=async(original:PreparedImage,options:PreprocessOptions)=>{
  controller.current?.abort();
  const id=++taskId.current,abort=new AbortController();controller.current=abort;
  setPrepared(original);setPendingOptions(options);setReading(undefined);setSaved(false);setScreen('processing');setError('');setProgress(0);
  try{
   const processed=await autoPreprocessImage(original,options,abort.signal,(s,p)=>{if(taskId.current===id){setStep(s);if(p!==undefined)setProgress(p);}});
   abort.signal.throwIfAborted();
   const lines=await recognize(processed,abort.signal,(s,p)=>{if(taskId.current===id){setStep(s);if(p!==undefined)setProgress(.34+p*.44);}});
   abort.signal.throwIfAborted();
   if(taskId.current===id){setStep('逐字定位与采样纸张底色');setProgress(.78);}
   const result=await analyzeImageLines(processed,lines,abort.signal,s=>{
    if(taskId.current!==id)return;
    setStep(s);
    const m=/(\d+)\s*\/\s*(\d+)/.exec(s);
    if(m)setProgress(Math.min(.96,.78+(Number(m[1])/Math.max(1,Number(m[2])))*.18));
   });
   if(taskId.current===id)setProgress(.98);
   const now=Date.now();
   const r:Reading={
    id:crypto.randomUUID(),name:original.name,createdAt:now,updatedAt:now,
    image:processed.blob,width:processed.width,height:processed.height,
    originalImage:original.blob,originalWidth:original.width,originalHeight:original.height,
    preprocess:options,
    lines:result.lines,annotations:result.annotations,
    style:{...DEFAULT_STYLE},view:{x:0,y:0,scale:0},showAnnotations:true,
    alignmentVersion:ALIGNMENT_VERSION
   };
   abort.signal.throwIfAborted();if(taskId.current!==id)return;
   setReading(r);setSaved(false);setScreen('reader');void refreshModelStatus();
   if(!lines.length)notify('未找到清晰文字，可调整矫正/增强选项后重新识别。');
   else if(!result.annotations.length)notify('已识别原文，未发现需要转换的繁体字。');
  }catch(e){
   if((e as Error).name!=='AbortError'&&taskId.current===id){
    setError((e as Error).message||'识别失败，请重试。');
    setStep('暂时没能读懂这张照片');
   }
  }
 };

 const importFile=async(file?:File)=>{
  if(!file)return;
  setCamera(false);setImporting(true);setError('');
  try{
   const img=await prepareImage(file);
   void runPipeline(img,{correct:true,enhance:true});
  }catch(e){setError((e as Error).message);}
  finally{setImporting(false);if(upload.current)upload.current.value='';if(capture.current)capture.current.value='';}
 };

 const save=async(r=reading)=>{
  if(!r)return;
  try{
   const next={...r,updatedAt:Date.now()};
   await saveReading(next);
   setReading(next);setSaved(true);
   notify('已保存到我的阅读');
   await refresh();
  }catch{notify('保存失败，可能空间不足。请先导出图片。');}
 };

 const goHome=()=>{
  taskId.current++;controller.current?.abort();
  setScreen('home');setError('');refresh();
 };

 const cancel=()=>{taskId.current++;controller.current?.abort();setScreen('home');setError('');};

 const optimize=async(r:Reading)=>{
  controller.current?.abort();const id=++taskId.current,abort=new AbortController();controller.current=abort;
  try{
   const updated=await improveReading(r,abort.signal),current=latestReading.current;
   if(id!==taskId.current||current?.id!==r.id)return;
   const merged={...updated,view:current.view,style:current.style,showAnnotations:current.showAnnotations};
   setReading(merged);await saveReading(merged);await refresh();
  }catch{}
 };

 const openReading=(r:Reading)=>{
  setReading(r);setSaved(true);setScreen('reader');
  if((r.alignmentVersion??0)<ALIGNMENT_VERSION)void optimize(r);
 };

 const dismissOnboarding=()=>{
  setOnboarding(false);
  try{localStorage.setItem(ONBOARDING_KEY,'1');}catch{}
 };

 const isReader=screen==='reader'&&reading;
 return <div className={isReader?'app reading-mode':'app'}>
 <input ref={upload} data-testid="file-upload" className="sr-only" type="file" accept="image/*" onChange={e=>importFile(e.target.files?.[0])}/><input ref={capture} className="sr-only" type="file" accept="image/*" capture="environment" onChange={e=>importFile(e.target.files?.[0])}/>
 {!isReader&&<>
  <aside className="sidebar">
   <button className="brand" onClick={goHome}><span className="brand-mark" aria-hidden="true">閱</span><span>繁简旁注</span></button>
   <nav>
    <button className={screen==='home'?'nav-item selected':'nav-item'} onClick={goHome}><BookOpen size={19}/>开始阅读<span>01</span></button>
    <button className={screen==='history'?'nav-item selected':'nav-item'} onClick={()=>{refresh();setScreen('history');}}><HardDrive size={19}/>我的阅读<span>{recent.length.toString().padStart(2,'0')}</span></button>
    <button className="nav-item" onClick={()=>setModels(true)}><ArrowDownToLine size={19}/>离线模型<small className={modelReady?'status-dot ready':'status-dot'}/></button>
   </nav>
   <div className="sidebar-bottom"><div className="sidebar-version"><span>本地离线 · 不离设备</span><span>v0.1</span></div></div>
  </aside>
  <header className="mobile-header">
   {screen==='history'?<button className="icon-button mobile-back" aria-label="返回首页" onClick={goHome}><ArrowLeft size={21}/></button>:null}
   <button className="brand" onClick={goHome}><span className="brand-mark" aria-hidden="true">閱</span><span>{screen==='history'?'我的阅读':'繁简旁注'}</span></button>
   <div className="mobile-header-actions">
    <button className={update?'icon-button update-ready':'icon-button'} aria-label={update?'更新到最新版本':'检查更新'} disabled={checkingUpdate} onClick={checkForUpdate}><RefreshCw size={19} className={checkingUpdate?'spin':''}/></button>
    <button className="icon-button" aria-label="离线模型管理" onClick={()=>setModels(true)}><HardDrive size={20}/></button>
   </div>
  </header>
 </>}
 <main className={isReader?'reader-main':'main-content'}>
 {!isReader&&<div className="topbar"><span><i className={offline?'status-dot':'status-dot ready'}/>{offline?'离线阅读':'本地就绪'}</span><div className="topbar-actions"><button type="button" className={update?'topbar-update ready':'topbar-update'} disabled={checkingUpdate} onClick={checkForUpdate}><RefreshCw size={14} className={checkingUpdate?'spin':''}/><span>{checkingUpdate?'检查中…':update?'发现新版本 · 点击更新':'检查更新'}</span></button></div></div>}
 {(screen==='home'||screen==='history')&&<>
 {screen==='home'?<>
  <section className="hero">
   <div className="hero-copy">
    <div className="page-kicker"><span/>繁體轉簡 · 本地閱讀</div>
    <h1>展卷见繁，<br/>落目成简。</h1>
    <p>拍下繁体书页，自动展平并原位覆以同色简体。</p>
    <div className="hero-actions">
     {modelReady?<>
      <button className="primary" disabled={importing} onClick={()=>{if(isMobileDevice())capture.current?.click();else setCamera(true);}}><CameraIcon size={18}/>拍照识别</button>
      <button className="secondary" disabled={importing} onClick={()=>upload.current?.click()}><ImagePlus size={18}/>{importing?'正在读取…':'从相册导入'}</button>
     </>:<button className="primary" onClick={()=>setModels(true)}><ArrowDownToLine size={18}/>准备离线模型</button>}
    </div>
    <div className="hero-footnote">本地离线运行 · 照片不离设备</div>
   </div>
   <div className="hero-colophon" aria-hidden="true">
    <span className="colophon-trad">繁</span>
    <i className="colophon-rule"/>
    <span className="colophon-simp">简</span>
    <span className="colophon-seal">紙頁</span>
   </div>
  </section>
 </>:<div className="history-heading">
  <button type="button" className="back-home" onClick={goHome}><ArrowLeft size={16}/>返回首页</button>
  <h1>我的阅读</h1>
  <p className="muted">手动保存在本机的书页，随时打开继续阅读。</p>
  {modelReady
   ?<button className="primary" onClick={()=>upload.current?.click()}><Plus size={18}/>导入新照片</button>
   :<button className="primary" onClick={()=>setModels(true)}><ArrowDownToLine size={18}/>准备离线模型</button>}
 </div>}
 {error&&<div role="alert" className="error global-error">{error}<button aria-label="关闭提示" onClick={()=>setError('')}><X size={17}/></button></div>}
 <section className="recent-section">
  <div className="section-heading"><h2>{screen==='history'?'阅读书架':'最近阅读'}<span>{recent.length.toString().padStart(2,'0')}</span></h2>{screen==='home'&&<button onClick={()=>{refresh();setScreen('history');}}>全部记录<ChevronRight size={16}/></button>}</div>
  {recent.length?<div className="reading-grid">{recent.map(r=><ReadingCard key={r.id} reading={r} onOpen={()=>openReading(r)} onDelete={async()=>{try{await deleteReading(r.id);refresh();notify('已删除这条本地记录');}catch{notify('删除失败，请重试');}}}/>)}</div>:modelReady?<div className="empty-records"><BookOpen size={24} strokeWidth={1.3}/><div><strong>还没有保存的阅读记录</strong><p>拍完识别后，点击右上角“保存”即可留在这里。</p></div><button aria-label="导入第一张照片" onClick={()=>upload.current?.click()}><Plus size={19}/></button></div>:<div className="empty-records"><BookOpen size={24} strokeWidth={1.3}/><div><strong>请先准备离线模型</strong><p>下载完成后即可拍照或从相册导入。</p></div><button aria-label="准备离线模型" onClick={()=>setModels(true)}><ArrowDownToLine size={17}/></button></div>}
 </section>
 <footer className="page-footer"><span>一页书，安然读。</span><button onClick={()=>setModels(true)}><span className={modelReady?'status-dot ready':'status-dot'}/>{modelReady?'离线模型已就绪':'准备离线模型'}<ArrowRight size={13}/></button></footer>
 </>}
 {screen==='processing'&&<section className="processing"><div className={error?'processing-symbol failed':'processing-symbol'}>{error?<BookOpen size={36}/>:<LoaderCircle className="spin" size={34} strokeWidth={1.5}/>}</div><h1>{error?'换个方式，再读一次':'正在自动处理与识别'}</h1><p aria-live="polite" role="status">{step}</p>{!error&&<progress max="1" value={progress}/>}<ol className="steps">{['矫正与增强','识别原始繁体','匹配原位简体'].map((s,i)=>{const done=progress>=[.34,.78,.96][i];const active=!done&&(i===0||(i===1&&progress>=.34)||(i===2&&progress>=.78));return <li key={s} className={done?'complete':active?'active':''}><span>{done?<Check size={13}/>:i+1}</span>{s}</li>;})}</ol>{error&&<p role="alert" className="error">{error}</p>}<div className="row-actions">{error&&prepared&&<button className="primary" onClick={()=>runPipeline(prepared,pendingOptions)}>重新尝试</button>}<button className="secondary" onClick={cancel}>返回首页</button></div><small><ShieldCheck size={14}/>照片与识别文字都不会上传</small></section>}
 {isReader&&<Reader reading={reading} saved={saved} onToggleShow={()=>setReading({...reading,showAnnotations:!reading.showAnnotations})} onViewChange={view=>setReading({...reading,view})} onBack={goHome} onSave={()=>save()} onReprocess={opts=>{const orig:PreparedImage={blob:reading.originalImage??reading.image,width:reading.originalWidth??reading.width,height:reading.originalHeight??reading.height,name:reading.name};void runPipeline(orig,opts);}} notify={notify}/>}
 </main>
 {camera&&<Camera onCapture={importFile} onClose={()=>setCamera(false)} onFallback={()=>{setCamera(false);capture.current?.click();}}/>}
 {models&&<ModelManager onClose={()=>{setModels(false);void refreshModelStatus();}}/>}
 {onboarding&&!models&&<ModelManager onboarding onClose={()=>{dismissOnboarding();void refreshModelStatus();}} onDismiss={dismissOnboarding}/>}
 {toast&&<div role="status" className="toast"><Check size={16}/>{toast}<button aria-label="关闭通知" onClick={()=>setToast('')}><X size={14}/></button></div>}
 {update&&<div className="update-banner">新版本已就绪。<button onClick={()=>update()}>更新</button><button aria-label="稍后更新" onClick={()=>setUpdate(undefined)}><X size={15}/></button></div>}
 </div>;
}
function ReadingCard({reading:r,onOpen,onDelete}:{reading:Reading;onOpen:()=>void;onDelete:()=>void}){const url=useBlobUrl(r.image);return <article className="reading-card"><button className="reading-thumbnail" onClick={onOpen}><img src={url} alt={r.name} loading="lazy"/><span>{`${r.annotations.filter(a=>a.visible&&!a.deleted).length} 处替换`}</span></button><div><button onClick={onOpen}><h3>{r.name}</h3><p>{new Date(r.updatedAt).toLocaleDateString('zh-CN')} · {r.lines.length} 行文字</p></button><button aria-label={`删除 ${r.name}`} className="icon-button" onClick={onDelete}><Trash2 size={16}/></button></div></article>;}
export default App;
