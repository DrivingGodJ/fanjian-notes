import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Minus,Plus,Scan} from 'lucide-react';
import type {Annotation,Reading,ViewTransform} from '../types';
import {fitImage,screenToImage,zoomAt} from '../alignment/geometry';
import {layoutAnnotations} from '../annotation/layout';
import {AnnotationLayer} from '../annotation/AnnotationLayer';
import {useBlobUrl} from './hooks';

export function Viewport({reading,onView,onSelect}:{reading:Reading;onView:(v:ViewTransform)=>void;onSelect:(a:Annotation)=>void}){
 const container=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),url=useBlobUrl(reading.image);
 const [bounds,setBounds]=useState({width:1,height:1}),[view,setView]=useState(reading.view);
 const current=useRef(view);const pointers=useRef(new Map<number,{x:number;y:number}>());
 const gesture=useRef<{view:ViewTransform;mid:{x:number;y:number};distance:number}|null>(null),moved=useRef(false);
 const [fitted,setFitted]=useState(false);
 const update=(v:ViewTransform)=>{current.current=v;setView(v);onView(v);};
 useLayoutEffect(()=>{const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setBounds({width:r.width,height:r.height});});observer.observe(container.current!);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(bounds.width<2||bounds.height<2||fitted)return;update(reading.view.scale?reading.view:fitImage(reading.width,reading.height,bounds.width,bounds.height));setFitted(true);},[bounds,fitted]);
 const base=()=>{
   const p=[...pointers.current.values()];if(!p.length){gesture.current=null;return;}
   gesture.current={view:current.current,mid:p.length===1?p[0]:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2},distance:p.length===1?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};
 };
 const local=(e:React.PointerEvent)=>{const r=container.current!.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const zoom=(scale:number,anchor={x:bounds.width/2,y:bounds.height/2})=>{const fit=fitImage(reading.width,reading.height,bounds.width,bounds.height).scale;update(zoomAt(current.current,anchor,Math.min(fit*15,Math.max(fit*.5,scale))));};
 useEffect(()=>{
   const element=container.current!;
   const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=element.getBoundingClientRect();zoom(current.current.scale*Math.exp(-e.deltaY*.002),{x:e.clientX-rect.left,y:e.clientY-rect.top});};
   element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[bounds]);
 const labels=layoutAnnotations(reading.annotations,reading.style,reading.width,reading.height,reading.lines);
 return <div className="viewport" ref={container} data-testid="viewport"
   onPointerDown={e=>{if(e.button!==0)return;moved.current=false;pointers.current.set(e.pointerId,local(e));e.currentTarget.setPointerCapture(e.pointerId);base();}}
   onPointerMove={e=>{if(!pointers.current.has(e.pointerId)||!gesture.current)return;const previous=pointers.current.get(e.pointerId)!;const next=local(e);if(Math.hypot(next.x-previous.x,next.y-previous.y)>2)moved.current=true;pointers.current.set(e.pointerId,next);
     const p=[...pointers.current.values()],g=gesture.current;
     const mid=p.length===1?p[0]:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};
     let v=g.view;if(p.length>1&&g.distance>0){const fit=fitImage(reading.width,reading.height,bounds.width,bounds.height).scale;v=zoomAt(g.view,g.mid,Math.min(fit*15,Math.max(fit*.5,g.view.scale*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/g.distance)));}
     update({...v,x:v.x+mid.x-g.mid.x,y:v.y+mid.y-g.mid.y});}}
   onPointerUp={e=>{pointers.current.delete(e.pointerId);base();if(!moved.current){const p=screenToImage(local(e),current.current);const hit=[...labels].reverse().find(l=>Math.abs(l.x-p.x)<Math.max(l.width/2,14/current.current.scale)&&Math.abs(l.y-p.y)<Math.max(l.height/2,14/current.current.scale));if(hit)onSelect(hit.annotation);}}}
   onPointerCancel={e=>{pointers.current.delete(e.pointerId);base();}}
   onDoubleClick={()=>update(fitImage(reading.width,reading.height,bounds.width,bounds.height))}>
   <svg ref={svg} width="100%" height="100%" aria-label="原照片与简体旁注" data-testid="reading-svg">
     <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`} data-testid="shared-transform">
       <image href={url} width={reading.width} height={reading.height}/>
       {reading.showAnnotations&&<AnnotationLayer labels={labels} style={reading.style}/>}
     </g>
   </svg>
   <div className="zoom-controls" onPointerDown={e=>e.stopPropagation()}><button aria-label="缩小" onClick={()=>zoom(view.scale/1.3)}><Minus size={17}/></button><span>{Math.round(view.scale*100)}%</span><button aria-label="放大" onClick={()=>zoom(view.scale*1.3)}><Plus size={17}/></button><i/><button aria-label="适合屏幕" onClick={()=>update(fitImage(reading.width,reading.height,bounds.width,bounds.height))}><Scan size={17}/></button></div>
   <span className="viewport-hint">双指缩放 · 拖动阅读 · 点击旁注纠正</span>
 </div>;
}
