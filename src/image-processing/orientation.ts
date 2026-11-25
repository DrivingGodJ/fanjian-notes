import type {PreparedImage} from '../types';
import {resizedCanvas} from './images';
import {appPath} from '../paths';
import {downloadModels} from '../ocr/model-cache';

export interface TileRect { x: number; y: number; size: number }

/**
 * Extract up to `maxTiles` square character-sized patches from the dominant text bands in `gray`.
 */
export function extractOrientationTiles(
 gray:Uint8Array,
 w:number,
 h:number,
 srcW:number,
 srcH:number,
 maxTiles=16
):TileRect[]{
 if(w<24||h<24||gray.length!==w*h)return [];
 const integ=new Float64Array((w+1)*(h+1));
 const cx0=Math.floor(w*.2),cx1=Math.ceil(w*.8),cy0=Math.floor(h*.2),cy1=Math.ceil(h*.8);
 let cSum=0,cCount=0;
 for(let y=0;y<h;y++){
  let rs=0;
  for(let x=0;x<w;x++){
   const v=gray[y*w+x];rs+=v;
   integ[(y+1)*(w+1)+x+1]=integ[y*(w+1)+x+1]+rs;
   if(x>=cx0&&x<cx1&&y>=cy0&&y<cy1){cSum+=v;cCount++;}
  }
 }
 const lightPaper=(cCount?cSum/cCount:128)>118;
 const r=Math.max(8,Math.round(Math.min(w,h)/30));
 const x0=Math.floor(w*.14),x1=Math.ceil(w*.86),y0=Math.floor(h*.14),y1=Math.ceil(h*.86);
 const ink=new Uint8Array(w*h);
 const px=new Float32Array(w),py=new Float32Array(h);
 for(let y=y0;y<y1;y++){
  const a0=Math.max(0,y-r),a1=Math.min(h,y+r+1);
  for(let x=x0;x<x1;x++){
   const b0=Math.max(0,x-r),b1=Math.min(w,x+r+1);
   const loc=(integ[a1*(w+1)+b1]-integ[a0*(w+1)+b1]-integ[a1*(w+1)+b0]+integ[a0*(w+1)+b0])/((a1-a0)*(b1-b0));
   const v=gray[y*w+x];
   if(lightPaper?v<loc-18&&v<210:v>loc+18&&v>55){ink[y*w+x]=1;px[x]++;py[y]++;}
  }
 }
 const energy=(arr:Float32Array)=>{let s=0;for(let i=1;i<arr.length;i++){const df=arr[i]-arr[i-1];s+=arr[i]*arr[i]+df*df*4;}return s;};
 const vertical=energy(px)*w>energy(py)*h;
 const prof=vertical?px:py;
 const startA=vertical?x0:y0,endA=vertical?x1:y1;
 const startB=vertical?y0:x0,endB=vertical?y1:x1;
 let maxP=0;for(let i=startA;i<endA;i++)if(prof[i]>maxP)maxP=prof[i];
 const bands:[number,number][]=[];
 if(maxP>=6){
  for(let i=startA;i<endA;i++){
   if(prof[i]>maxP*.22){
    let j=i;while(j<endA&&prof[j]>maxP*.12)j++;
    if(j-i>=6&&j-i<=Math.min(w,h)*.22)bands.push([i,j]);
    i=j;
   }
  }
 }

 const tiles:TileRect[]=[];
 if(bands.length){
  const thicks=bands.map(b=>b[1]-b[0]).sort((a,b)=>a-b);
  const medThick=thicks[Math.floor(thicks.length/2)];
  const tile=Math.max(12,Math.round(medThick*1.1));
  for(const [b0,b1] of bands){
   const midA=(b0+b1)/2;
   for(let pos=startB+tile;pos<endB-tile;pos+=Math.round(tile*1.05)){
    let count=0;
    const tx0=Math.round((vertical?midA:pos)-tile/2);
    const ty0=Math.round((vertical?pos:midA)-tile/2);
    for(let yy=Math.max(0,ty0);yy<Math.min(h,ty0+tile);yy+=2)
     for(let xx=Math.max(0,tx0);xx<Math.min(w,tx0+tile);xx+=2)count+=ink[yy*w+xx];
    const ratio=count/Math.max(1,(tile/2)*(tile/2));
    if(ratio>.1&&ratio<.65){
     const size=tile/w*srcW;
     const x=Math.max(0,Math.min(srcW-size,tx0/w*srcW));
     const y=Math.max(0,Math.min(srcH-size,ty0/h*srcH));
     tiles.push({x,y,size});
    }
   }
  }
 }

 // Fallback grid scan for strongly skewed pages where 1D projection smears out bands.
 if(tiles.length<3){
  const tile=Math.max(16,Math.round(Math.min(w,h)*.08));
  const stepGrid=Math.max(8,Math.round(tile*.85));
  for(let gy=y0;gy<=y1-tile;gy+=stepGrid){
   for(let gx=x0;gx<=x1-tile;gx+=stepGrid){
    let count=0;
    for(let yy=gy;yy<gy+tile;yy+=2)for(let xx=gx;xx<gx+tile;xx+=2)count+=ink[yy*w+xx];
    const ratio=count/Math.max(1,(tile/2)*(tile/2));
    if(ratio>.06&&ratio<.70){
     const size=tile/w*srcW;
     const x=Math.max(0,Math.min(srcW-size,gx/w*srcW));
     const y=Math.max(0,Math.min(srcH-size,gy/h*srcH));
     tiles.push({x,y,size});
    }
   }
  }
 }

 const step=Math.max(1,Math.floor(tiles.length/maxTiles));
 return tiles.filter((_,i)=>i%step===0).slice(0,maxTiles);
}

