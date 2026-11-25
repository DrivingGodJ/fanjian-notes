import {test,expect} from '@playwright/test';

test('saved legacy readings upgrade alignment and sample adaptive colors on open',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.goto('./');
 await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=900;c.height=300;const g=c.getContext('2d')!;
  g.fillStyle='#f7f1e1';g.fillRect(0,0,900,300);g.fillStyle='#1f231e';
  g.font='64px "SimSun","Noto Serif CJK SC",serif';g.fillText('這是一個美麗的世界',80,170);
  const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/png'));
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
   const r=indexedDB.open('fanjian-notes',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('readings',{keyPath:'id'});
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('readings','readwrite');
   tx.objectStore('readings').put({
    id:'legacy-1',name:'旧记录迁移.png',createdAt:1000,updatedAt:1000,
    image:blob,width:900,height:300,
    lines:[{id:'line-0',text:'這是一個美麗的世界',direction:'horizontal',confidence:.95,polygon:[{x:80,y:110},{x:660,y:110},{x:660,y:185},{x:80,y:185}]}],
    annotations:[{id:'line-0:0:0',lineId:'line-0',sourceIndex:0,original:'這',simplified:'这',center:{x:110,y:145},position:{x:110,y:95},direction:'horizontal',charWidth:64,charHeight:64,angle:0,ocrConfidence:.95,positionConfidence:.5,method:'geometry',modified:false,visible:true,kind:'character'}],
    style:{size:.94,color:'#222420',opacity:1,background:true},showAnnotations:true,view:{x:0,y:0,scale:0}
   });
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  });
 });
 await page.reload();
 await page.locator('.reading-card .reading-thumbnail').first().click();
 const state=()=>page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fanjian-notes',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<{alignmentVersion?:number;annotations:{bgColor?:string;inkColor?:string}[]}>((resolve,reject)=>{const tx=db.transaction('readings','readonly'),req=tx.objectStore('readings').get('legacy-1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});
 });
 await expect.poll(async()=>(await state()).alignmentVersion,{timeout:60000}).toBe(3);
 const after=await state();
 expect(after.annotations[0].bgColor).toMatch(/^rgb\(/);
 expect(after.annotations[0].inkColor).toMatch(/^rgb\(/);
});
