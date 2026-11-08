import type {Annotation,AnnotationStyle,OcrLine,Quad} from '../types';
import {characters} from '../text-conversion/convert';
import {quadPoint} from '../alignment/geometry';
export interface Label {annotation:Annotation;x:number;y:number;width:number;height:number;fontSize:number;angle:number;collided:boolean;hidden:boolean}
function corners(box:{x:number;y:number;width:number;height:number;angle:number}):Quad{
 const r=box.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:box.x+x*box.width*c/2-y*box.height*s/2,y:box.y+x*box.width*s/2+y*box.height*c/2})) as Quad;
}
/** Separating axes include edge intersections, not just label centers. */
function overlaps(a:Quad,b:Quad){
 for(const p of [a,b])for(let i=0;i<4;i++){
  const from=p[i],to=p[(i+1)%4],nx=to.y-from.y,ny=from.x-to.x;
  const aa=a.map(q=>q.x*nx+q.y*ny),bb=b.map(q=>q.x*nx+q.y*ny);
  if(Math.max(...aa)<=Math.min(...bb)||Math.max(...bb)<=Math.min(...aa))return false;
 }
 return true;
}
function lineCore(line:OcrLine):Quad{
 const p=line.polygon;return (line.direction==='vertical'?[quadPoint(p,.14,0),quadPoint(p,.86,0),quadPoint(p,.86,1),quadPoint(p,.14,1)]:[quadPoint(p,0,.14),quadPoint(p,1,.14),quadPoint(p,1,.86),quadPoint(p,0,.86)]) as Quad;
}
export function layoutAnnotations(annotations:Annotation[],style:AnnotationStyle,width:number,height:number,lines:OcrLine[]=[]):Label[]{
 const placed:Label[]=[],obstacles=lines.map(l=>({id:l.id,poly:lineCore(l)}));
 for(const a of annotations.filter(a=>a.visible&&!a.deleted)){
  const base=Math.max(1,Math.min(a.charWidth,a.charHeight)),wanted=Math.max(6,base*style.size);
  const make=(fontSize:number,x:number,y:number):Label=>({annotation:a,x,y,width:fontSize*characters(a.simplified).length+fontSize*.35,height:fontSize*1.25,fontSize,angle:a.angle,collided:false,hidden:false});
  const blocked=(l:Label)=>{const q=corners(l);return q.some(p=>p.x<0||p.y<0||p.x>width||p.y>height)||placed.some(p=>!p.hidden&&overlaps(q,corners(p)))||obstacles.some(o=>o.id!==a.lineId&&overlaps(q,o.poly));};
  if(a.offset){const l=make(wanted,a.position.x+a.offset.x,a.position.y+a.offset.y);l.collided=blocked(l);placed.push(l);continue;}
  let nx=a.position.x-a.center.x,ny=a.position.y-a.center.y;const length=Math.hypot(nx,ny)||1;nx/=length;ny/=length;
  let chosen:Label|undefined;
  for(const factor of [1,.9,.8,.7,.6]){
   const fontSize=Math.max(6,wanted*factor),label=make(fontSize,0,0),q=corners({...label,x:0,y:0});
   const extent=Math.max(...q.map(p=>Math.abs(p.x*nx+p.y*ny))),source=(a.direction==='vertical'?a.charWidth:a.charHeight)/2;
   const distance=source+extent+Math.max(1,base*.06);
   // Stay beside the same character. Never migrate through a neighboring text column.
   for(const shift of [0,.08,.16]){
    const l=make(fontSize,a.center.x+nx*(distance+shift*base),a.center.y+ny*(distance+shift*base));
    if(!blocked(l)){chosen=l;break;}
   }
   if(chosen)break;
  }
  placed.push(chosen??{...make(wanted,a.position.x,a.position.y),collided:true,hidden:true});
 }
 return placed;
}
