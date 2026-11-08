/// <reference lib="webworker" />
import {estimateDeskew,pixelSampler,type GrayImage} from './analysis';
import {CharacterAlignmentEngine} from '../alignment/CharacterAlignmentEngine';
import type {OcrLine} from '../types';
declare const self:DedicatedWorkerGlobalScope;
self.onmessage=(event:MessageEvent<{operation:'deskew'|'align';image:GrayImage;target:{width:number;height:number};lines?:OcrLine[]}>)=>{
 try{const {operation,image,target,lines}=event.data;self.postMessage({result:operation==='deskew'?estimateDeskew(image):new CharacterAlignmentEngine().alignAll(lines??[],pixelSampler(image,target))});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
