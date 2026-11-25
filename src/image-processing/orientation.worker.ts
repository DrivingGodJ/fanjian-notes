/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import {tarModel} from '../alignment/ctc';

declare const self:DedicatedWorkerGlobalScope;

interface Request {
 strips:Uint8ClampedArray[];
 width:number;
 height:number;
 archive:ArrayBuffer;
 charDict:string[];
 wasmPath:string;
}

self.onmessage=async(event:MessageEvent<Request>)=>{
 let session:ort.InferenceSession|undefined;
 try{
  const {strips,width,height,archive,charDict,wasmPath}=event.data;
  ort.env.wasm.wasmPaths=wasmPath;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  session=await ort.InferenceSession.create(tarModel(new Uint8Array(archive)),{executionProviders:['wasm']});
  const count=width*height;
  const scores:[number,number,number,number]=[0,0,0,0];

  for(let idx=0;idx<4;idx++){
   const rgba=strips[idx];
   const input=new Float32Array(3*count);
   for(let i=0;i<count;i++){
    input[i]=rgba[i*4+2]/127.5-1;
    input[count+i]=rgba[i*4+1]/127.5-1;
    input[2*count+i]=rgba[i*4]/127.5-1;
   }
   const out=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,height,width])});
   const tensor=out[session.outputNames[0]];
   if(tensor.type!=='float32'||tensor.dims.length!==3||tensor.dims[0]!==1)throw new Error('方向检测模型输出维度不支持');
   const data=tensor.data as Float32Array,T=tensor.dims[1],C=tensor.dims[2];
   let sum=0,prev=0;
   for(let t=0;t<T;t++){
    let best=0,bestV=-1e9;
    for(let c=0;c<C;c++){const v=data[t*C+c];if(v>bestV){bestV=v;best=c;}}
    if(best>0&&best!==prev){
     const ch=charDict[best-1]||'';
     if(/^\p{Script=Han}$/u.test(ch)&&bestV>.25)sum+=bestV;
    }
    prev=best;
   }
   scores[idx]=sum;
  }
  self.postMessage({result:scores});
 }catch(e){
  self.postMessage({error:e instanceof Error?e.message:String(e)});
 }finally{
  await session?.release();
 }
};
