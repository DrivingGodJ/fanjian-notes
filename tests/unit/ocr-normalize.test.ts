import {describe,it,expect} from 'vitest';
import type {OcrResult} from '@paddleocr/paddleocr-js';
import {normalizeResult} from '../../src/ocr/normalize';
const result:OcrResult={image:{width:100,height:200},items:[{text:'這個',poly:[[10,20],[30,20],[30,80],[10,80]],score:.85}],metrics:{detMs:0,recMs:0,totalMs:0,detectedBoxes:1,recognizedCount:1},runtime:{requestedBackend:'wasm',detProvider:'wasm',recProvider:'wasm',webgpuAvailable:false}};
describe('official OCR line normalization',()=>{
 it('maps all four polygon corners back to full image size and infers direction',()=>{const [line]=normalizeResult(result,{width:1000,height:1000});expect(line.polygon[0]).toEqual({x:100,y:100});expect(line.polygon[2]).toEqual({x:300,y:400});expect(line.direction).toBe('vertical');expect(line.confidence).toBe(.85);});
 it('rejects invalid image dimensions',()=>expect(()=>normalizeResult({...result,image:{width:0,height:200}},{width:100,height:200})).toThrow('尺寸'));
 it('drops malformed polygons rather than inventing positions',()=>expect(normalizeResult({...result,items:[{...result.items[0],poly:[[NaN,1],[1,1],[2,2],[1,2]]}]},{width:100,height:200})).toEqual([]));
 it('does not turn missing confidence into a high score',()=>expect(normalizeResult({...result,items:[{...result.items[0],score:NaN}]},{width:100,height:200})[0].confidence).toBe(0));
});
