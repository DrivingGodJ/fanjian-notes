import type { Annotation, AnnotationStyle, OcrLine, Point } from '../types';
import { characters } from '../text-conversion/convert';
export interface Label { annotation:Annotation; x:number;y:number;width:number;height:number;fontSize:number;angle:number;collided:boolean }
const overlap=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>Math.abs(a.x-b.x)<(a.width+b.width)/2+1&&Math.abs(a.y-b.y)<(a.height+b.height)/2+1;
const inside=(p:Point,poly:Point[])=>{
  let sign=0;
  for(let i=0;i<4;i++){const a=poly[i],b=poly[(i+1)%4],cross=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);if(Math.abs(cross)<.01)continue;const s=Math.sign(cross);if(sign&&s!==sign)return false;sign=s;}return true;
};
export function layoutAnnotations(annotations:Annotation[],style:AnnotationStyle,width:number,height:number,lines:OcrLine[]=[]):Label[] {
  const placed:Label[]=[];
  for(const annotation of annotations.filter(a=>a.visible&&!a.deleted)) {
    const a=annotation,base=Math.min(a.charWidth,a.charHeight),fontSize=Math.max(6,base*style.size);
    const label:Label={annotation:a,x:a.position.x+(a.offset?.x??0),y:a.position.y+(a.offset?.y??0),
      width:fontSize*characters(a.simplified).length+fontSize*.35,height:fontSize*1.25,fontSize,angle:a.angle,collided:false};
    // Bounds use rotated AABB, shared by SVG and Canvas output.
    const radians=a.angle*Math.PI/180,bw=Math.abs(label.width*Math.cos(radians))+Math.abs(label.height*Math.sin(radians)),bh=Math.abs(label.width*Math.sin(radians))+Math.abs(label.height*Math.cos(radians));
    const clamp=()=>{label.x=Math.max(bw/2,Math.min(width-bw/2,label.x));label.y=Math.max(bh/2,Math.min(height-bh/2,label.y));};
    const blocked=()=>placed.some(p=>overlap({...label,width:bw,height:bh},p))||lines.some(l=>inside({x:label.x,y:label.y},l.polygon));
    clamp();
    if(!a.offset) for(let k=0;k<5&&blocked();k++) {if(a.direction==='horizontal')label.y-=fontSize*.8;else label.x+=fontSize*.8;clamp();}
    label.collided=blocked();placed.push(label);
  }
  return placed;
}
