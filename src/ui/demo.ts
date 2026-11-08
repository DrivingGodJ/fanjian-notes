import type {OcrLine,Reading} from '../types';
import {DEFAULT_STYLE} from '../types';
import {CharacterAlignmentEngine} from '../alignment/CharacterAlignmentEngine';
import {canvasBlob} from '../image-processing/images';
export async function createDemo(vertical=false):Promise<Reading>{
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;const c=canvas.getContext('2d')!;
 const gradient=c.createLinearGradient(0,0,1200,1500);gradient.addColorStop(0,'#eae5d7');gradient.addColorStop(.45,'#fbf6e9');gradient.addColorStop(1,'#e7dfcd');c.fillStyle=gradient;c.fillRect(0,0,1200,1500);
 c.strokeStyle='#d5cdb9';c.strokeRect(46,45,1108,1410);c.fillStyle='#526452';c.font='22px serif';c.fillText('慢 读 生 活    /    A MOMENT TO READ',96,125);
 c.fillStyle='#253b30';c.font='64px serif';c.fillText('在文字裡，遇見世界',96,260);
 c.fillStyle='#a9a18d';c.fillRect(96,310,1008,1);
 const texts=vertical?['這是一個美麗的世界','願每一次閱讀都有所得','頭髮隨著微風輕輕飄動']:['這是一個美麗的世界','在閱讀裡，讓時間慢下來。','一頁書，一杯茶，一段好時光。','頭髮隨著微風輕輕飄動。','從電腦與軟體，到山川與湖泊，','生活總有值得發現的美好。'];
 const lines:OcrLine[]=[];
 c.save();c.translate(90,410);c.rotate(-.025);c.font='46px serif';c.fillStyle='#35392f';
 const point=(x:number,y:number)=>({x:90+x*Math.cos(-.025)-y*Math.sin(-.025),y:410+x*Math.sin(-.025)+y*Math.cos(-.025)});
 texts.forEach((text,i)=>{
  if(vertical){const x=850-i*190;Array.from(text).forEach((char,k)=>c.fillText(char,x,k*61));const h=Array.from(text).length*61;lines.push({id:`demo-${i}`,text,polygon:[point(x,-45),point(x+48,-45),point(x+48,h-15),point(x,h-15)],confidence:1,direction:'vertical'});}
  else{const y=i*135;c.fillText(text,0,y);const w=c.measureText(text).width;lines.push({id:`demo-${i}`,text,polygon:[point(0,y-43),point(w,y-43),point(w,y+5),point(0,y+5)],confidence:1,direction:'horizontal'});}
 });c.restore();
 c.fillStyle='#928a77';c.font='20px sans-serif';c.fillText('演示图片 · 已知文本与坐标，未经过 OCR',96,1350);c.fillText('FANJIAN NOTES                                        01 / 慢读',96,1390);
 const now=Date.now();return {id:crypto.randomUUID(),name:vertical?'竖排阅读示例':'一页书的时光 · 示例',createdAt:now,updatedAt:now,image:await canvasBlob(canvas,'image/png'),width:1200,height:1500,
 lines,annotations:new CharacterAlignmentEngine().alignAll(lines),style:{...DEFAULT_STYLE},view:{x:0,y:0,scale:0},showAnnotations:true,demo:true};
}
