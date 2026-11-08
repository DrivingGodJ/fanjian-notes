import {readFile,writeFile,rename} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';
const dest=path.resolve(import.meta.dirname,'../public/ocr'),archiveHash='8b46701b8c3453c0eb2bbb9ef65c40ac2cbcfa1d3a07a4191a8eb920b297ae82',modelHash='54cab30dc2cf347b4f3d6971c833b1c3d84f5ef17280f1f6d15796bff20e63d6';
const digest=b=>createHash('sha256').update(b).digest('hex');
let archive=await readFile(path.join(dest,'uvdoc.tar')).catch(()=>null);
if(!archive||digest(archive)!==archiveHash){
 archive=null;for(const url of ['https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/UVDoc_onnx_infer.tar','https://drivinggodj.github.io/fanjian-notes/ocr/uvdoc.tar']){
  for(let attempt=0;attempt<2&&!archive;attempt++)try{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(digest(b)!==archiveHash)throw Error('UVDoc archive checksum mismatch');archive=b;}catch(e){console.warn(`UVDoc download: ${e.message}`);}if(archive)break;
 }if(!archive)throw Error('Unable to prepare the verified official UVDoc model');await writeFile(path.join(dest,'uvdoc.tar.partial'),archive);await rename(path.join(dest,'uvdoc.tar.partial'),path.join(dest,'uvdoc.tar'));
}
let model;
for(let p=0;p+512<=archive.length;){const h=archive.subarray(p,p+512),name=h.subarray(0,100).toString().replace(/\0.*/,''),size=parseInt(h.subarray(124,136).toString().replace(/\0.*/,''),8)||0;if(!name)break;if(name==='UVDoc_onnx_infer/inference.onnx')model=archive.subarray(p+512,p+512+size);p+=512+Math.ceil(size/512)*512;}
if(!model||model.length!==31684150||digest(model)!==modelHash)throw Error('Official UVDoc ONNX checksum mismatch');
await writeFile(path.join(dest,'uvdoc.onnx'),model);console.log('Optional UVDoc rectification model ready: 30.2 MiB.');
