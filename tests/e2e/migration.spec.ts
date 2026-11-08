import {test,expect} from '@playwright/test';
test('saved legacy readings receive new pixel positions while preserving manual edits',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'体验示例',exact:true}).click();await expect(page.getByTestId('reading-svg')).toBeVisible();
 await page.getByRole('button',{name:'返回首页',exact:true}).click();
 const before=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fanjian-notes',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<{id:string;manualPosition:{x:number;y:number};changedId:string;oldX:number;hiddenId:string}>((resolve,reject)=>{
   const tx=db.transaction('readings','readwrite'),store=tx.objectStore('readings'),req=store.getAll();let value:Parameters<typeof resolve>[0];
   req.onsuccess=()=>{const r=req.result[0];r.demo=false;delete r.alignmentVersion;
    const [manual,hidden,changed]=r.annotations;manual.method='manual';manual.modified=true;manual.offset={x:4,y:-3};hidden.visible=false;hidden.modified=true;
    changed.position.x+=300;value={id:r.id,manualPosition:{...manual.position},changedId:changed.id,oldX:changed.position.x,hiddenId:hidden.id};store.put(r);
   };tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>reject(tx.error);
  });
 });
 await page.reload();await page.locator('.reading-card .reading-thumbnail').first().click();
 const state=()=>page.evaluate(async(id)=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fanjian-notes',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return new Promise<{alignmentVersion?:number;annotations:{id:string;position:{x:number;y:number};offset?:{x:number;y:number};visible:boolean;method:string}[]}>((resolve,reject)=>{const tx=db.transaction('readings','readonly'),req=tx.objectStore('readings').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});
 },before.id);
 await expect.poll(async()=>(await state()).alignmentVersion,{timeout:60000}).toBe(3);
 const after=await state();expect(after.annotations[0].method).toBe('manual');expect(after.annotations[0].position).toEqual(before.manualPosition);expect(after.annotations[0].offset).toEqual({x:4,y:-3});
 expect(after.annotations.find(a=>a.id===before.hiddenId)?.visible).toBe(false);expect(after.annotations.find(a=>a.id===before.changedId)!.position.x).toBeLessThan(before.oldX-150);
 await expect(page.getByRole('button',{name:'按照片重新定位',exact:true})).toBeEnabled();
});
