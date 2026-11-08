import type { Reading } from '../types';
import { layoutAnnotations } from '../annotation/layout';
import { canvasBlob, loadImage } from '../image-processing/images';
import {ANNOTATION_FONT,ensureAnnotationFont} from '../annotation/typography';
export async function exportReading(reading:Reading,type:'image/png'|'image/jpeg'){
 await ensureAnnotationFont();
 const canvas=document.createElement('canvas');canvas.width=reading.width;canvas.height=reading.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建导出画布。');
 ctx.drawImage(await loadImage(reading.image),0,0);
 if(reading.showAnnotations)for(const l of layoutAnnotations(reading.annotations,reading.style,reading.width,reading.height,reading.lines)){
   if(l.hidden)continue;
   ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.angle*Math.PI/180);ctx.globalAlpha=reading.style.opacity;
   if(reading.style.background){ctx.fillStyle='#fffdf4';ctx.fillRect(-l.width/2,-l.height/2,l.width,l.height);}
   ctx.fillStyle=reading.style.color;ctx.font=`600 ${l.fontSize}px ${ANNOTATION_FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(l.annotation.simplified,0,0);ctx.restore();
 }
 const blob=await canvasBlob(canvas,type);canvas.width=1;
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${reading.name.replace(/\.[^.]+$/,'')}-繁简旁注.${type==='image/png'?'png':'jpg'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 return blob;
}
