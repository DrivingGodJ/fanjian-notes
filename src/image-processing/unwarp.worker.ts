/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import {fromBgrTensor,toBgrTensor} from './unwarp-pixels';
declare const self:DedicatedWorkerGlobalScope;
self.onmessage=async(event:MessageEvent<{rgba:Uint8ClampedArray;width:number;height:number;model:ArrayBuffer;wasmPath:string}>)=>{
 let session:ort.InferenceSession|undefined;
 try{
  const {rgba,width,height,model,wasmPath}=event.data;ort.env.wasm.wasmPaths=wasmPath;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  self.postMessage({status:'初始化本地书页展平模型'});
  session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const input=new ort.Tensor('float32',toBgrTensor(rgba,width,height),[1,3,height,width]);
  self.postMessage({status:'正在本机矫正透视与纸张弯曲…'});
  const outputs=await session.run({[session.inputNames[0]]:input}),result=outputs[session.outputNames[0]];
  if(result.type!=='float32')throw new Error('展平模型输出类型不支持');
  const image=fromBgrTensor(result.data as Float32Array,result.dims);
  self.postMessage({result:image},[image.rgba.buffer]);
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
 finally{await session?.release();}
};
