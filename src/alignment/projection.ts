import type {OcrLine,Point} from '../types';
import {quadPoint,quadSize} from './geometry';
import {isHan} from '../text-conversion/convert';
export type PixelSampler=(point:Point)=>number|undefined;
export interface CharacterSlot {center:number;start:number;end:number;crossStart:number;crossEnd:number;confidence:number}
export function characterAdvance(c:string,vertical=false){return /\s/u.test(c)?.5:/[\x00-\x7f]/u.test(c)?(vertical?.5:.58):1;}

/** Fit the entire line to ink valleys; local-only nudges cannot repair accumulated spacing errors. */
export function projectCharacters(line:OcrLine,chars:string[],sample:PixelSampler,anchors?:number[]):CharacterSlot[]|undefined{
 if(!chars.length||chars.length>180)return;
 const vertical=line.direction==='vertical',size=quadSize(line.polygon),length=vertical?size.height:size.width;
 const count=chars.length,bins=Math.min(1800,Math.max(count*12,Math.round(length))),cross=40;
 const values=new Float32Array(bins*cross),sorted:number[]=[];
 for(let k=0;k<bins;k++)for(let v=0;v<cross;v++){
  const t=(k+.5)/bins,u=.04+(v+.5)/cross*.92,p=vertical?quadPoint(line.polygon,u,t):quadPoint(line.polygon,t,u),ink=sample(p)??0;
  values[k*cross+v]=ink;if(k%3===0&&v%2===0)sorted.push(ink);
 }
 sorted.sort((a,b)=>a-b);const lo=sorted[Math.floor(sorted.length*.15)],hi=sorted[Math.floor(sorted.length*.9)];
 if(hi-lo<.14)return;
 const inverted=sorted[Math.floor(sorted.length*.5)]>.65,threshold=inverted?hi-(hi-lo)*.4:lo+(hi-lo)*.4;
 const mask=new Uint8Array(values.length),density=new Float32Array(bins);
 for(let k=0;k<bins;k++)for(let v=0;v<cross;v++){const ink=inverted?values[k*cross+v]<threshold:values[k*cross+v]>threshold;if(ink){mask[k*cross+v]=1;density[k]++;}}
 const peak=Math.max(...density);if(peak<cross*.12)return;
 let first=0,last=bins-1;while(first<last&&density[first]<peak*.08)first++;while(last>first&&density[last]<peak*.08)last--;
 const span=last-first+1,weights=chars.map(c=>characterAdvance(c,vertical)),total=weights.reduce((a,b)=>a+b,0),pitch=span/total;
 if(pitch<4||span<12)return;
 const smooth=new Float32Array(bins+1);for(let k=1;k<bins;k++)smooth[k]=(density[k-1]+density[k]+(density[k+1]??0))/(3*peak);
 const mass=new Float32Array(bins+1);for(let k=0;k<bins;k++)mass[k+1]=mass[k]+density[k];
 let previous=new Float64Array(bins+1).fill(Infinity);previous[first]=0;
 const back=Array.from({length:count+1},()=>new Int16Array(bins+1).fill(-1));let advance=0;
 for(let i=1;i<=count;i++){
  const expected=pitch*weights[i-1];advance+=expected;const next=new Float64Array(bins+1).fill(Infinity),goal=anchors&&i<count?(anchors[i-1]+anchors[i])/2*bins:first+advance,slack=Math.max(pitch*3,span*.08);
  const minEnd=i===count?last+1:Math.max(first+i,Math.round(goal-slack)),maxEnd=i===count?last+1:Math.min(last-(count-i)+1,Math.round(goal+slack));
  for(let end=minEnd;end<=maxEnd;end++)for(let start=Math.max(first,end-Math.ceil(expected*2.1));start<=end-Math.max(2,Math.floor(expected*.32));start++){
   if(!Number.isFinite(previous[start]))continue;
   const width=end-start,ink=(mass[end]-mass[start])/(width*cross),spacing=(width/expected-1)**2;
   const blank=isHan(chars[i-1])&&ink<.025?3:0;
   const anchor=anchors?.[i-1],outside=anchor===undefined?0:Math.max(0,start-anchor*bins,anchor*bins-end)/pitch;
   const cost=previous[start]+spacing*.65+(i===count?0:smooth[end]*2.4)+((end-goal)/pitch)**2*.012+blank+outside*outside*8;
   if(cost<next[end]){next[end]=cost;back[i][end]=start;}
  }
  previous=next;
 }
 const loss=previous[last+1]/count;if(!Number.isFinite(loss)||loss>.85)return;
 const edges=new Int16Array(count+1);edges[count]=last+1;for(let i=count;i>0;i--){edges[i-1]=back[i][edges[i]];if(edges[i-1]<0)return;}
 const result:CharacterSlot[]=[];
 for(let i=0;i<count;i++){
  const start=edges[i],end=edges[i+1],crossMass=new Uint16Array(cross);let a=end,b=start;
  for(let k=start;k<end;k++){if(density[k]>peak*.08){a=Math.min(a,k);b=Math.max(b,k);}for(let v=0;v<cross;v++)crossMass[v]+=mask[k*cross+v];}
  const max=Math.max(...crossMass);let left=0,right=cross-1;while(left<right&&crossMass[left]<max*.08)left++;while(right>left&&crossMass[right]<max*.08)right--;
  const empty=a>=b,unusual=(end-start)/Math.max(1,pitch*weights[i])>1.65;
  result.push({start:(empty?start:a)/bins,end:(empty?end:b+1)/bins,center:(empty?(start+end)/2:(a+b+1)/2)/bins,
   crossStart:.04+left/cross*.92,crossEnd:.04+(right+1)/cross*.92,confidence:empty?.15:unusual?.32:Math.max(.42,.78-loss*.3)});
 }
 return result;
}
