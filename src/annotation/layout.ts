import type {Annotation,AnnotationStyle,OcrLine} from '../types';
import {characters} from '../text-conversion/convert';
export interface Label {
 annotation:Annotation;
 x:number;y:number;width:number;height:number;
 fontSize:number;angle:number;
 bgColor:string;inkColor:string;
 collided:boolean;hidden:boolean;
}
export function layoutAnnotations(annotations:Annotation[],style:AnnotationStyle,width:number,height:number,_lines:OcrLine[]=[]):Label[]{
 const placed:Label[]=[];
 for(const a of annotations.filter(a=>a.visible&&!a.deleted)){
  const x=a.center.x+(a.offset?.x??0),y=a.center.y+(a.offset?.y??0);
  const inBounds=x>=0&&y>=0&&x<=width&&y<=height;
  const base=Math.max(8,Math.min(a.charWidth,a.charHeight));
  const charLen=Math.max(1,characters(a.simplified).length);
  const fontSize=a.kind==='phrase'?Math.max(8,base*.85):Math.max(8,base*.94);
  const coverW=a.kind==='phrase'?Math.max(a.charWidth*1.12,fontSize*charLen*1.05):Math.max(fontSize*1.12,a.charWidth*1.16);
  const coverH=a.kind==='phrase'?Math.max(a.charHeight*1.12,fontSize*1.2):Math.max(fontSize*1.12,a.charHeight*1.16);
  const bgColor=a.bgColor??(style.background?'#fffdf4':'transparent');
  const inkColor=a.inkColor??style.color??'#222420';
  placed.push({annotation:a,x,y,width:coverW,height:coverH,fontSize,angle:a.angle,bgColor,inkColor,collided:false,hidden:!inBounds});
 }
 return placed;
}
