import type {Direction,Point} from '../types';
export interface GrayImage {data:Uint8Array;width:number;height:number}
export interface DeskewResult {angle:number;direction:Direction;confidence:number}
export function pixelSampler(image:GrayImage,target:{width:number;height:number}){
 const sx=image.width/target.width,sy=image.height/target.height;
 return (p:Point)=>{const x=Math.round(p.x*sx),y=Math.round(p.y*sy);return x<0||y<0||x>=image.width||y>=image.height?undefined:1-image.data[y*image.width+x]/255;};
}
/** Local contrast suppresses uneven paper illumination before projection. */
export function foregroundPoints(image:GrayImage):Point[]{
 const {width:w,height:h,data}=image,integral=new Float64Array((w+1)*(h+1));
 let mean=0;for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){const value=data[y*w+x];mean+=value;sum+=value;integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+sum;}}
 const lightPaper=mean/(w*h)>127,r=Math.max(9,Math.round(Math.min(w,h)/32)),points:Point[]=[];
 const marginX=Math.ceil(w*.04),marginY=Math.ceil(h*.04);
 for(let y=marginY;y<h-marginY;y+=2)for(let x=marginX;x<w-marginX;x+=2){
  const x0=Math.max(0,x-r),y0=Math.max(0,y-r),x1=Math.min(w,x+r+1),y1=Math.min(h,y+r+1);
  const local=(integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
  const value=data[y*w+x];if(lightPaper?value<local-18&&value<210:value>local+18&&value>60)points.push({x:x-w/2,y:y-h/2});
 }
 const step=Math.max(1,Math.ceil(points.length/24000));return points.filter((_,i)=>i%step===0);
}
/** Find the small rotation which concentrates horizontal rows or vertical columns. */
export function estimateDeskew(image:GrayImage):DeskewResult {
 const points=foregroundPoints(image);if(points.length<150)return {angle:0,direction:'horizontal',confidence:0};
 const radius=Math.ceil(Math.hypot(image.width,image.height)/2)+3,bins=radius*2+2;
 const score=(angle:number)=>{const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),xs=new Float64Array(bins),ys=new Float64Array(bins);
  for(const p of points){const x=p.x*c-p.y*s+radius,y=p.x*s+p.y*c+radius,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;xs[ix]+=1-fx;xs[ix+1]+=fx;ys[iy]+=1-fy;ys[iy+1]+=fy;}
  // Smooth out the two-pixel sampling lattice so it cannot create a false peak at zero degrees.
  const energy=(a:Float64Array)=>{let sum=0;for(let i=2;i<a.length-2;i++){const v=(a[i-2]+2*a[i-1]+3*a[i]+2*a[i+1]+a[i+2])/9;sum+=v*v;}return sum;};
  const x=energy(xs)*image.width,y=energy(ys)*image.height;return {score:Math.max(x,y),direction:(x>y?'vertical':'horizontal') as Direction};
 };
 const zero=score(0),scores:number[]=[];let best={angle:0,...zero};
 for(let angle=-12;angle<=12;angle+=.5){const candidate=score(angle);scores.push(candidate.score);if(candidate.score>best.score)best={angle,...candidate};}
 const coarse=best.angle;for(let i=-5;i<=5;i++){const angle=coarse+i*.05;if(Math.abs(angle)>12)continue;const candidate=score(angle);if(candidate.score>best.score)best={angle,...candidate};}
 const median=scores.sort((a,b)=>a-b)[Math.floor(scores.length/2)],contrast=best.score/Math.max(1,median)-1;
 const confidence=Math.max(0,Math.min(.95,contrast*1.6));
 if(confidence<.35||Math.abs(best.angle)>=11.95)return {angle:0,direction:best.direction,confidence:Math.min(.3,confidence)};
 return {angle:Math.abs(best.angle)<.25?0:Math.round(best.angle*10)/10,direction:best.direction,confidence};
}