/**
 * Given CTC Han character scores for 0, 90, 180, 270 CW rotations of tile patches,
 * choose the rotation needed to make the image upright.
 * PP-OCRv5 fires strongly on upright orientation `r` and 90-CCW `(r+3)%4`, and stays near 0 on `(r+1)%4` and `(r+2)%4`.
 */
export function scoreOrientation(raw:readonly [number,number,number,number]):{
 turns:0|1|2|3;
 degrees:0|90|180|270;
 confidence:number;
}{
 const maxRaw=Math.max(...raw);
 if(!Number.isFinite(maxRaw)||maxRaw<1.2)return {turns:0,degrees:0,confidence:0};
 const cleaned=raw.map(v=>v>=.4?v:0);
 const L=cleaned.map(v=>Math.log1p(v));
 const scores=[0,0,0,0];
 let bestIdx=0,bestScore=-Infinity;
 for(let r=0;r<4;r++){
  const score=L[r]+L[(r+3)%4]+2.5*Math.min(L[r],L[(r+3)%4])-2*L[(r+1)%4]-2*L[(r+2)%4]+.05*L[r];
  scores[r]=score;
  if(score>bestScore){bestScore=score;bestIdx=r;}
 }
 if(bestIdx!==0&&(scores[bestIdx]<=scores[0]+.5||cleaned[bestIdx]<=0))bestIdx=0;
 return {turns:bestIdx as 0|1|2|3,degrees:(bestIdx*90) as 0|90|180|270,confidence:Math.min(1,maxRaw/6)};
}

export async function detectImageOrientation(
 image:PreparedImage,
 signal?:AbortSignal
):Promise<{turns:0|1|2|3;degrees:0|90|180|270}>{
 if(typeof Worker==='undefined')return {turns:0,degrees:0};
 signal?.throwIfAborted();
 const {cancelOcr}=await import('../ocr/adapter');
 cancelOcr();

 let archive:ArrayBuffer;
 let config:{charDict:string[]};
 try{
  [archive,config]=await Promise.all([
   fetch(appPath('ocr/rec.tar'),{signal}).then(r=>{if(!r.ok)throw Error('fetch');return r.arrayBuffer();}),
   fetch(appPath('ocr/rec-params.json'),{signal}).then(r=>{if(!r.ok)throw Error('fetch');return r.json();})
  ]);
 }catch{
  signal?.throwIfAborted();
  await downloadModels(()=>{},signal);
  signal?.throwIfAborted();
  [archive,config]=await Promise.all([
   fetch(appPath('ocr/rec.tar'),{signal}).then(r=>{if(!r.ok)throw Error('无法读取方向检测模型');return r.arrayBuffer();}),
   fetch(appPath('ocr/rec-params.json'),{signal}).then(r=>{if(!r.ok)throw Error('无法读取方向检测字典');return r.json();})
  ]);
 }
 signal?.throwIfAborted();

 const workCanvas=await resizedCanvas(image.blob,1200,1500000);
 signal?.throwIfAborted();

 const sw=Math.min(600,workCanvas.width),sh=Math.max(1,Math.round(workCanvas.height*sw/workCanvas.width));
 const small=document.createElement('canvas');small.width=sw;small.height=sh;
 const sctx=small.getContext('2d',{willReadFrequently:true});
 if(!sctx){workCanvas.width=1;return {turns:0,degrees:0};}
 sctx.drawImage(workCanvas,0,0,sw,sh);
 const sd=sctx.getImageData(0,0,sw,sh).data;
 small.width=1;
 const gray=new Uint8Array(sw*sh);
 for(let i=0;i<gray.length;i++)gray[i]=Math.round(sd[i*4]*.299+sd[i*4+1]*.587+sd[i*4+2]*.114);

 const tiles=extractOrientationTiles(gray,sw,sh,workCanvas.width,workCanvas.height,16);
 if(tiles.length<3){workCanvas.width=1;return {turns:0,degrees:0};}

 const tileSize=40,pad=4,cell=tileSize+pad*2,stripH=48,stripW=tiles.length*cell;
 const strips:Uint8ClampedArray<ArrayBuffer>[]=[];
 const stripCanvas=document.createElement('canvas');stripCanvas.width=stripW;stripCanvas.height=stripH;
 const g=stripCanvas.getContext('2d',{willReadFrequently:true})!;
 for(const deg of [0,90,180,270]){
  g.fillStyle='#f8f5ec';g.fillRect(0,0,stripW,stripH);
  tiles.forEach((t,idx)=>{
   g.save();
   g.translate(idx*cell+cell/2,stripH/2);
   g.rotate(deg*Math.PI/180);
   g.drawImage(workCanvas,t.x,t.y,t.size,t.size,-tileSize/2,-tileSize/2,tileSize,tileSize);
   g.restore();
  });
  strips.push(g.getImageData(0,0,stripW,stripH).data);
 }
 workCanvas.width=1;stripCanvas.width=1;
 signal?.throwIfAborted();

 const raw=await new Promise<[number,number,number,number]>((resolve,reject)=>{
  const worker=new Worker(new URL('./orientation.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);clearTimeout(timer);};
  const abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};
  const timer=setTimeout(()=>{cleanup();reject(new Error('方向检测超时'));},30000);
  signal?.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>{cleanup();reject(new Error('方向检测失败'));};
  worker.onmessage=e=>{cleanup();e.data.error?reject(new Error(e.data.error)):resolve(e.data.result);};
  worker.postMessage(
   {strips,width:stripW,height:stripH,archive,charDict:config.charDict,wasmPath:new URL(appPath('ocr/'),location.origin).href},
   [...strips.map(s=>s.buffer),archive]
  );
 });

 const {turns,degrees}=scoreOrientation(raw);
 return {turns,degrees};
}
