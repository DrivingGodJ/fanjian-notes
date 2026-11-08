import type { Annotation, OcrLine, Point } from '../types';
import { alignConversion, characters, isHan } from '../text-conversion/convert';
import { quadPoint, quadSize } from './geometry';

const advance = (c:string) => /\s/u.test(c) ? .5 : /[\x00-\x7f]/u.test(c) ? .58 : 1;
export type PixelSampler = (point:Point)=>number | undefined;

export class CharacterAlignmentEngine {
  align(line:OcrLine,sample?:PixelSampler):Annotation[] {
    const chars=characters(line.text), weights=chars.map(advance), total=weights.reduce((a,b)=>a+b,0)||1;
    const edges=[0]; for(const w of weights) edges.push(edges[edges.length-1]+w/total);
    const vertical=line.direction==='vertical', {width,height}=quadSize(line.polygon);
    const size=vertical?width:height;
    return alignConversion(line.text).changes.map((change,index)=>{
      const start=edges[change.sourceStart]??0,end=edges[change.sourceEnd]??1;
      let t=(start+end)/2,method:Annotation['method']='geometry';
      let confidence=(chars.every(c=>isHan(c)||/[\p{P}\s]/u.test(c))?.57:.34)*Math.min(1,line.confidence+.1);
      // shortcut: modest local projection refinement, not character detection; upgrade for uneven typography.
      if(sample&&change.kind==='character'&&isHan(change.original)) {
        const bins=32, densities:number[]=[];
        for(let k=0;k<bins;k++) {
          const u=start+(end-start)*(k+.5)/bins;let density=0,count=0;
          for(let v=0;v<12;v++) {const p=vertical?quadPoint(line.polygon,(v+.5)/12,u):quadPoint(line.polygon,u,(v+.5)/12);const ink=sample(p);if(ink!==undefined){density+=ink;count++;}}
          densities.push(count?density/count:0);
        }
        const mass=densities.reduce((a,b)=>a+b,0),peak=Math.max(...densities);
        if(mass>1.2&&peak>.18) {
          const center=densities.reduce((s,v,k)=>s+v*(k+.5)/bins,0)/mass;
          if(center>.3&&center<.7) {t=start+(end-start)*(.5+(center-.5)*.5);method='projection';confidence=Math.min(.68,confidence+.07);}
        }
      }
      if(change.kind==='phrase') confidence=Math.min(.25,confidence);
      const center=vertical?quadPoint(line.polygon,.5,t):quadPoint(line.polygon,t,.5);
      const edge=vertical?quadPoint(line.polygon,1,t):quadPoint(line.polygon,t,0);
      const dx=edge.x-center.x,dy=edge.y-center.y,len=Math.hypot(dx,dy)||1;
      const position={x:edge.x+dx/len*size*.32,y:edge.y+dy/len*size*.32};
      const q=line.polygon;
      return {id:`${line.id}:${change.sourceStart}:${index}`,lineId:line.id,sourceIndex:change.sourceStart,
        original:change.original,simplified:change.simplified,center,position,
        direction:line.direction,charWidth:vertical?width:width*(end-start),charHeight:vertical?height*(end-start):height,
        angle:vertical?0:Math.atan2(q[1].y-q[0].y,q[1].x-q[0].x)*180/Math.PI,
        ocrConfidence:line.confidence,positionConfidence:confidence,method,modified:!!line.modified,visible:true,kind:change.kind};
    });
  }
  alignAll(lines:OcrLine[],sample?:PixelSampler) {return lines.flatMap(line=>this.align(line,sample));}
}
