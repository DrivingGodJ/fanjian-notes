import {describe,it,expect} from 'vitest';
import {CharacterAlignmentEngine} from '../../src/alignment/CharacterAlignmentEngine';
import {imageToScreen,screenToImage,zoomAt,mapQuad,inferDirection,quadPoint} from '../../src/alignment/geometry';
import {layoutAnnotations} from '../../src/annotation/layout';
import {DEFAULT_STYLE,type OcrLine,type Quad} from '../../src/types';
const engine=new CharacterAlignmentEngine();
const line:OcrLine={id:'one',text:'這是一個美麗的世界',polygon:[{x:100,y:100},{x:1000,y:190},{x:995,y:240},{x:95,y:150}],confidence:.95,direction:'horizontal'};
describe('character positions from line geometry',()=>{
 it('interpolates a slanted quadrilateral instead of horizontal splitting',()=>{
  const notes=engine.align(line);expect(notes).toHaveLength(3);expect(notes[0].center.x).toBeCloseTo(147.5);expect(notes[0].center.y).toBeCloseTo(130);expect(notes[2].center.y).toBeGreaterThan(notes[0].center.y);expect(notes.every(a=>a.position.y<a.center.y)).toBe(true);expect(notes.every(a=>a.positionConfidence<.7)).toBe(true);
 });
 it('places vertical annotations to the right, top to bottom',()=>{
  const l:OcrLine={...line,text:'這個麗',direction:'vertical',polygon:[{x:50,y:30},{x:100,y:30},{x:100,y:330},{x:50,y:330}]};
  const notes=engine.align(l);expect(notes[1].center.y).toBeGreaterThan(notes[0].center.y);expect(notes.every(a=>a.position.x>a.center.x)).toBe(true);expect(inferDirection(l.polygon)).toBe('vertical');
 });
 it('does not invent pixel precision for a flat, featureless image',()=>{
  const notes=engine.align({...line,text:'這 v2 麗'},()=>.5);expect(notes.every(a=>a.positionConfidence<.35)).toBe(true);expect(notes[0].method).toBe('geometry');expect(notes.every(a=>a.needsReview&&!a.visible)).toBe(true);
 });
 it('handles empty and punctuation-only text',()=>{expect(engine.align({...line,text:''})).toEqual([]);expect(engine.align({...line,text:'，。！？123'})).toEqual([]);});
 it('uses the entire quadrilateral for perspective interpolation',()=>{const q:Quad=[{x:0,y:0},{x:200,y:20},{x:180,y:120},{x:20,y:80}];expect(quadPoint(q,.5,.5)).toEqual({x:100,y:55});});
});
describe('natural-pixel transforms and layout',()=>{
 it('maps OCR resized-image polygons back to the reading image',()=>{const q:Quad=[{x:10,y:20},{x:30,y:20},{x:30,y:40},{x:10,y:40}];expect(mapQuad(q,{width:100,height:200},{width:1000,height:1000})[0]).toEqual({x:100,y:100});});
 it('round trips pixels through zoom and pan, including fractional scales',()=>{const t={x:-43.3,y:75.2,scale:2.719},p={x:129.3,y:490.7};const actual=screenToImage(imageToScreen(p,t),t);expect(actual.x).toBeCloseTo(p.x);expect(actual.y).toBeCloseTo(p.y);});
 it('preserves the point underneath a pinch anchor through repeated zooms',()=>{let t={x:50,y:80,scale:.5};const anchor={x:212,y:164},p=screenToImage(anchor,t);for(const scale of [.71,2.3,.35,4.2,.5]){t=zoomAt(t,anchor,scale);expect(imageToScreen(p,t).x).toBeCloseTo(anchor.x);expect(imageToScreen(p,t).y).toBeCloseTo(anchor.y);}});
 it('hides an edge label instead of moving it onto unrelated text',()=>{const a=engine.align(line)[0];const labels=layoutAnnotations([{...a,id:'a',center:{x:5,y:10},position:{x:5,y:-10},angle:0}],DEFAULT_STYLE,1200,500);expect(labels[0].hidden).toBe(true);});
 it('excludes hidden/deleted annotations from both render and export layout',()=>{const notes=engine.align(line);expect(layoutAnnotations([{...notes[0],visible:false},{...notes[1],deleted:true},notes[2]],DEFAULT_STYLE,1200,500)).toHaveLength(1);});
});
describe('whole-column projection and safe gutters',()=>{
 const column:OcrLine={id:'column',text:'這個美麗頭髮',direction:'vertical',confidence:.95,polygon:[{x:30,y:0},{x:70,y:0},{x:70,y:310},{x:30,y:310}]};
 it('uses real uneven character positions, not equal fractions of a long column',()=>{
  const centers=[20,58,105,158,223,285];
  const sample=(p:{x:number;y:number})=>p.x>38&&p.x<63&&centers.some(y=>Math.abs(p.y-y)<12)?.95:.05;
  const notes=engine.align(column,sample);expect(notes.every(a=>a.method==='projection'&&!a.needsReview)).toBe(true);
  for(const a of notes)expect(Math.abs(a.center.y-centers[a.sourceIndex])).toBeLessThan(6);
 });
 it('interpolates pixel-refined centers through a slanted quadrilateral',()=>{
  const slanted={...column,polygon:[{x:50,y:10},{x:90,y:10},{x:121,y:320},{x:81,y:320}] as Quad};
  const centers=[20,58,105,158,223,285];const sample=(p:{x:number;y:number})=>{const x=p.x-(p.y-10)*.1;return x>58&&x<83&&centers.some(y=>Math.abs(p.y-10-y)<12)?.95:.05;};
  const notes=engine.align(slanted,sample);expect(notes.every(a=>a.method==='projection')).toBe(true);expect(notes.at(-1)!.center.x).toBeGreaterThan(notes[0].center.x+20);
 });
 it('shrinks notes into the gutter without pushing them across the adjacent column',()=>{
  const a={...engine.align(column)[0],center:{x:110,y:100},position:{x:143,y:100},charWidth:40,charHeight:40};
  const neighbor:OcrLine={...column,id:'neighbor',polygon:[{x:145,y:0},{x:185,y:0},{x:185,y:400},{x:145,y:400}]};
  const [l]=layoutAnnotations([a],DEFAULT_STYLE,400,500,[neighbor]);expect(l.hidden).toBe(false);expect(l.fontSize).toBeLessThan(40*DEFAULT_STYLE.size);expect(l.x+l.width/2).toBeLessThan(151);expect(l.y).toBe(100);
 });
 it('suppresses crowded notes rather than migrating to the next column',()=>{
  const a={...engine.align(column)[0],center:{x:110,y:100},position:{x:143,y:100},charWidth:40,charHeight:40};
  const neighbor:OcrLine={...column,id:'neighbor',polygon:[{x:130,y:0},{x:170,y:0},{x:170,y:400},{x:130,y:400}]};
  expect(layoutAnnotations([a],DEFAULT_STYLE,400,500,[neighbor])[0].hidden).toBe(true);
 });
});
