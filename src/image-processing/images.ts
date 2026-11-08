import type { PreparedImage } from '../types';
export async function loadImage(blob:Blob):Promise<HTMLImageElement>{
  const url=URL.createObjectURL(blob),image=new Image();
  try{image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}
}
export function canvasBlob(canvas:HTMLCanvasElement,type='image/jpeg',quality=.94):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请尝试较小的图片。')),type,quality));}
export async function resizedCanvas(blob:Blob,maxSide=2400,maxPixels=5000000){
  const image=await loadImage(blob),ratio=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(maxPixels/(image.naturalWidth*image.naturalHeight)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('此浏览器无法创建图像画布。');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
}
export async function prepareImage(file:File):Promise<PreparedImage>{
  if(file.size>30*1048576)throw new Error('图片超过 30 MB，请先选择尺寸较小的照片。');
  if(!/^image\//.test(file.type)&&!file.name.match(/\.(jpe?g|png|webp|heic|heif)$/i))throw new Error('请选择照片文件。');
  let canvas:HTMLCanvasElement;
  try{canvas=await resizedCanvas(file);}catch{throw new Error('无法读取这张照片。请尝试 JPEG、PNG 或浏览器支持的 HEIC 图片。');}
  const result={blob:await canvasBlob(canvas),width:canvas.width,height:canvas.height,name:file.name};canvas.width=1;return result;
}
export interface Crop {left:number;top:number;right:number;bottom:number}
export async function transformImage(image:PreparedImage,turns:number,crop:Crop):Promise<PreparedImage>{
  const source=await loadImage(image.blob),rotated=document.createElement('canvas'),odd=turns%2!==0;
  rotated.width=odd?image.height:image.width;rotated.height=odd?image.width:image.height;
  const ctx=rotated.getContext('2d')!;ctx.translate(rotated.width/2,rotated.height/2);ctx.rotate(turns*Math.PI/2);ctx.drawImage(source,-image.width/2,-image.height/2);
  const out=document.createElement('canvas');const x=Math.round(crop.left*rotated.width),y=Math.round(crop.top*rotated.height);
  out.width=Math.max(1,Math.round((crop.right-crop.left)*rotated.width));out.height=Math.max(1,Math.round((crop.bottom-crop.top)*rotated.height));
  out.getContext('2d')!.drawImage(rotated,x,y,out.width,out.height,0,0,out.width,out.height);
  const result={blob:await canvasBlob(out),width:out.width,height:out.height,name:image.name};rotated.width=1;out.width=1;return result;
}
/** Extension point: a future 4-corner homography transform can implement this contract. */
export interface PerspectiveCorrector {correct(image:PreparedImage,corners:readonly [number,number][]):Promise<PreparedImage>}
