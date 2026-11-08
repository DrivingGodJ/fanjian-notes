import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, copyFile, readdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
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
for(const [short,name] of [['det','PP-OCRv5_mobile_det'],['rec','PP-OCRv5_mobile_rec']]) {
  const file=`${short}.tar`, out=path.join(dest,file);
  if((await stat(out).catch(()=>({size:0}))).size<100000) {
    const url=`https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${name}_onnx_infer.tar`;
    console.log(`Downloading official ${name}…`);
    const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
    if(!response.ok)throw new Error(`${response.status}: ${url}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.subarray(257,262).toString()!=='ustar')throw new Error('Expected uncompressed ustar archive');
    await writeFile(out+'.partial',bytes);await rename(out+'.partial',out);
  }
  files.push(file);
}
const assets=[];
for(const file of files){const data=await readFile(path.join(dest,file));assets.push({url:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(path.join(dest,'manifest.json'),JSON.stringify({version:'paddle-0.4.2-ort-1.24.3-v5-mobile',assets},null,2));
// Dependency-free PNG icons, keeping install assets fully self-hosted.
function crc32(b){let c=~0;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^~0)>>>0;}
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
for(const size of [192,512]){
 const raw=Buffer.alloc((size*3+1)*size);for(let y=0;y<size;y++){for(let x=0;x<size;x++){const i=y*(size*3+1)+1+x*3;let color=[40,87,69];const nx=x/size,ny=y/size;
 if(nx>.22&&nx<.78&&ny>.29&&ny<.73)color=[246,247,242];if(Math.abs(nx-.5)<.013&&ny>.29&&ny<.74)color=[184,206,156];
 if(((nx>.28&&nx<.44)||(nx>.56&&nx<.72))&&[.4,.48,.56].some(v=>Math.abs(ny-v)<.009))color=[40,87,69];color.forEach((v,k)=>raw[i+k]=v);}}
 const head=Buffer.alloc(13);head.writeUInt32BE(size);head.writeUInt32BE(size,4);head[8]=8;head[9]=2;
 await writeFile(path.join(root,`public/icon-${size}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
console.log(`OCR assets ready: ${(assets.reduce((s,a)=>s+a.bytes,0)/1048576).toFixed(1)} MiB. All served locally.`);
