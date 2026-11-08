import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,RotateCw,ScanLine,Crop as CropIcon,Sparkles,LoaderCircle} from 'lucide-react';
import type {PreparedImage} from '../types';
import {rotatedSize,transformImage,type Crop} from '../image-processing/images';
import {detectImageSkew} from '../image-processing/analyze';
import {useBlobUrl} from './hooks';
export function Preprocess({image,onBack,onStart}:{image:PreparedImage;onBack:()=>void;onStart:(image:PreparedImage)=>void}){
 const [turns,setTurns]=useState(0),[angle,setAngle]=useState(0),[auto,setAuto]=useState(true),[analyzing,setAnalyzing]=useState(false),[info,setInfo]=useState('正在估计文字方向…');
 const [crop,setCrop]=useState<Crop>({left:0,top:0,right:1,bottom:1}),[cropping,setCropping]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const abort=useRef<AbortController>(null),url=useBlobUrl(image.blob),holder=useRef<HTMLDivElement>(null),[available,setAvailable]=useState({width:1,height:1});
 useLayoutEffect(()=>{const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setAvailable({width:r.width,height:r.height});});observer.observe(holder.current!);return()=>observer.disconnect();},[]);
 const stop=()=>{abort.current?.abort();setAnalyzing(false);};
 const straighten=async()=>{
  abort.current?.abort();const controller=new AbortController();abort.current=controller;setAnalyzing(true);setError('');
  try{const source=await transformImage(image,turns,crop);controller.signal.throwIfAborted();const result=await detectImageSkew(source.blob,controller.signal);controller.signal.throwIfAborted();
   if(result.confidence>=.35){setAngle(result.angle);setInfo(`${result.direction==='vertical'?'竖排':'横排'}文字 · ${result.angle?`已拉直 ${result.angle>0?'+':''}${result.angle.toFixed(1)}°`:'已基本对齐'}`);}
   else setInfo('方向不够明确，保留当前角度；可以手动微调。');
  }catch(e){if((e as Error).name!=='AbortError'){setInfo('自动分析未完成，仍可手动调整或直接识别。');setError((e as Error).message);}}
  finally{if(!controller.signal.aborted)setAnalyzing(false);}
 };
 useEffect(()=>{if(auto)void straighten();return()=>abort.current?.abort();},[image.blob,turns,auto]);
 const degrees=turns*90+angle,{width:w,height:h}=rotatedSize(image.width,image.height,degrees),scale=Math.min(available.width/w,available.height/h);
 const x=crop.left*w,y=crop.top*h,cw=(crop.right-crop.left)*w,ch=(crop.bottom-crop.top)*h;
 const run=async()=>{setBusy(true);try{onStart(await transformImage(image,turns,crop,angle));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="workspace preprocess"><header className="work-header"><button className="icon-button" aria-label="返回首页" onClick={onBack}><ArrowLeft size={20}/></button><div><h2>准备这张照片</h2><p>先拉直文字，再识别与定位</p></div></header>
 <div className="preprocess-image" ref={holder}><svg aria-label="待识别照片与裁剪区域" viewBox={`0 0 ${w} ${h}`} width={w*scale} height={h*scale}><image href={url} width={image.width} height={image.height} transform={`translate(${w/2} ${h/2}) rotate(${degrees}) translate(${-image.width/2} ${-image.height/2})`}/><path fill="#0b1a18aa" fillRule="evenodd" d={`M0 0H${w}V${h}H0Z M${x} ${y}H${x+cw}V${y+ch}H${x}Z`}/><rect x={x} y={y} width={cw} height={ch} stroke="#dfe8c7" strokeWidth={2/Math.max(scale,.001)} fill="none"/></svg></div>
 <div className="preprocess-tools"><button className="secondary" disabled={busy} onClick={()=>{setTurns((turns+1)%4);setAngle(0);setCrop({left:0,top:0,right:1,bottom:1});}}><RotateCw size={17}/>旋转 90°</button><button className="secondary" onClick={()=>setCropping(!cropping)}><CropIcon size={17}/>裁剪边缘</button><span>{image.width} × {image.height}</span></div>
 <div className="straighten-controls"><div><label className="check-field"><input type="checkbox" checked={auto} onChange={e=>{stop();setAuto(e.target.checked);}}/>自动拉直</label><button className="secondary small" disabled={analyzing||busy} onClick={()=>straighten()}>{analyzing?<LoaderCircle size={15} className="spin"/>:<Sparkles size={15}/>}重新估计</button></div><p role="status">{analyzing?'正在本机分析文字方向…':info}</p><label className="angle-control">微调角度<input aria-label="拉直角度" type="range" min="-12" max="12" step=".1" value={angle} onChange={e=>{stop();setAuto(false);setAngle(+e.target.value);setInfo('手动微调；以预览中的文字为准。');}}/><output>{angle>0?'+':''}{angle.toFixed(1)}°</output><button onClick={()=>{stop();setAuto(false);setAngle(0);setInfo('已恢复原始角度。');}}>重置</button></label><small>校正 ±12° 内的整页倾斜；竖排保留竖排。弯曲书页与透视仍可能需要裁剪。</small></div>
 {cropping&&<div className="crop-sliders">{(['left','top','right','bottom'] as const).map((key,i)=><label key={key}>{['左侧','上方','右侧','下方'][i]}<input aria-label={`裁剪${key}`} type="range" min={key==='left'||key==='top'?0:.55} max={key==='left'||key==='top'?.45:1} step=".01" value={crop[key]} onChange={e=>setCrop({...crop,[key]:+e.target.value})}/></label>)}<p>裁剪后可点“重新估计”，排除背景干扰。</p></div>}
 {error&&<p role="alert" className="error">{error}</p>}<button className="primary start-ocr" disabled={busy||analyzing} onClick={run}><ScanLine size={20}/>{busy?'正在准备图片…':analyzing?'正在自动拉直…':'开始本地识别'}<span>照片仅在本机处理</span></button></section>;
}
