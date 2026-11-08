import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,ArrowRight,BookOpen,Camera as CameraIcon,Check,ChevronRight,CloudOff,HardDrive,ImagePlus,Leaf,LoaderCircle,Plus,ShieldCheck,Sparkles,Trash2,X} from 'lucide-react';
import {registerSW} from 'virtual:pwa-register';
import type {PreparedImage,Reading} from './types';
import {DEFAULT_STYLE} from './types';
import {prepareImage,resizedCanvas} from './image-processing/images';
import {CharacterAlignmentEngine} from './alignment/CharacterAlignmentEngine';
import {recognize} from './ocr/adapter';
import {listReadings,saveReading,deleteReading} from './storage/readings';
import {cacheStatus} from './ocr/model-cache';
import {Camera} from './camera/Camera';
import {Preprocess} from './ui/Preprocess';
import {Reader} from './ui/Reader';
import {ModelManager} from './ui/ModelManager';
import {createDemo} from './ui/demo';
import {useBlobUrl} from './ui/hooks';

type Screen='home'|'prepare'|'processing'|'reader'|'history';
function App(){
 const [screen,setScreen]=useState<Screen>('home'),[camera,setCamera]=useState(false),[models,setModels]=useState(false),[prepared,setPrepared]=useState<PreparedImage>(),[reading,setReading]=useState<Reading>();
 const [recent,setRecent]=useState<Reading[]>([]),[toast,setToast]=useState(''),[error,setError]=useState(''),[step,setStep]=useState(''),[progress,setProgress]=useState(0),[importing,setImporting]=useState(false),[modelReady,setModelReady]=useState(false),[offline,setOffline]=useState(!navigator.onLine),[update,setUpdate]=useState<(()=>void)>();
 const upload=useRef<HTMLInputElement>(null),capture=useRef<HTMLInputElement>(null),controller=useRef<AbortController>(null),taskId=useRef(0);
 const notify=(message:string)=>setToast(message);
 const refresh=()=>listReadings().then(setRecent).catch(()=>notify('此浏览器的本地记录不可用，仍可识别与导出。'));
 useEffect(()=>{refresh();cacheStatus().then(s=>setModelReady(s.ready)).catch(()=>{});
   const apply=registerSW({onNeedRefresh(){setUpdate(()=>()=>apply(true));},onOfflineReady(){notify('应用文件已缓存，可继续准备离线模型');}});
   const online=()=>setOffline(!navigator.onLine);window.addEventListener('online',online);window.addEventListener('offline',online);return()=>{controller.current?.abort();window.removeEventListener('online',online);window.removeEventListener('offline',online);};
 },[]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);
 const importFile=async(file?:File)=>{if(!file)return;setCamera(false);setImporting(true);setError('');try{setPrepared(await prepareImage(file));setScreen('prepare');}catch(e){setError((e as Error).message);}finally{setImporting(false);if(upload.current)upload.current.value='';if(capture.current)capture.current.value='';}};
 const save=async(r=reading)=>{if(!r)return;try{await saveReading({...r,updatedAt:Date.now()});notify('阅读记录已保存到本机');await refresh();}catch{notify('保存失败，可能空间不足。请先导出图片。');}};
 const goHome=async()=>{taskId.current++;controller.current?.abort();if(reading&&screen==='reader')await save(reading);setScreen('home');setError('');refresh();};
 const start=async(image:PreparedImage)=>{
  controller.current?.abort();const id=++taskId.current;const abort=new AbortController();controller.current=abort;setPrepared(image);setReading(undefined);setScreen('processing');setError('');setProgress(0);
  try{
   const lines=await recognize(image,abort.signal,(s,p)=>{if(taskId.current===id){setStep(s);if(p!==undefined)setProgress(p);}});abort.signal.throwIfAborted();
   let sampler:((p:{x:number;y:number})=>number|undefined)|undefined;
   const c=await resizedCanvas(image.blob,1600,2200000),ctx=c.getContext('2d',{willReadFrequently:true});
   if(ctx){const pixels=ctx.getImageData(0,0,c.width,c.height),sx=c.width/image.width,sy=c.height/image.height;sampler=p=>{const x=Math.round(p.x*sx),y=Math.round(p.y*sy);if(x<0||x>=pixels.width||y<0||y>=pixels.height)return;const i=(y*pixels.width+x)*4;return 1-(pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114)/255;};}
   const annotations=new CharacterAlignmentEngine().alignAll(lines,sampler);c.width=1;
   const now=Date.now(),r:Reading={id:crypto.randomUUID(),name:image.name,createdAt:now,updatedAt:now,image:image.blob,width:image.width,height:image.height,lines,annotations,style:{...DEFAULT_STYLE},view:{x:0,y:0,scale:0},showAnnotations:true};
   abort.signal.throwIfAborted();if(taskId.current!==id)return;setReading(r);setScreen('reader');setModelReady(true);
   await save(r);if(!lines.length)notify('未找到清晰文字，可调整照片后重新识别。');else if(!annotations.length)notify('已识别原文，未发现需要转换的繁体字。');
  }catch(e){if((e as Error).name!=='AbortError'&&taskId.current===id){setError((e as Error).message||'识别失败，请重试。');setStep('暂时没能读懂这张照片');}}
 };
 const cancel=()=>{taskId.current++;controller.current?.abort();setScreen('prepare');setError('');};
 const demo=async(vertical=false)=>{try{setReading(await createDemo(vertical));setScreen('reader');}catch(e){setError((e as Error).message);}};
 const isReader=screen==='reader'&&reading;
 return <div className={isReader?'app reading-mode':'app'}>
 <input ref={upload} data-testid="file-upload" className="sr-only" type="file" accept="image/*" onChange={e=>importFile(e.target.files?.[0])}/><input ref={capture} className="sr-only" type="file" accept="image/*" capture="environment" onChange={e=>importFile(e.target.files?.[0])}/>
 {!isReader&&<><aside className="sidebar"><button className="brand" onClick={goHome}><span className="brand-mark"><BookOpen size={25}/><i/></span><span>繁简旁注<small>FANJIAN NOTES</small></span></button><nav><button className={screen==='home'?'nav-item selected':'nav-item'} onClick={goHome}><BookOpen size={19}/>开始阅读<span>01</span></button><button className={screen==='history'?'nav-item selected':'nav-item'} onClick={()=>{refresh();setScreen('history');}}><HardDrive size={19}/>我的阅读<span>{recent.length.toString().padStart(2,'0')}</span></button><button className="nav-item" onClick={()=>setModels(true)}><ArrowDownToLine size={19}/>离线模型<small className={modelReady?'status-dot ready':'status-dot'}/></button></nav><div className="sidebar-bottom"><span className="private-icon"><ShieldCheck size={20}/></span><strong>只属于你的阅读</strong><p>照片不离开设备<br/>无需账号，安心使用</p><div className="sidebar-version"><span>本地优先 · PWA</span><span>v0.1</span></div></div></aside>
 <header className="mobile-header"><button className="brand" onClick={goHome}><span className="brand-mark"><BookOpen size={23}/><i/></span><span>繁简旁注</span></button><button className="icon-button" aria-label="离线模型管理" onClick={()=>setModels(true)}><HardDrive size={20}/></button></header></>}
 <main className={isReader?'reader-main':'main-content'}>
 {!isReader&&<div className="topbar"><span><i className={offline?'status-dot':'status-dot ready'}/>{offline?'离线阅读模式':'每一页，都值得读懂'}</span><button onClick={()=>setModels(true)}><ShieldCheck size={15}/><span>本地处理，隐私安心</span></button></div>}
 {(screen==='home'||screen==='history')&&<>
 {screen==='home'?<><div className="page-kicker"><span/>让阅读自然发生 <span className="kicker-en">A LITTLE HELP, A BETTER READ</span></div><section className="hero"><div className="hero-copy"><h1>看见原文。<br/>读懂<span className="serif-accent">每一字。</span><Leaf className="hero-leaf" size={34} strokeWidth={1.4}/></h1><p>拍下一页繁体，添上一层简体旁注。<br/>保留文字本来的样子，让阅读少一点距离。</p><div className="hero-actions"><button className="primary" disabled={importing} onClick={()=>setCamera(true)}><CameraIcon size={20}/>拍照识别<ArrowRight size={17}/></button><button className="secondary" disabled={importing} onClick={()=>upload.current?.click()}><ImagePlus size={19}/>{importing?'正在读取…':'从相册导入'}</button></div><div className="hero-footnote"><CloudOff size={14}/>无需云端 OCR<span>·</span>无需账号<span>·</span>照片留在本机</div></div><div className="hero-visual"><div className="example-tag"><span className="status-dot ready"/>简体旁注，让原文更好读</div><div className="paper-stack back"/><div className="paper-stack front"><div className="paper-heading">READ SLOWLY, SEE MORE</div><p className="paper-subtitle">生活裡的小美好</p><div className="paper-rule"/><div className="paper-text"><p><ruby>這<rt>这</rt></ruby>是一<ruby>個<rt>个</rt></ruby>美<ruby>麗<rt>丽</rt></ruby>的世界。</p><p>一<ruby>頁<rt>页</rt></ruby><ruby>書<rt>书</rt></ruby>，一杯茶，</p><p>把<ruby>時<rt>时</rt></ruby>光，留<ruby>給<rt>给</rt></ruby><ruby>閱<rt>阅</rt></ruby><ruby>讀<rt>读</rt></ruby>。</p></div><div className="paper-footer"><span>慢 读 生 活</span><span>— 01 —</span></div></div><div className="visual-note"><span className="note-line"/><small>原照片完整保留<br/><b>只给不同的字，加一点提示</b></small></div></div></section>
 <section className="benefits"><div><span><ScanIcon/></span><p><strong>拍下，就能读</strong><small>书页、路牌、菜单，一张照片即可</small></p></div><div><span><Sparkles size={21}/></span><p><strong>轻轻旁注，不改原文</strong><small>只标不同的字，随照片一起缩放</small></p></div><div><span><ShieldCheck size={21}/></span><p><strong>阅读，安心留在本机</strong><small>设备本地识别，缓存后支持离线</small></p></div></section>
 <section className="try-banner"><div className="try-icon">繁<span>简</span></div><div><h3>先翻开一页，感受旁注阅读</h3><p>不必上传照片，用示例体验缩放、纠错与导出。</p></div><button onClick={()=>demo()}>体验示例<ArrowRight size={16}/></button></section></>:<div className="history-heading"><p className="eyebrow">YOUR READING SHELF</p><h1>我的阅读</h1><p className="muted">留在设备里的照片，和你上次读到的地方。</p><button className="primary" onClick={()=>upload.current?.click()}><Plus size={18}/>导入新照片</button></div>}
 {error&&<div role="alert" className="error global-error">{error}<button aria-label="关闭提示" onClick={()=>setError('')}><X size={17}/></button></div>}
 <section className="recent-section"><div className="section-heading"><h2>{screen==='history'?'阅读书架':'最近阅读'}<span>{recent.length.toString().padStart(2,'0')}</span></h2>{screen==='home'&&<button onClick={()=>setScreen('history')}>全部记录<ChevronRight size={16}/></button>}</div>{recent.length?<div className="reading-grid">{recent.map(r=><ReadingCard key={r.id} reading={r} onOpen={()=>{setReading(r);setScreen('reader');}} onDelete={async()=>{try{await deleteReading(r.id);refresh();notify('已删除这条本地记录');}catch{notify('删除失败，请重试');}}}/>)}</div>:<div className="empty-records"><BookOpen size={27} strokeWidth={1.3}/><div><strong>你的下一页，从这里开始</strong><p>识别后的照片会出现在这里，随时接着读。</p></div><button aria-label="导入第一张照片" onClick={()=>upload.current?.click()}><Plus size={21}/></button></div>}</section>
 <footer className="page-footer"><span>保留原文的温度，让文字更容易亲近。</span><button onClick={()=>setModels(true)}><span className={modelReady?'status-dot ready':'status-dot'}/>{modelReady?'离线模型已缓存':'准备离线阅读'}<ArrowRight size={13}/></button></footer>
 </>}
 {screen==='prepare'&&prepared&&<Preprocess image={prepared} onBack={goHome} onStart={start}/>}
 {screen==='processing'&&<section className="processing"><div className={error?'processing-symbol failed':'processing-symbol'}>{error?<BookOpen size={40}/>:<LoaderCircle className="spin" size={40}/>}</div><p className="eyebrow">A MOMENT FOR YOUR WORDS</p><h1>{error?'换个方式，再读一次':'正在读懂这一页'}</h1><p aria-live="polite" role="status">{step}</p>{!error&&<progress max="1" value={progress}/>}<ol className="steps">{['准备本地模型','识别原始繁体','对齐简体旁注'].map((s,i)=><li key={s} className={progress>=[.5,.7,.94][i]?'complete':''}><span>{progress>=[.5,.7,.94][i]?<Check size={13}/>:i+1}</span>{s}</li>)}</ol>{error&&<p role="alert" className="error">{error}</p>}<div className="row-actions">{error&&prepared&&<button className="primary" onClick={()=>start(prepared)}>重新尝试</button>}<button className="secondary" onClick={cancel}>{error?'返回调整照片':'取消识别'}</button></div><small><ShieldCheck size={14}/>照片与识别文字都不会上传</small></section>}
 {isReader&&<Reader reading={reading} onChange={setReading} onBack={goHome} onSave={()=>save()} onRerun={()=>{setPrepared({blob:reading.image,width:reading.width,height:reading.height,name:reading.name});setScreen('prepare');}} notify={notify}/>}
 </main>
 {camera&&<Camera onCapture={importFile} onClose={()=>setCamera(false)} onFallback={()=>{setCamera(false);capture.current?.click();}}/>}
 {models&&<ModelManager onClose={()=>{setModels(false);cacheStatus().then(s=>setModelReady(s.ready)).catch(()=>{});}}/>}
 {toast&&<div role="status" className="toast"><Check size={16}/>{toast}<button aria-label="关闭通知" onClick={()=>setToast('')}><X size={14}/></button></div>}
 {update&&<div className="update-banner">新版本已就绪。请先保存阅读记录。<button onClick={()=>update()}>更新</button><button aria-label="稍后更新" onClick={()=>setUpdate(undefined)}><X size={15}/></button></div>}
 </div>;
}
function ReadingCard({reading:r,onOpen,onDelete}:{reading:Reading;onOpen:()=>void;onDelete:()=>void}){const url=useBlobUrl(r.image);return <article className="reading-card"><button className="reading-thumbnail" onClick={onOpen}><img src={url} alt={r.name} loading="lazy"/><span>{r.demo?'演示记录':`${r.annotations.filter(a=>a.visible&&!a.deleted).length} 个旁注`}</span></button><div><button onClick={onOpen}><h3>{r.name}</h3><p>{new Date(r.updatedAt).toLocaleDateString('zh-CN')} · {r.lines.length} 行文字</p></button><button aria-label={`删除 ${r.name}`} className="icon-button" onClick={onDelete}><Trash2 size={16}/></button></div></article>;}
function ScanIcon(){return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 9h10M9 6v12M15 6v12M7 15h10"/></svg>;}
export default App;
