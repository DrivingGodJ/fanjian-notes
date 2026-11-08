import {describe,it,expect} from 'vitest';
import {estimateDeskew,type GrayImage} from '../../src/image-processing/analysis';
import {rotatedSize} from '../../src/image-processing/images';
function page(direction:'horizontal'|'vertical',angle:number):GrayImage{
 const width=520,height=680,data=new Uint8Array(width*height).fill(238),r=-angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const xx=(x-width/2)*c-(y-height/2)*s+width/2,yy=(x-width/2)*s+(y-height/2)*c+height/2;
  const a=direction==='vertical'?xx:yy,b=direction==='vertical'?yy:xx;
  if(a>65&&a<455&&b>75&&b<495&&((a-65)%62)<25&&((b-75)%39)<26){
   const aa=(a-65)%62,bb=(b-75)%39;if(aa<4||aa>20||bb<4||bb>21)data[y*width+x]=28;
  }
 }
 return {data,width,height};
}
describe('automatic text deskew',()=>{
 it.each([-6,-2.5,3,7])('straightens a vertical page tilted %s degrees',angle=>{const r=estimateDeskew(page('vertical',angle));expect(r.confidence).toBeGreaterThan(.35);expect(r.direction).toBe('vertical');expect(Math.abs(r.angle+angle)).toBeLessThan(.5);});
 it.each([-4,5])('straightens a horizontal page tilted %s degrees',angle=>{const r=estimateDeskew(page('horizontal',angle));expect(r.confidence).toBeGreaterThan(.35);expect(r.direction).toBe('horizontal');expect(Math.abs(r.angle+angle)).toBeLessThan(.5);});
 it('leaves an already straight page unchanged',()=>expect(estimateDeskew(page('vertical',0)).angle).toBe(0));
 it('does not rotate a blank photo with fabricated confidence',()=>{const r=estimateDeskew({data:new Uint8Array(200*300).fill(245),width:200,height:300});expect(r.angle).toBe(0);expect(r.confidence).toBe(0);});
 it('expands the canvas instead of clipping corners when rotated',()=>{expect(rotatedSize(100,200,90)).toEqual({width:200,height:100});expect(rotatedSize(100,200,5).width).toBeGreaterThan(100);expect(rotatedSize(100,200,5).height).toBeGreaterThan(200);});
});
