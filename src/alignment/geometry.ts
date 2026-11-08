import type { Direction, Point, Quad, ViewTransform } from '../types';
export const lerp = (a: Point,b: Point,t:number):Point => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
export function quadPoint(q:Quad,u:number,v:number):Point {return lerp(lerp(q[0],q[1],u),lerp(q[3],q[2],u),v);}
export function quadSize(q:Quad) {return {width:(distance(q[0],q[1])+distance(q[3],q[2]))/2,height:(distance(q[0],q[3])+distance(q[1],q[2]))/2};}
export function inferDirection(q:Quad):Direction {const s=quadSize(q);return s.height>s.width*1.4?'vertical':'horizontal';}
export function mapQuad(q:Quad,from:{width:number;height:number},to:{width:number;height:number}):Quad {
  return q.map(p=>({x:p.x*to.width/from.width,y:p.y*to.height/from.height})) as Quad;
}
export function screenToImage(p:Point,t:ViewTransform):Point {return {x:(p.x-t.x)/t.scale,y:(p.y-t.y)/t.scale};}
export function imageToScreen(p:Point,t:ViewTransform):Point {return {x:p.x*t.scale+t.x,y:p.y*t.scale+t.y};}
export function zoomAt(t:ViewTransform,anchor:Point,scale:number):ViewTransform {const p=screenToImage(anchor,t);return {scale,x:anchor.x-p.x*scale,y:anchor.y-p.y*scale};}
export function fitImage(width:number,height:number,vw:number,vh:number):ViewTransform {const scale=Math.min(vw/width,vh/height)*.92;return {scale,x:(vw-width*scale)/2,y:(vh-height*scale)/2};}
