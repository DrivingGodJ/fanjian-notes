import type {Annotation,OcrLine} from '../types';
import {alignConversion,characters,isHan} from '../text-conversion/convert';
import {quadPoint,quadSize} from './geometry';
import {characterAdvance,projectCharacters,type PixelSampler} from './projection';
export type {PixelSampler} from './projection';
export const ALIGNMENT_VERSION=2;
export class CharacterAlignmentEngine {
 align(line:OcrLine,sample?:PixelSampler):Annotation[]{
  const chars=characters(line.text),vertical=line.direction==='vertical',weights=chars.map(c=>characterAdvance(c,vertical)),total=weights.reduce((a,b)=>a+b,0)||1;
  const edges=[0];for(const w of weights)edges.push(edges[edges.length-1]+w/total);
  const slots=sample?projectCharacters(line,chars,sample):undefined,{width,height}=quadSize(line.polygon);
  return alignConversion(line.text).changes.map((change,index)=>{
   const start=edges[change.sourceStart]??0,end=edges[change.sourceEnd]??1,slot=change.kind==='character'?slots?.[change.sourceStart]:undefined;
   const t=slot?.center??(start+end)/2,cross=slot?(slot.crossStart+slot.crossEnd)/2:.5;
   const charWidth=vertical?width*(slot?Math.max(.5,slot.crossEnd-slot.crossStart):1):width*(slot?slot.end-slot.start:end-start);
   const charHeight=vertical?height*(slot?slot.end-slot.start:end-start):height*(slot?Math.max(.5,slot.crossEnd-slot.crossStart):1);
   let confidence=slot?.confidence??((chars.every(c=>isHan(c)||/[\p{P}\s]/u.test(c))?.52:.3)*Math.min(1,line.confidence+.1));
   if(sample&&!slots)confidence=Math.min(confidence,.3);if(change.kind==='phrase')confidence=.2;
   const center=vertical?quadPoint(line.polygon,cross,t):quadPoint(line.polygon,t,cross);
   const edge=vertical?quadPoint(line.polygon,slot?.crossEnd??1,t):quadPoint(line.polygon,t,slot?.crossStart??0);
   const dx=edge.x-center.x,dy=edge.y-center.y,len=Math.hypot(dx,dy)||1,size=vertical?charWidth:charHeight;
   const needsReview=change.kind==='phrase'||!!sample&&confidence<.35;
   return {id:`${line.id}:${change.sourceStart}:${index}`,lineId:line.id,sourceIndex:change.sourceStart,original:change.original,simplified:change.simplified,
    center,position:{x:edge.x+dx/len*size*.32,y:edge.y+dy/len*size*.32},direction:line.direction,charWidth,charHeight,
    angle:vertical?0:Math.atan2(line.polygon[1].y-line.polygon[0].y,line.polygon[1].x-line.polygon[0].x)*180/Math.PI,
    ocrConfidence:line.confidence,positionConfidence:confidence,method:slot?'projection':'geometry',modified:!!line.modified,visible:!needsReview,needsReview,kind:change.kind};
  });
 }
 alignAll(lines:OcrLine[],sample?:PixelSampler){return lines.flatMap(l=>this.align(l,sample));}
}
