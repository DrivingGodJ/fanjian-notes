import {describe,it,expect} from 'vitest';import {decodeCtc,matchRecognizedCharacters,reconcileTraditionalCharacter,tarModel} from '../../src/alignment/ctc';import {toBgrTensor,fromBgrTensor} from '../../src/image-processing/unwarp-pixels';
describe('CTC timing and source identity',()=>{
 it('keeps separate repeated glyphs only when separated by a blank',()=>{
  const dict=['這','個'],indices=[0,1,1,0,1,0,2,2,0],data=new Float32Array(indices.length*3).fill(.01);indices.forEach((v,i)=>data[i*3+v]=.98);
  const tokens=decodeCtc(data,indices.length,3,dict);expect(tokens.map(t=>t.character)).toEqual(['這','這','個']);expect(tokens[0].start).toBeCloseTo(1/9);expect(tokens[0].end).toBeCloseTo(3/9);expect(tokens[2].anchor).toBeGreaterThan(tokens[1].anchor);
 });
 it('does not place tokens emitted in padded image space',()=>{const data=new Float32Array([.1,.9,.9,.1,.9,.1,.1,.9]);expect(decodeCtc(data,4,2,['這'],.5)).toHaveLength(1);});
 it('rejects mismatched model dictionaries and shapes',()=>expect(()=>decodeCtc(new Float32Array(4),2,2,[])).toThrow());
 it('matches actual glyphs after an OCR omission without shifting later annotations',()=>{const matches=matchRecognizedCharacters('這個麗','這是個麗');expect([...matches]).toEqual([[0,0],[1,2],[2,3]]);});
 it('rejects repeated characters with ambiguous correspondences',()=>{expect([...matchRecognizedCharacters('這這','這')]).toEqual([]);});
 it('ignores spacing while keeping Unicode source indices',()=>{expect([...matchRecognizedCharacters('這 𠮷個','這𠮷個')]).toEqual([[0,0],[2,1],[3,2]]);});
 it('accepts a unique substitution only after a user corrects the line',()=>{expect(matchRecognizedCharacters('這個麗','這個美').has(2)).toBe(false);expect(matchRecognizedCharacters('這個麗','這個美',true).get(2)).toBe(2);});
 it('matches simplified-equivalent characters and upgrades Pass-1 simplified glyphs back to Traditional',()=>{
  const eq=(a:string,b:string)=>a===b||(a==='这'&&b==='這')||(a==='个'&&b==='個');
  expect([...matchRecognizedCharacters('这是一个','這是一個',false,eq)]).toEqual([[0,0],[1,1],[2,2],[3,3]]);
  const sim=(s:string)=>s==='這'?'这':s==='體'?'体':s;
  expect(reconcileTraditionalCharacter('这','這',sim)).toBe('這');
  expect(reconcileTraditionalCharacter('的','的',sim)).toBe('的');
  expect(reconcileTraditionalCharacter('體','体',sim)).toBe('體');
 });
 it('extracts only a bounded model member from a tar archive',()=>{const bytes=new Uint8Array(1536),enc=new TextEncoder();bytes.set(enc.encode('rec/inference.onnx'));bytes.set(enc.encode('00000000003\0'),124);bytes.set([1,2,3],512);expect([...tarModel(bytes)]).toEqual([1,2,3]);bytes.set(enc.encode('77777777777\0'),124);expect(()=>tarModel(bytes)).toThrow();});
});
describe('Paddle UVDoc image contract',()=>{
 it('round trips BGR normalized NCHW without swapping red and blue',()=>{const rgba=new Uint8ClampedArray([255,12,0,255,0,127,255,255]);expect([...fromBgrTensor(toBgrTensor(rgba,2,1),[1,3,1,2]).rgba]).toEqual([...rgba]);});
 it('rejects unsupported or oversized model output',()=>{expect(()=>fromBgrTensor(new Float32Array(3),[1,3,5000,5000])).toThrow();expect(()=>fromBgrTensor(new Float32Array(3),[1,1,1,3])).toThrow();});
 it('rejects invalid image buffers and nonfinite output',()=>{expect(()=>toBgrTensor(new Uint8ClampedArray(3),1,1)).toThrow();expect(()=>fromBgrTensor(new Float32Array([0,NaN,0]),[1,3,1,1])).toThrow();});
});
