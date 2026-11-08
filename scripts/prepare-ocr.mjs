import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, copyFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
const require=createRequire(import.meta.url), root=path.resolve(import.meta.dirname,'..'), dest=path.join(root,'public/ocr');
await mkdir(dest,{recursive:true});
const sdk=path.dirname(fileURLToPath(import.meta.resolve('@paddleocr/paddleocr-js')));
const worker=(await readdir(path.join(sdk,'assets'))).find(f=>/^worker-entry-.*\.js$/.test(f));
if(!worker)throw new Error('Official SDK worker asset not found');
await copyFile(path.join(sdk,'assets',worker),path.join(dest,'worker.js'));
// The SDK 0.4.2 official bundled worker embeds ORT 1.24.3; runtime files must match it.
const ort=path.resolve(path.dirname(require.resolve('onnxruntime-web',{paths:[sdk]})),'..');
const ortVersion=JSON.parse(await readFile(path.join(ort,'package.json'),'utf8')).version;
if(ortVersion!=='1.24.3')throw new Error(`Expected onnxruntime-web 1.24.3, got ${ortVersion}; install the lockfile`);
const files=['worker.js'];
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']){
  await copyFile(path.join(ort,'dist',name),path.join(dest,name));files.push(name);
}
const modelHashes={det:'781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30',rec:'f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fetchModel(url,expectedHash){
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.subarray(257,262).toString()!=='ustar'||digest(bytes)!==expectedHash)throw new Error('Official model archive checksum mismatch');
  return bytes;
}
for(const [short,name] of [['det','PP-OCRv5_mobile_det'],['rec','PP-OCRv5_mobile_rec']]) {
  const file=`${short}.tar`, out=path.join(dest,file);
  const cached=await readFile(out).catch(()=>null);
  if(!cached||digest(cached)!==modelHashes[short]) {
    const sources=[`https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${name}_onnx_infer.tar`,`https://drivinggodj.github.io/fanjian-notes/ocr/${file}`];
    let bytes;
    for(const url of sources){
      for(let attempt=1;attempt<=2&&!bytes;attempt++){
        console.log(`Downloading verified ${name}, attempt ${attempt}: ${new URL(url).host}`);
        try{bytes=await fetchModel(url,modelHashes[short]);}
        catch(error){console.warn(`Model download failed: ${error.message}`);}
      }
      if(bytes)break;
    }
    if(!bytes)throw new Error(`Unable to download the pinned official model: ${name}`);
    await writeFile(out+'.partial',bytes);await rename(out+'.partial',out);
  }
  files.push(file);
}
const recArchive=await readFile(path.join(dest,'rec.tar'));let recConfig;
for(let p=0;p+512<=recArchive.length;){const h=recArchive.subarray(p,p+512),name=h.subarray(0,100).toString().replace(/\0.*/,''),size=parseInt(h.subarray(124,136).toString().replace(/\0.*/,''),8)||0;if(!name)break;if(name.endsWith('/inference.yml'))recConfig=yaml.load(recArchive.subarray(p+512,p+512+size).toString());p+=512+Math.ceil(size/512)*512;}
const resize=recConfig?.PreProcess?.transform_ops?.find(op=>op.RecResizeImg)?.RecResizeImg;
if(!resize?.image_shape||!Array.isArray(recConfig?.PostProcess?.character_dict))throw Error('Official recognition config is invalid');
await writeFile(path.join(dest,'rec-params.json'),JSON.stringify({imageShape:resize.image_shape,charDict:[...recConfig.PostProcess.character_dict,' ']}));files.push('rec-params.json');
const assets=[];
for(const file of files){const data=await readFile(path.join(dest,file));assets.push({url:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(path.join(dest,'manifest.json'),JSON.stringify({version:'paddle-0.4.2-ort-1.24.3-v5-mobile',assets},null,2));
// Install icons are authored assets in public/, never regenerated over the approved artwork.
console.log(`OCR assets ready: ${(assets.reduce((s,a)=>s+a.bytes,0)/1048576).toFixed(1)} MiB. All served locally.`);
await import('./prepare-unwarp.mjs');
