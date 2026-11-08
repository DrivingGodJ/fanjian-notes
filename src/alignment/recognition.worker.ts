/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import type {OcrLine,Point,Quad,CharacterEvidence} from '../types';
import {quadPoint,quadSize} from './geometry';import {decodeCtc,matchRecognizedCharacters,tarModel} from './ctc';
import {projectCharacters} from './projection';import {pixelSampler} from '../image-processing/analysis';
declare const self:DedicatedWorkerGlobalScope;
interface Request {rgba:Uint8ClampedArray;width:number;height:number;target:{width:number;height:number};lines:OcrLine[];archive:ArrayBuffer;config:{imageShape:number[];charDict:string[]};wasmPath:string}
self.onmessage=async(event:MessageEvent<Request>)=>{
 let session:ort.InferenceSession|undefined;
 try{
  const {rgba,width,height,target,lines,archive,config,wasmPath}=event.data;
  ort.env.wasm.wasmPaths=wasmPath;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  session=await ort.InferenceSession.create(tarModel(new Uint8Array(archive)),{executionProviders:['wasm']});
  const gray=new Uint8Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=Math.round(rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114);
  const sample=pixelSampler({data:gray,width,height},target),out:OcrLine[]=[];
  const rgb=(p:Point,ch:number)=>{const x=Math.max(0,Math.min(width-1,Math.round(p.x*width/target.width))),y=Math.max(0,Math.min(height-1,Math.round(p.y*height/target.height)));return rgba[(y*width+x)*4+ch];};
  for(let index=0;index<lines.length;index++){
   const line=lines[index];self.postMessage({status:`核对原字与位置 ${index+1} / ${lines.length}`});
   if(!line.text.trim()||Array.from(line.text).length>180){out.push({...line,characters:[],evidenceStatus:'unavailable'});continue;}
   const vertical=line.direction==='vertical',size=quadSize(line.polygon),across=vertical?size.width:size.height,along=vertical?size.height:size.width;
   if(across<2||along<2){out.push({...line,characters:[],evidenceStatus:'unavailable'});continue;}
   const h=config.imageShape[1],ratio=along/across,w=Math.max(1,Math.min(3200,Math.trunc(h*Math.max(config.imageShape[2]/h,ratio)))),validW=Math.min(w,Math.ceil(h*ratio));
   const input=new Float32Array(3*h*w);
   for(let y=0;y<h;y++)for(let x=0;x<validW;x++){
    const t=(x+.5)/validW,c=(y+.5)/h,p=vertical?quadPoint(line.polygon,1-c,t):quadPoint(line.polygon,t,c),offset=y*w+x;
    input[offset]=rgb(p,2)/127.5-1;input[h*w+offset]=rgb(p,1)/127.5-1;input[2*h*w+offset]=rgb(p,0)/127.5-1;
   }
   const tensors=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,h,w])}),tensor=tensors[session.outputNames[0]];
   if(tensor.type!=='float32'||tensor.dims.length!==3||tensor.dims[0]!==1)throw new Error('逐字识别模型输出维度不支持');
   const tokens=decodeCtc(tensor.data as Float32Array,tensor.dims[1],tensor.dims[2],config.charDict,validW/w).flatMap(t=>Array.from(t.character).map(c=>({...t,character:c,confidence:Array.from(t.character).length===1?t.confidence:.2}))),witness=tokens.map(t=>t.character).join('');
   const slots=projectCharacters({...line,text:witness},tokens.map(t=>t.character),sample,tokens.map(t=>t.anchor)),matches=matchRecognizedCharacters(line.text,witness,!!line.textCorrected),evidence:CharacterEvidence[]=[];
   for(const [sourceIndex,tokenIndex] of matches){
    const slot=slots?.[tokenIndex],token=tokens[tokenIndex];if(!slot||token.confidence<.55||slot.confidence<.42)continue;
    const polygon=(vertical?[quadPoint(line.polygon,slot.crossStart,slot.start),quadPoint(line.polygon,slot.crossEnd,slot.start),quadPoint(line.polygon,slot.crossEnd,slot.end),quadPoint(line.polygon,slot.crossStart,slot.end)]:[quadPoint(line.polygon,slot.start,slot.crossStart),quadPoint(line.polygon,slot.end,slot.crossStart),quadPoint(line.polygon,slot.end,slot.crossEnd),quadPoint(line.polygon,slot.start,slot.crossEnd)]) as Quad;
    evidence.push({sourceIndex,character:Array.from(line.text)[sourceIndex],polygon,confidence:Math.min(token.confidence,slot.confidence)});
   }
   out.push({...line,characters:evidence,evidenceStatus:line.text.replace(/\s/gu,'')===witness.replace(/\s/gu,'')?'verified':'mismatch'});
  }
  self.postMessage({result:out});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}finally{await session?.release();}
};
