import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowLeft,Crop as CropIcon,Eye,LoaderCircle,Maximize2,RotateCw,ScanLine,Sparkles,SunMedium,Undo2} from 'lucide-react';
import type {PreparedImage} from '../types';
import {loadImage,rotatedSize,transformImage,type Crop} from '../image-processing/images';
import {detectImageSkew} from '../image-processing/analyze';
import {rectifyImage} from '../image-processing/unwarp';
import {cloneCorners,DEFAULT_CORNERS,detectImageDocumentQuad,isValidQuad,rectifyPerspective,type Corners} from '../image-processing/perspective';
import {enhanceDocumentImage} from '../image-processing/enhance';
import {quadPoint} from '../alignment/geometry';
import {useBlobUrl} from './hooks';

type CropHandle='left'|'right'|'top'|'bottom'|'tl'|'tr'|'br'|'bl';

export function Preprocess({image:original,onBack,onStart}:{image:PreparedImage;onBack:()=>void;onStart:(image:PreparedImage)=>void}){
 const [history,setHistory]=useState<PreparedImage[]>([]),[currentImage,setCurrentImage]=useState<PreparedImage>();
 const [rectifying,setRectifying]=useState(false),[rectifyInfo,setRectifyInfo]=useState('');
 const [enhancing,setEnhancing]=useState(false);
 const image=currentImage??original;
 const rectifyAbort=useRef<AbortController>(null);useEffect(()=>()=>rectifyAbort.current?.abort(),[]);
 const [turns,setTurns]=useState(0),[angle,setAngle]=useState(0),[auto,setAuto]=useState(true),[analyzing,setAnalyzing]=useState(true),[info,setInfo]=useState('正在估计文字方向…');
 const [crop,setCrop]=useState<Crop>({left:0,top:0,right:1,bottom:1}),[cropping,setCropping]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [perspective,setPerspective]=useState(false),[perspectiveBase,setPerspectiveBase]=useState<PreparedImage|null>(null),[corners,setCorners]=useState<Corners>(()=>cloneCorners(DEFAULT_CORNERS)),[detectingQuad,setDetectingQuad]=useState(false),[perspectiveInfo,setPerspectiveInfo]=useState('');
 const [activeCorner,setActiveCorner]=useState<number|null>(null),[activeCropHandle,setActiveCropHandle]=useState<CropHandle|null>(null);
 const [comparing,setComparing]=useState(false),[adjustingAngle,setAdjustingAngle]=useState(false);

 const activeImage=perspective?(perspectiveBase??image):image;
 const abort=useRef<AbortController>(null),url=useBlobUrl(activeImage.blob),originalUrl=useBlobUrl(original.blob);
 const holder=useRef<HTMLDivElement>(null),svgRef=useRef<SVGSVGElement>(null),loupeRef=useRef<HTMLCanvasElement>(null),decodedRef=useRef<HTMLImageElement|null>(null);
 const [available,setAvailable]=useState({width:1,height:1});

 useLayoutEffect(()=>{const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setAvailable({width:r.width,height:r.height});});observer.observe(holder.current!);return()=>observer.disconnect();},[]);

 useEffect(()=>{
  let cancelled=false;
  loadImage(activeImage.blob).then(img=>{if(!cancelled)decodedRef.current=img;}).catch(()=>{if(!cancelled)decodedRef.current=null;});
  return()=>{cancelled=true;};
 },[activeImage.blob]);

 const stop=()=>{abort.current?.abort();setAnalyzing(false);};

 const straighten=async(useCrop=false)=>{
  abort.current?.abort();const controller=new AbortController();abort.current=controller;setAnalyzing(true);setError('');
  try{
   const activeCrop=useCrop?crop:{left:0,top:0,right:1,bottom:1};
   const source=await transformImage(image,turns,activeCrop);controller.signal.throwIfAborted();
   const result=await detectImageSkew(source.blob,controller.signal);controller.signal.throwIfAborted();
   if(result.confidence>=.35){setAngle(result.angle);setInfo(`${result.direction==='vertical'?'竖排':'横排'}文字 · ${result.angle?`已校正 ${result.angle>0?'+':''}${result.angle.toFixed(1)}°`:'已基本对齐'}`);}
   else setInfo('方向不够明确，保留当前角度；可以手动微调。');
  }catch(e){if((e as Error).name!=='AbortError'){setInfo('自动分析未完成，仍可手动调整或直接识别。');setError((e as Error).message);}}
  finally{if(!controller.signal.aborted)setAnalyzing(false);}
 };

 useEffect(()=>{if(auto&&!perspective)void straighten();return()=>abort.current?.abort();},[image.blob,turns,auto,perspective]);

 const previewImage=comparing?original:activeImage;
 const previewUrl=comparing?originalUrl:url;
 const degrees=comparing||perspective?0:turns*90+angle;
 const {width:w,height:h}=rotatedSize(previewImage.width,previewImage.height,degrees);
 const scale=Math.max(.001,Math.min(available.width/w,available.height/h));
 const x=crop.left*w,y=crop.top*h,cw=(crop.right-crop.left)*w,ch=(crop.bottom-crop.top)*h;

 const pushHistory=(next:PreparedImage)=>{
  setHistory(prev=>[...prev,image]);
  setCurrentImage(next);
  setTurns(0);setAngle(0);setCrop({left:0,top:0,right:1,bottom:1});
  setCropping(false);setPerspective(false);setPerspectiveBase(null);
  setAuto(true);setAnalyzing(true);
 };

 const undoTransform=()=>{
  stop();
  const prev=history[history.length-1];
  setHistory(h=>h.slice(0,-1));
  setCurrentImage(prev&&prev!==original?prev:undefined);
  setTurns(0);setAngle(0);setCrop({left:0,top:0,right:1,bottom:1});
  setCropping(false);setPerspective(false);setPerspectiveBase(null);
  setAuto(true);setAnalyzing(true);
  setRectifyInfo(history.length>1?'已撤回上一步照片调整。':'已恢复导入的照片。');
 };

 const run=async()=>{setBusy(true);try{onStart(await transformImage(image,turns,crop,angle));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};

 const correctPage=async()=>{
  stop();setAuto(false);setCropping(false);setPerspective(false);setRectifying(true);setError('');
  const controller=new AbortController();rectifyAbort.current=controller;
  try{
   const source=await transformImage(image,turns,crop,angle),result=await rectifyImage(source,controller.signal,setRectifyInfo);
   controller.signal.throwIfAborted();
   pushHistory(result);
   setRectifyInfo('已按书页形状展平，请检查预览；不满意可撤销。');
  }catch(e){
   if((e as Error).name!=='AbortError')setError((e as Error).message);
   else setRectifyInfo('已取消展平，原照片已保留。');
  }finally{if(rectifyAbort.current===controller)setRectifying(false);}
 };

 const enhanceClarity=async()=>{
  stop();setEnhancing(true);setError('');
  try{
   const base=turns||Math.abs(angle)>=.05||crop.left>0||crop.top>0||crop.right<1||crop.bottom<1
    ?await transformImage(image,turns,crop,angle):image;
   const result=await enhanceDocumentImage(base);
   pushHistory(result);
   setRectifyInfo('已增强书页对比度并减弱阴影，不满意可撤销。');
  }catch(e){setError((e as Error).message);}
  finally{setEnhancing(false);}
 };

 const enterPerspective=async()=>{
  if(perspective){setPerspective(false);setPerspectiveBase(null);return;}
  stop();setCropping(false);setError('');setPerspective(true);setDetectingQuad(true);setPerspectiveInfo('正在识别书页边缘…');
  try{
   const base=turns||Math.abs(angle)>=.05?await transformImage(image,turns,{left:0,top:0,right:1,bottom:1},angle):image;
   setPerspectiveBase(base===image?null:base);
   const detected=await detectImageDocumentQuad(base.blob);
   setCorners(detected.corners);
   setPerspectiveInfo(detected.detected?'已自动框选书页四角，可拖动微调':'拖动四个角点对准书页边缘，支持放大镜精细定位');
  }catch{
   setCorners(cloneCorners(DEFAULT_CORNERS));
   setPerspectiveInfo('拖动四个角点对准书页边缘，然后点击“应用透视拉正”');
  }finally{setDetectingQuad(false);}
 };

 const redetectQuad=async()=>{
  setDetectingQuad(true);setPerspectiveInfo('正在重新框选书页…');
  try{
   const detected=await detectImageDocumentQuad(activeImage.blob);
   setCorners(detected.corners);
   setPerspectiveInfo(detected.detected?'已重新识别书页四角':'未发现明显深色边框，请手动拖动四角');
  }finally{setDetectingQuad(false);}
 };

 const applyPerspective=async()=>{
  if(!isValidQuad(corners,.005)){setError('四个角点不能交叉或过近，请调整后再试。');return;}
  setBusy(true);setError('');
  try{
   const result=await rectifyPerspective(activeImage,corners);
   pushHistory(result);
   setRectifyInfo('已完成四角透视拉正，请检查倾角与预览。');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };

 const toSvgNormalized=(e:ReactPointerEvent)=>{
  const el=svgRef.current;if(!el)return {x:.5,y:.5};
  const ctm=el.getScreenCTM();if(!ctm)return {x:.5,y:.5};
  const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(ctm.inverse());
  return {x:Math.max(0,Math.min(1,pt.x/w)),y:Math.max(0,Math.min(1,pt.y/h))};
 };

 useEffect(()=>{
  if(activeCorner===null||!loupeRef.current||!decodedRef.current)return;
  const canvas=loupeRef.current,ctx=canvas.getContext('2d');if(!ctx)return;
  const img=decodedRef.current,size=canvas.width,zoom=2.5,srcSpan=size/zoom;
  const px=corners[activeCorner].x*activeImage.width,py=corners[activeCorner].y*activeImage.height;
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle='#1b2c1f';ctx.fillRect(0,0,size,size);
  ctx.drawImage(img,px-srcSpan/2,py-srcSpan/2,srcSpan,srcSpan,0,0,size,size);
  ctx.strokeStyle='#dfe8c7';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(size/2,0);ctx.lineTo(size/2,size);ctx.moveTo(0,size/2);ctx.lineTo(size,size/2);ctx.stroke();
  ctx.beginPath();ctx.arc(size/2,size/2,5,0,Math.PI*2);ctx.stroke();
 },[activeCorner,corners,activeImage.width,activeImage.height]);

 const onSvgPointerMove=(e:ReactPointerEvent)=>{
  if(activeCorner!==null){
   const p=toSvgNormalized(e);
   setCorners(prev=>prev.map((c,i)=>i===activeCorner?p:c) as Corners);
   return;
  }
  if(activeCropHandle){
   const p=toSvgNormalized(e),minSpan=.1;
   setCrop(prev=>{
    const next={...prev};
    if(activeCropHandle==='left'||activeCropHandle==='tl'||activeCropHandle==='bl')next.left=Math.min(prev.right-minSpan,Math.max(0,+(p.x).toFixed(3)));
    if(activeCropHandle==='right'||activeCropHandle==='tr'||activeCropHandle==='br')next.right=Math.max(prev.left+minSpan,Math.min(1,+(p.x).toFixed(3)));
    if(activeCropHandle==='top'||activeCropHandle==='tl'||activeCropHandle==='tr')next.top=Math.min(prev.bottom-minSpan,Math.max(0,+(p.y).toFixed(3)));
    if(activeCropHandle==='bottom'||activeCropHandle==='bl'||activeCropHandle==='br')next.bottom=Math.max(prev.top+minSpan,Math.min(1,+(p.y).toFixed(3)));
    return next;
   });
  }
 };

 const endDrag=()=>{setActiveCorner(null);setActiveCropHandle(null);};

 const quadPx=corners.map(c=>({x:c.x*w,y:c.y*h})) as Corners;
 const quadValid=isValidQuad(corners,.005);
 const hasChanges=history.length>0||Math.abs(angle)>=.1||turns!==0;
 const gridLines=[.25,.5,.75];
 const showStraightenGrid=!comparing&&!perspective&&!cropping&&(adjustingAngle||Math.abs(angle)>=.1);
 const handleR=Math.max(6,11/scale),hitR=Math.max(12,22/scale),strokeW=2/Math.max(scale,.001);

 const nudgeAngle=(delta:number)=>{
  stop();setAuto(false);
  setAngle(a=>{
   const next=Math.max(-20,Math.min(20,Math.round((a+delta)*10)/10));
   setInfo('手动微调；以预览中的文字为准。');
   return next;
  });
 };

 return <section className="workspace preprocess"><header className="work-header"><button className="icon-button" aria-label="返回首页" onClick={onBack}><ArrowLeft size={20}/></button><div><h2>准备这张照片</h2><p>先拉正与展平书页，再识别与定位</p></div></header>
 <div className="preprocess-stage">
  <div className="preprocess-image" ref={holder}>
   <svg ref={svgRef} aria-label="待识别照片与裁剪区域" viewBox={`0 0 ${w} ${h}`} width={w*scale} height={h*scale}
    className={cropping||perspective?'interactive-svg':''}
    onPointerMove={onSvgPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
    <image href={previewUrl} width={previewImage.width} height={previewImage.height} transform={`translate(${w/2} ${h/2}) rotate(${degrees}) translate(${-previewImage.width/2} ${-previewImage.height/2})`}/>
    {showStraightenGrid&&<g pointerEvents="none" stroke="#dfe8c7" strokeOpacity={adjustingAngle?.75:.4} strokeWidth={strokeW*.75} strokeDasharray={`${6/scale} ${4/scale}`}>
     {gridLines.map(t=><line key={`gx-${t}`} x1={w*t} y1={0} x2={w*t} y2={h}/>)}
     {gridLines.map(t=><line key={`gy-${t}`} x1={0} y1={h*t} x2={w} y2={h*t}/>)}
    </g>}
    {!comparing&&!perspective&&<>
     <path fill="#0b1a18aa" fillRule="evenodd" d={`M0 0H${w}V${h}H0Z M${x} ${y}H${x+cw}V${y+ch}H${x}Z`}/>
     <rect x={x} y={y} width={cw} height={ch} stroke="#dfe8c7" strokeWidth={strokeW} fill="none"/>
     {cropping&&<g className="crop-handles">
      {([
       ['tl',x,y],['tr',x+cw,y],['br',x+cw,y+ch],['bl',x,y+ch],
       ['left',x,y+ch/2],['right',x+cw,y+ch/2],['top',x+cw/2,y],['bottom',x+cw/2,y+ch]
      ] as [CropHandle,number,number][]).map(([key,hx,hy])=><g key={key} style={{cursor:'grab'}}
       onPointerDown={e=>{e.stopPropagation();svgRef.current?.setPointerCapture(e.pointerId);setActiveCropHandle(key);}}>
       <circle cx={hx} cy={hy} r={hitR} fill="transparent"/>
       <circle cx={hx} cy={hy} r={handleR*.8} fill="#fffdf4" stroke="#285745" strokeWidth={strokeW}/>
      </g>)}
     </g>}
    </>}
    {!comparing&&perspective&&<g className="perspective-overlay">
     <path fill="#0b1a18aa" fillRule="evenodd" d={`M0 0H${w}V${h}H0Z M${quadPx[0].x} ${quadPx[0].y}L${quadPx[1].x} ${quadPx[1].y}L${quadPx[2].x} ${quadPx[2].y}L${quadPx[3].x} ${quadPx[3].y}Z`}/>
     {[1/3,2/3].map(t=>{
      const top=quadPoint(quadPx,t,0),bot=quadPoint(quadPx,t,1),left=quadPoint(quadPx,0,t),right=quadPoint(quadPx,1,t);
      return <g key={t} stroke="#dfe8c780" strokeWidth={strokeW*.65} strokeDasharray={`${5/scale} ${4/scale}`} pointerEvents="none">
       <line x1={top.x} y1={top.y} x2={bot.x} y2={bot.y}/>
       <line x1={left.x} y1={left.y} x2={right.x} y2={right.y}/>
      </g>;
     })}
     <polygon points={quadPx.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={quadValid?'#dfe8c7':'#e8946b'} strokeWidth={strokeW}/>
     {quadPx.map((p,idx)=><g key={idx} data-testid={`perspective-handle-${idx}`} style={{cursor:'grab'}}
      onPointerDown={e=>{e.stopPropagation();svgRef.current?.setPointerCapture(e.pointerId);setActiveCorner(idx);}}>
      <circle cx={p.x} cy={p.y} r={hitR} fill="transparent"/>
      <circle cx={p.x} cy={p.y} r={handleR} fill={activeCorner===idx?'#c5d5a3':'#fffdf4'} stroke="#285745" strokeWidth={strokeW}/>
     </g>)}
    </g>}
   </svg>
  </div>
  {activeCorner!==null&&<canvas ref={loupeRef} width={112} height={112} className={`perspective-loupe ${corners[activeCorner].x>.5?'left':'right'}`} aria-hidden="true"/>}
  {hasChanges&&!rectifying&&!enhancing&&!perspective&&<button type="button" className="compare-pill"
   onPointerDown={()=>setComparing(true)} onPointerUp={()=>setComparing(false)} onPointerCancel={()=>setComparing(false)} onPointerLeave={()=>setComparing(false)}>
   <Eye size={14}/>{comparing?'正在查看原图':'按住对比原图'}
  </button>}
 </div>

 <div className="page-rectification">
  <button className="secondary" disabled={rectifying||enhancing||analyzing||busy||perspective} onClick={correctPage}><Sparkles size={17}/>矫正透视与弯曲</button>
  {history.length>0&&<button className="secondary" disabled={rectifying||enhancing||busy} onClick={undoTransform}><Undo2 size={16}/>撤销照片矫正</button>}
  {rectifying&&<button className="secondary" onClick={()=>rectifyAbort.current?.abort()}>取消展平</button>}
  <p role="status">{rectifying?<><LoaderCircle size={14} className="spin"/>{rectifyInfo||'正在准备本地展平…'}</>:rectifyInfo||'支持自动 ±20° 拉直、四角透视、去阴影增强与 UVDoc 曲面展平（首次额外下载 30.2 MiB）。'}</p>
 </div>

 <fieldset disabled={rectifying||enhancing} className="preprocess-fields">
  <div className="preprocess-tools">
   <button className="secondary" disabled={busy||perspective} onClick={()=>{setAnalyzing(auto);setTurns((turns+1)%4);setAngle(0);setCrop({left:0,top:0,right:1,bottom:1});}}><RotateCw size={16}/>旋转 90°</button>
   <button className={`secondary ${cropping?'active':''}`} disabled={busy||perspective} onClick={()=>setCropping(!cropping)}><CropIcon size={16}/>裁剪边缘</button>
   <button className={`secondary ${perspective?'active':''}`} disabled={busy} onClick={enterPerspective}><Maximize2 size={16}/>四角透视</button>
   <button className="secondary" disabled={busy||perspective} onClick={enhanceClarity}>{enhancing?<LoaderCircle size={15} className="spin"/>:<SunMedium size={16}/>}去阴影增强</button>
   <span>{image.width} × {image.height}</span>
  </div>

  {perspective&&<div className="perspective-panel">
   <p role="status">{detectingQuad?<><LoaderCircle size={14} className="spin"/> {perspectiveInfo}</>:perspectiveInfo}</p>
   <div className="perspective-actions">
    <button className="secondary small" disabled={busy||detectingQuad} onClick={redetectQuad}>自动框选书页</button>
    <button className="secondary small" disabled={busy} onClick={()=>setCorners(cloneCorners(DEFAULT_CORNERS))}>重置四角</button>
    <button className="secondary small" disabled={busy} onClick={()=>{setPerspective(false);setPerspectiveBase(null);}}>取消</button>
    <button className="primary small" disabled={busy||!quadValid} onClick={applyPerspective}>应用透视拉正</button>
   </div>
  </div>}

  {!perspective&&<div className="straighten-controls">
   <div>
    <label className="check-field"><input type="checkbox" checked={auto} onChange={e=>{stop();setAnalyzing(e.target.checked);setAuto(e.target.checked);}}/>自动校正倾角</label>
    <button className="secondary small" disabled={analyzing||busy} onClick={()=>straighten(cropping)}>{analyzing?<LoaderCircle size={15} className="spin"/>:<Sparkles size={15}/>}重新估计</button>
   </div>
   <p role="status">{analyzing?'正在本机分析文字方向…':info}</p>
   <div className="angle-row">
    <label className="angle-control">微调角度
     <input aria-label="拉直角度" type="range" min="-20" max="20" step=".1" value={angle}
      onPointerDown={()=>setAdjustingAngle(true)} onPointerUp={()=>setAdjustingAngle(false)} onPointerCancel={()=>setAdjustingAngle(false)}
      onChange={e=>{stop();setAuto(false);setAngle(+e.target.value);setInfo('手动微调；以预览中的文字为准。');}}/>
     <output>{angle>0?'+':''}{angle.toFixed(1)}°</output>
     <button onClick={()=>{stop();setAuto(false);setAngle(0);setInfo('已恢复原始角度。');}}>重置</button>
    </label>
    <div className="angle-nudge">
     <button type="button" className="secondary small" onClick={()=>nudgeAngle(-.5)}>-0.5°</button>
     <button type="button" className="secondary small" onClick={()=>nudgeAngle(.5)}>+0.5°</button>
    </div>
   </div>
   <small>校正 ±20° 内的整页倾斜；竖排保留竖排。斜拍畸变可用“四角透视”，弯曲纸张可用“矫正透视与弯曲”。</small>
  </div>}

  {cropping&&!perspective&&<div className="crop-sliders">
   {(['left','top','right','bottom'] as const).map((key,i)=>{
    const min=key==='left'||key==='top'?0:+(Math.min(.9,crop[key==='right'?'left':'top']+.1)).toFixed(2);
    const max=key==='left'||key==='top'?+(Math.max(.1,crop[key==='left'?'right':'bottom']-.1)).toFixed(2):1;
    return <label key={key}>{['左侧','上方','右侧','下方'][i]}<input aria-label={`裁剪${key}`} type="range" min={min} max={max} step=".01" value={crop[key]} onChange={e=>setCrop({...crop,[key]:+e.target.value})}/></label>;
   })}
   <div className="crop-actions">
    <button type="button" className="secondary small" disabled={analyzing||busy} onClick={()=>straighten(true)}>按裁剪重估倾角</button>
    <button type="button" className="secondary small" onClick={()=>setCrop({left:0,top:0,right:1,bottom:1})}>重置裁剪</button>
   </div>
   <p>可直接拖动照片上的白色圆点裁剪单页内容，或拖动上方滑块微调。</p>
  </div>}

  {error&&<p role="alert" className="error">{error}</p>}
  <div className="preprocess-footer">
   <button className="primary start-ocr" disabled={busy||analyzing||rectifying||enhancing||perspective} onClick={run}><ScanLine size={20}/>{busy?'正在准备图片…':analyzing?'正在校正倾角…':'开始本地识别'}<span>照片仅在本机处理</span></button>
  </div>
 </fieldset></section>;
}
