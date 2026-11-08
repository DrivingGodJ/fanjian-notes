import {useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,RotateCw,ScanLine,Crop as CropIcon} from 'lucide-react';
import type {PreparedImage} from '../types';
import {transformImage,type Crop} from '../image-processing/images';
import {useBlobUrl} from './hooks';
export function Preprocess({image,onBack,onStart}:{image:PreparedImage;onBack:()=>void;onStart:(image:PreparedImage)=>void}){
 const [turns,setTurns]=useState(0),[crop,setCrop]=useState<Crop>({left:0,top:0,right:1,bottom:1}),[cropping,setCropping]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=useBlobUrl(image.blob);
 const holder=useRef<HTMLDivElement>(null),[available,setAvailable]=useState({width:1,height:1});
 useLayoutEffect(()=>{const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setAvailable({width:r.width,height:r.height});});observer.observe(holder.current!);return()=>observer.disconnect();},[]);
 const w=turns%2?image.height:image.width,h=turns%2?image.width:image.height,scale=Math.min(available.width/w,available.height/h);
 const x=crop.left*w,y=crop.top*h,cw=(crop.right-crop.left)*w,ch=(crop.bottom-crop.top)*h;
 const run=async()=>{setBusy(true);try{onStart(await transformImage(image,turns,crop));}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <section className="workspace preprocess"><header className="work-header"><button className="icon-button" aria-label="返回首页" onClick={onBack}><ArrowLeft size={20}/></button><div><h2>准备这张照片</h2><p>让文字尽量平整、清晰，识别会更准确</p></div></header>
 <div className="preprocess-image" ref={holder}><svg aria-label="待识别照片与裁剪区域" viewBox={`0 0 ${w} ${h}`} width={w*scale} height={h*scale}><image href={url} width={image.width} height={image.height} transform={`translate(${w/2} ${h/2}) rotate(${turns*90}) translate(${-image.width/2} ${-image.height/2})`}/><path fill="#0b1a18aa" fillRule="evenodd" d={`M0 0H${w}V${h}H0Z M${x} ${y}H${x+cw}V${y+ch}H${x}Z`}/><rect x={x} y={y} width={cw} height={ch} stroke="#dfe8c7" strokeWidth={2/Math.max(scale,.001)} fill="none"/></svg></div>
 <div className="preprocess-tools"><button className="secondary" onClick={()=>{setTurns((turns+1)%4);setCrop({left:0,top:0,right:1,bottom:1});}}><RotateCw size={17}/>旋转 90°</button><button className="secondary" onClick={()=>setCropping(!cropping)}><CropIcon size={17}/>裁剪边缘</button><span>{image.width} × {image.height}</span></div>
 {cropping&&<div className="crop-sliders">{(['left','top','right','bottom'] as const).map((key,i)=><label key={key}>{['左侧','上方','右侧','下方'][i]}<input aria-label={`裁剪${key}`} type="range" min={key==='left'||key==='top'?0:.55} max={key==='left'||key==='top'?.45:1} step=".01" value={crop[key]} onChange={e=>setCrop({...crop,[key]:+e.target.value})}/></label>)}<p>已自动应用照片方向信息。透视校正暂未开放。</p></div>}
 {error&&<p role="alert" className="error">{error}</p>}<button className="primary start-ocr" disabled={busy} onClick={run}><ScanLine size={20}/>{busy?'正在准备图片…':'开始本地识别'}<span>照片仅在本机处理</span></button></section>;
}
