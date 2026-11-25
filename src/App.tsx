import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,ArrowLeft,ArrowRight,BookOpen,Camera as CameraIcon,Check,ChevronRight,CloudOff,HardDrive,ImagePlus,Leaf,LoaderCircle,Plus,ShieldCheck,Sparkles,Trash2,X} from 'lucide-react';
import {registerSW} from 'virtual:pwa-register';
import type {PreparedImage,Reading} from './types';
import {DEFAULT_STYLE} from './types';
import {prepareImage} from './image-processing/images';
import {ALIGNMENT_VERSION} from './alignment/CharacterAlignmentEngine';
import {analyzeImageLines,autoPreprocessImage,improveReading,type PreprocessOptions} from './image-processing/analyze';
import {recognize} from './ocr/adapter';
import {listReadings,saveReading,deleteReading} from './storage/readings';
import {cacheStatus} from './ocr/model-cache';
import {Camera} from './camera/Camera';
import {Reader} from './ui/Reader';
import {ModelManager} from './ui/ModelManager';
import {useBlobUrl} from './ui/hooks';

type Screen='home'|'processing'|'reader'|'history';
const ONBOARDING_KEY='fanjian-onboarding-dismissed';

function App(){
 const [screen,setScreen]=useState<Screen>('home'),[camera,setCamera]=useState(false),[models,setModels]=useState(false),[onboarding,setOnboarding]=useState(false);
 const [prepared,setPrepared]=useState<PreparedImage>(),[pendingOptions,setPendingOptions]=useState<PreprocessOptions>({correct:true,enhance:true});
 const [reading,setReading]=useState<Reading>(),[saved,setSaved]=useState(false);
 const latestReading=useRef(reading);latestReading.current=reading;
 const [recent,setRecent]=useState<Reading[]>([]),[toast,setToast]=useState(''),[error,setError]=useState(''),[step,setStep]=useState(''),[progress,setProgress]=useState(0),[importing,setImporting]=useState(false),[modelReady,setModelReady]=useState(false),[offline,setOffline]=useState(!navigator.onLine),[update,setUpdate]=useState<(()=>void)>();
 const upload=useRef<HTMLInputElement>(null),capture=useRef<HTMLInputElement>(null),controller=useRef<AbortController>(null),taskId=useRef(0);
 const notify=(message:string)=>setToast(message);
 const refresh=()=>listReadings().then(setRecent).catch(()=>notify('此浏览器的本地记录不可用，仍可识别与导出。'));

 useEffect(()=>{
  refresh();
  cacheStatus().then(s=>{
   setModelReady(s.ready);
   let dismissed=false;
   try{dismissed=!!localStorage.getItem(ONBOARDING_KEY);}catch{}
   if(!s.ready&&!dismissed)setOnboarding(true);
  }).catch(()=>{});
  const apply=registerSW({onNeedRefresh(){setUpdate(()=>()=>apply(true));},onOfflineReady(){notify('应用文件已缓存，可继续准备离线模型');}});
  const online=()=>setOffline(!navigator.onLine);window.addEventListener('online',online);window.addEventListener('offline',online);
  return()=>{controller.current?.abort();window.removeEventListener('online',online);window.removeEventListener('offline',online);};
 },[]);

 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);

 const runPipeline=async(original:PreparedImage,options:PreprocessOptions)=>{
  controller.current?.abort();
  const id=++taskId.current,abort=new AbortController();controller.current=abort;
  setPrepared(original);setPendingOptions(options);setReading(undefined);setSaved(false);setScreen('processing');setError('');setProgress(0);
  try{
   const processed=await autoPreprocessImage(original,options,abort.signal,(s,p)=>{if(taskId.current===id){setStep(s);if(p!==undefined)setProgress(p);}});
   abort.signal.throwIfAborted();
   const lines=await recognize(processed,abort.signal,(s,p)=>{if(taskId.current===id){setStep(s);if(p!==undefined)setProgress(.26+p*.66);}});
   abort.signal.throwIfAborted();
   if(taskId.current===id){setStep('匹配字形与采样纸张底色');setProgress(.94);}
   const result=await analyzeImageLines(processed,lines,abort.signal,s=>{if(taskId.current===id)setStep(s);});
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
   setReading(r);setSaved(false);setScreen('reader');setModelReady(true);
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
   <button className="brand" onClick={goHome}><span className="brand-mark"><BookOpen size={25}/><i/></span><span>繁简旁注<small>FANJIAN NOTES</small></span></button>
   <nav>
    <button className={screen==='home'?'nav-item selected':'nav-item'} onClick={goHome}><BookOpen size={19}/>开始阅读<span>01</span></button>
    <button className={screen==='history'?'nav-item selected':'nav-item'} onClick={()=>{refresh();setScreen('history');}}><HardDrive size={19}/>我的阅读<span>{recent.length.toString().padStart(2,'0')}</span></button>
    <button className="nav-item" onClick={()=>setModels(true)}><ArrowDownToLine size={19}/>离线模型<small className={modelReady?'status-dot ready':'status-dot'}/></button>
   </nav>
   <div className="sidebar-bottom"><span className="private-icon"><ShieldCheck size={20}/></span><strong>只属于你的阅读</strong><p>照片不离开设备<br/>无需账号，安心使用</p><div className="sidebar-version"><span>本地优先 · PWA</span><span>v0.1</span></div></div>
  </aside>
  <header className="mobile-header">
   {screen==='history'?<button className="icon-button mobile-back" aria-label="返回首页" onClick={goHome}><ArrowLeft size={21}/></button>:null}
   <button className="brand" onClick={goHome}><span className="brand-mark"><BookOpen size={23}/><i/></span><span>{screen==='history'?'我的阅读':'繁简旁注'}</span></button>
   <button className="icon-button" aria-label="离线模型管理" onClick={()=>setModels(true)}><HardDrive size={20}/></button>
  </header>
 </>}
 <main className={isReader?'reader-main':'main-content'}>
 {!isReader&&<div className="topbar"><span><i className={offline?'status-dot':'status-dot ready'}/>{offline?'离线阅读模式':'每一页，都值得读懂'}</span><button onClick={()=>setModels(true)}><ShieldCheck size={15}/><span>本地处理，隐私安心</span></button></div>}
 {(screen==='home'||screen==='history')&&<>
 {screen==='home'?<>
  <div className="page-kicker"><span/>让阅读自然发生 <span className="kicker-en">A LITTLE HELP, A BETTER READ</span></div>
  <section className="hero">
   <div className="hero-copy">
    <h1>看见原文。<br/>读懂<span className="serif-accent">每一字。</span><Leaf className="hero-leaf" size={34} strokeWidth={1.4}/></h1>
    <p>拍下一页繁体，原位替换为同色简体。<br/>自动矫正与清晰增强，让纸页阅读毫无负担。</p>
    <div className="hero-actions">
     <button className="primary" disabled={importing} onClick={()=>setCamera(true)}><CameraIcon size={20}/>拍照识别<ArrowRight size={17}/></button>
     <button className="secondary" disabled={importing} onClick={()=>upload.current?.click()}><ImagePlus size={19}/>{importing?'正在读取…':'从相册导入'}</button>
    </div>
    <div className="hero-footnote"><CloudOff size={14}/>无需云端 OCR<span>·</span>无需账号<span>·</span>照片留在本机</div>
   </div>
   <div className="hero-visual">
    <div className="example-tag"><span className="status-dot ready"/>同色同位，简体直接融入原页</div>
    <div className="paper-stack back"/>
    <div className="paper-stack front">
     <div className="paper-heading">READ SLOWLY, SEE MORE</div>
     <p className="paper-subtitle">生活里的小美好</p>
     <div className="paper-rule"/>
     <div className="paper-text"><p>这是一个美丽的世界。</p><p>一页书，一杯茶，</p><p>把时光，留给阅读。</p></div>
     <div className="paper-footer"><span>慢 读 生 活</span><span>— 01 —</span></div>
    </div>
    <div className="visual-note"><span className="note-line"/><small>底色与墨色自适应<br/><b>直接看，不打断视线</b></small></div>
   </div>
  </section>
  <section className="benefits">
   <div><span><ScanIcon/></span><p><strong>拍下，自动出图</strong><small>拍照或选图后自动矫正、锐化并识别</small></p></div>
   <div><span><Sparkles size={21}/></span><p><strong>原位覆盖，自然融合</strong><small>自动匹配纸面底色与墨色，字号清晰</small></p></div>
   <div><span><ShieldCheck size={21}/></span><p><strong>按需保存，留在本机</strong><small>不默认占用空间，想留再保存</small></p></div>
  </section>
 </>:<div className="history-heading">
  <button type="button" className="back-home" onClick={goHome}><ArrowLeft size={16}/>返回首页</button>
  <p className="eyebrow">YOUR READING SHELF</p>
  <h1>我的阅读</h1>
  <p className="muted">手动保存在本机的书页，随时打开继续阅读。</p>
  <button className="primary" onClick={()=>upload.current?.click()}><Plus size={18}/>导入新照片</button>
 </div>}
 {error&&<div role="alert" className="error global-error">{error}<button aria-label="关闭提示" onClick={()=>setError('')}><X size={17}/></button></div>}
 <section className="recent-section">
  <div className="section-heading"><h2>{screen==='history'?'阅读书架':'最近阅读'}<span>{recent.length.toString().padStart(2,'0')}</span></h2>{screen==='home'&&<button onClick={()=>{refresh();setScreen('history');}}>全部记录<ChevronRight size={16}/></button>}</div>
  {recent.length?<div className="reading-grid">{recent.map(r=><ReadingCard key={r.id} reading={r} onOpen={()=>openReading(r)} onDelete={async()=>{try{await deleteReading(r.id);refresh();notify('已删除这条本地记录');}catch{notify('删除失败，请重试');}}}/>)}</div>:<div className="empty-records"><BookOpen size={27} strokeWidth={1.3}/><div><strong>还没有保存的阅读记录</strong><p>拍完识别后，点击右上角“保存”即可留在这里。</p></div><button aria-label="导入第一张照片" onClick={()=>upload.current?.click()}><Plus size={21}/></button></div>}
 </section>
 <footer className="page-footer"><span>保留原文的温度，让文字更容易亲近。</span><button onClick={()=>setModels(true)}><span className={modelReady?'status-dot ready':'status-dot'}/>{modelReady?'离线模型已缓存':'准备离线阅读'}<ArrowRight size={13}/></button></footer>
 </>}
 {screen==='processing'&&<section className="processing"><div className={error?'processing-symbol failed':'processing-symbol'}>{error?<BookOpen size={40}/>:<LoaderCircle className="spin" size={40}/>}</div><p className="eyebrow">A MOMENT FOR YOUR WORDS</p><h1>{error?'换个方式，再读一次':'正在自动处理与识别'}</h1><p aria-live="polite" role="status">{step}</p>{!error&&<progress max="1" value={progress}/>}<ol className="steps">{['矫正与增强','识别原始繁体','匹配原位简体'].map((s,i)=><li key={s} className={progress>=[.28,.75,.94][i]?'complete':''}><span>{progress>=[.28,.75,.94][i]?<Check size={13}/>:i+1}</span>{s}</li>)}</ol>{error&&<p role="alert" className="error">{error}</p>}<div className="row-actions">{error&&prepared&&<button className="primary" onClick={()=>runPipeline(prepared,pendingOptions)}>重新尝试</button>}<button className="secondary" onClick={cancel}>返回首页</button></div><small><ShieldCheck size={14}/>照片与识别文字都不会上传</small></section>}
 {isReader&&<Reader reading={reading} saved={saved} onToggleShow={()=>setReading({...reading,showAnnotations:!reading.showAnnotations})} onViewChange={view=>setReading({...reading,view})} onBack={goHome} onSave={()=>save()} onReprocess={opts=>{const orig:PreparedImage={blob:reading.originalImage??reading.image,width:reading.originalWidth??reading.width,height:reading.originalHeight??reading.height,name:reading.name};void runPipeline(orig,opts);}} notify={notify}/>}
 </main>
 {camera&&<Camera onCapture={importFile} onClose={()=>setCamera(false)} onFallback={()=>{setCamera(false);capture.current?.click();}}/>}
 {models&&<ModelManager onClose={()=>{setModels(false);cacheStatus().then(s=>setModelReady(s.ready)).catch(()=>{});}}/>}
 {onboarding&&!models&&<ModelManager onboarding onClose={()=>{dismissOnboarding();cacheStatus().then(s=>setModelReady(s.ready)).catch(()=>{});}} onDismiss={dismissOnboarding}/>}
 {toast&&<div role="status" className="toast"><Check size={16}/>{toast}<button aria-label="关闭通知" onClick={()=>setToast('')}><X size={14}/></button></div>}
 {update&&<div className="update-banner">新版本已就绪。<button onClick={()=>update()}>更新</button><button aria-label="稍后更新" onClick={()=>setUpdate(undefined)}><X size={15}/></button></div>}
 </div>;
}
function ReadingCard({reading:r,onOpen,onDelete}:{reading:Reading;onOpen:()=>void;onDelete:()=>void}){const url=useBlobUrl(r.image);return <article className="reading-card"><button className="reading-thumbnail" onClick={onOpen}><img src={url} alt={r.name} loading="lazy"/><span>{`${r.annotations.filter(a=>a.visible&&!a.deleted).length} 处替换`}</span></button><div><button onClick={onOpen}><h3>{r.name}</h3><p>{new Date(r.updatedAt).toLocaleDateString('zh-CN')} · {r.lines.length} 行文字</p></button><button aria-label={`删除 ${r.name}`} className="icon-button" onClick={onDelete}><Trash2 size={16}/></button></div></article>;}
function ScanIcon(){return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 9h10M9 6v12M15 6v12M7 15h10"/></svg>;}
export default App;
