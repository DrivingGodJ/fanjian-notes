import type { PreparedImage } from '../types';

export interface JpegMeta {
  orientation: number;
  sofWidth: number;
  sofHeight: number;
}

/** Parse EXIF Orientation (1..8) and coded SOF dimensions from the leading bytes of a JPEG. */
export function parseJpegMeta(bytes: Uint8Array): JpegMeta | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2, orientation = 1, sofWidth = 0, sofHeight = 0;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    offset += 2;
    if (marker === 0xffd9 || marker === 0xffda) break;
    const len = view.getUint16(offset);
    if (len < 2 || offset + len > view.byteLength) break;
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 2) === 0x45786966) {
      const tiff = offset + 8;
      const le = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, le);
      if (ifd + 2 <= view.byteLength) {
        const entries = view.getUint16(ifd, le);
        for (let i = 0; i < entries; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > view.byteLength) break;
          if (view.getUint16(e, le) === 0x0112) {
            orientation = view.getUint16(e + 8, le);
            break;
          }
        }
      }
    } else if (marker >= 0xffc0 && marker <= 0xffc3 && offset + 9 <= view.byteLength) {
      sofHeight = view.getUint16(offset + 3);
      sofWidth = view.getUint16(offset + 5);
    }
    offset += len;
  }
  return sofWidth && sofHeight ? { orientation, sofWidth, sofHeight } : null;
}

export async function loadImage(blob:Blob):Promise<HTMLImageElement>{
  const url=URL.createObjectURL(blob),image=new Image();
  try{image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}
}
export function canvasBlob(canvas:HTMLCanvasElement,type='image/jpeg',quality=.96):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请尝试较小的图片。')),type,quality));}
export async function resizedCanvas(blob:Blob,maxSide=2600,maxPixels=6000000){
  const [image, head] = await Promise.all([
    loadImage(blob),
    blob.slice(0, 65536).arrayBuffer().then(b => parseJpegMeta(new Uint8Array(b))).catch(() => null)
  ]);
  // Some mobile WebKit contexts decode raw JPEG pixels without applying EXIF orientation.
  const needsExifFix = !!head && head.orientation >= 5 && head.orientation <= 8
    && image.naturalWidth === head.sofWidth && image.naturalHeight === head.sofHeight;
  const srcW = needsExifFix ? image.naturalHeight : image.naturalWidth;
  const srcH = needsExifFix ? image.naturalWidth : image.naturalHeight;
  const ratio=Math.min(1,maxSide/Math.max(srcW,srcH),Math.sqrt(maxPixels/(srcW*srcH)));
  const cw=Math.max(1,Math.round(srcW*ratio)),ch=Math.max(1,Math.round(srcH*ratio));
  const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('此浏览器无法创建图像画布。');
  if(needsExifFix&&head){
    ctx.save();
    const dw=Math.max(1,Math.round(image.naturalWidth*ratio)),dh=Math.max(1,Math.round(image.naturalHeight*ratio));
    ctx.translate(cw/2,ch/2);
    if(head.orientation===5){ctx.rotate(Math.PI/2);ctx.scale(1,-1);}
    else if(head.orientation===6){ctx.rotate(Math.PI/2);}
    else if(head.orientation===7){ctx.rotate(-Math.PI/2);ctx.scale(1,-1);}
    else if(head.orientation===8){ctx.rotate(-Math.PI/2);}
    ctx.drawImage(image,-dw/2,-dh/2,dw,dh);
    ctx.restore();
  }else{
    ctx.drawImage(image,0,0,cw,ch);
  }
  return canvas;
}
export async function prepareImage(file:File):Promise<PreparedImage>{
  if(file.size>30*1048576)throw new Error('图片超过 30 MB，请先选择尺寸较小的照片。');
  if(!/^image\//.test(file.type)&&!file.name.match(/\.(jpe?g|png|webp|heic|heif)$/i))throw new Error('请选择照片文件。');
  let canvas:HTMLCanvasElement;
  try{canvas=await resizedCanvas(file);}catch{throw new Error('无法读取这张照片。请尝试 JPEG、PNG 或浏览器支持的 HEIC 图片。');}
  const result={blob:await canvasBlob(canvas),width:canvas.width,height:canvas.height,name:file.name};canvas.width=1;return result;
}
export interface Crop {left:number;top:number;right:number;bottom:number}
export function rotatedSize(width:number,height:number,degrees:number){const r=degrees*Math.PI/180,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r));return {width:Math.round(width*c+height*s),height:Math.round(width*s+height*c)};}
export function sampleBorderColor(source:CanvasImageSource):string{
  try{
    const size=32,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return '#fffdf5';
    ctx.drawImage(source,0,0,size,size);
    const {data}=ctx.getImageData(0,0,size,size);
    const rs:number[]=[],gs:number[]=[],bs:number[]=[];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      if(x>0&&x<size-1&&y>0&&y<size-1)continue;
      const idx=(y*size+x)*4;rs.push(data[idx]);gs.push(data[idx+1]);bs.push(data[idx+2]);
    }
    canvas.width=1;
    const med=(a:number[])=>a.sort((u,v)=>u-v)[Math.floor(a.length/2)]??250;
    return `rgb(${med(rs)},${med(gs)},${med(bs)})`;
  }catch{return '#fffdf5';}
}
export async function transformImage(image:PreparedImage,turns:number,crop:Crop,angle=0):Promise<PreparedImage>{
  const source=await loadImage(image.blob),rotated=document.createElement('canvas'),degrees=turns*90+angle;
  const size=rotatedSize(image.width,image.height,degrees);rotated.width=size.width;rotated.height=size.height;
  const ctx=rotated.getContext('2d')!;ctx.fillStyle=sampleBorderColor(source);ctx.fillRect(0,0,rotated.width,rotated.height);ctx.translate(rotated.width/2,rotated.height/2);ctx.rotate(degrees*Math.PI/180);ctx.drawImage(source,-image.width/2,-image.height/2);
  const out=document.createElement('canvas');const x=Math.round(crop.left*rotated.width),y=Math.round(crop.top*rotated.height);
  const cw=Math.max(1,Math.round((crop.right-crop.left)*rotated.width)),ch=Math.max(1,Math.round((crop.bottom-crop.top)*rotated.height)),ratio=Math.min(1,2600/Math.max(cw,ch),Math.sqrt(6000000/(cw*ch)));
  out.width=Math.max(1,Math.round(cw*ratio));out.height=Math.max(1,Math.round(ch*ratio));
  out.getContext('2d')!.drawImage(rotated,x,y,cw,ch,0,0,out.width,out.height);
  const result={blob:await canvasBlob(out),width:out.width,height:out.height,name:image.name};rotated.width=1;out.width=1;return result;
}
/** Extension point: a future 4-corner homography transform can implement this contract. */
export interface PerspectiveCorrector {correct(image:PreparedImage,corners:readonly [number,number][]):Promise<PreparedImage>}
