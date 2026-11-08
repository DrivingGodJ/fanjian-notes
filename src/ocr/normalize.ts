import type {OcrResult} from '@paddleocr/paddleocr-js';
import type {OcrLine,Quad} from '../types';
import {inferDirection,mapQuad} from '../alignment/geometry';
export function normalizeResult(result:OcrResult,target:{width:number;height:number}):OcrLine[]{
 if(!Number.isFinite(result.image.width)||!Number.isFinite(result.image.height)||result.image.width<=0||result.image.height<=0)throw new Error('OCR 返回的图像尺寸无效。');
 return result.items.filter(i=>i.text.trim()&&i.poly.length===4&&i.poly.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]))).map((i,index)=>{
  const q=i.poly.map(p=>({x:p[0],y:p[1]})) as Quad,polygon=mapQuad(q,result.image,target);
  return {id:`line-${index}`,text:i.text,polygon,confidence:Number.isFinite(i.score)?Math.max(0,Math.min(1,i.score)):0,direction:inferDirection(polygon)};
 });
}
