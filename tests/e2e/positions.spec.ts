import {test,expect,type Page} from '@playwright/test';
async function sample(page:Page,vertical=false,text='這是一個美麗的世界'){return page.evaluate(({vertical,text})=>{
 const c=document.createElement('canvas');c.width=vertical?1000:1400;c.height=vertical?Math.max(1200,150+Array.from(text).length*80):700;const g=c.getContext('2d')!;g.fillStyle='#fffaf0';g.fillRect(0,0,c.width,c.height);g.fillStyle='#1b201a';g.font='64px "SimSun","Noto Serif CJK SC",serif';g.translate(vertical?450:150,vertical?120:290);g.rotate(3*Math.PI/180);
 const positions=[0,76,151,235,313,388,469,550,633];while(positions.length<Array.from(text).length)positions.push(positions.at(-1)!+78);const expected:{original:string;x:number;y:number}[]=[];
 Array.from(text).forEach((char,i)=>{const x=vertical?0:positions[i],y=vertical?positions[i]:0,m=g.measureText(char),p=new DOMPoint(x+(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,y+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2).matrixTransform(g.getTransform());g.fillText(char,x,y);if('這個麗頭髮與發'.includes(char))expected.push({original:char,x:p.x,y:p.y});});
 return {base64:c.toDataURL('image/png').split(',')[1],expected};
},{vertical,text});}
async function savedReading(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fanjian-notes',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise<{annotations:{id:string;original:string;center:{x:number;y:number};visible:boolean;method:string}[]}>((resolve,reject)=>{const tx=db.transaction('readings','readonly'),r=tx.objectStore('readings').getAll();r.onsuccess=()=>resolve(r.result.at(-1));r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
});}
for(const [vertical,text] of [[false,'這是一個美麗的世界'],[true,'這是一個美麗的世界'],[true,'「這是一個美麗的世界。」頭髮與發展']] as const)test(`${vertical?'vertical':'horizontal'} ${text.length>10?'punctuated column':'short line'} real OCR notes match independently measured source glyphs`,async({page},testInfo)=>{
 await page.goto('./');const fixture=await sample(page,vertical,text);await page.getByTestId('file-upload').setInputFiles({name:'glyph-position.png',mimeType:'image/png',buffer:Buffer.from(fixture.base64,'base64')});
 await expect(page.getByRole('button',{name:'开始本地识别',exact:false})).toBeEnabled({timeout:30000});await page.getByRole('button',{name:'重置',exact:true}).click();
 await page.getByRole('button',{name:'开始本地识别',exact:false}).click();await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});
 await expect.poll(async()=>(await savedReading(page))?.annotations.length).toBeGreaterThan(0);const reading=await savedReading(page);
 const errors:number[]=[];for(const target of fixture.expected){const a=reading.annotations.find(n=>n.original===target.original);expect(a,`missing ${target.original}`).toBeTruthy();expect(a!.visible).toBe(true);expect(a!.method).toBe('recognition');const error=Math.hypot(a!.center.x-target.x,a!.center.y-target.y);errors.push(error);expect(error,`${target.original} source position error`).toBeLessThan(10);}
 console.log('MEASURED_GLYPH_ERROR',vertical?'vertical':'horizontal',errors.map(v=>+v.toFixed(2)));await testInfo.attach('source-position-errors.json',{body:JSON.stringify({fontSize:64,errors}),contentType:'application/json'});await page.screenshot({path:testInfo.outputPath('measured-positions.png')});
});
test('tap original glyph updates natural coordinates and the source highlight',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'体验示例',exact:true}).click();await page.getByTestId('annotation').first().click();await expect(page.getByTestId('source-highlight')).toBeVisible();
 await page.getByRole('button',{name:'点选照片中的原字定位',exact:true}).click();
 const point={x:300,y:440},screen=await page.getByTestId('shared-transform').evaluate((g,p)=>{const s=new DOMPoint(p.x,p.y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:s.x,y:s.y};},point);
 await page.mouse.click(screen.x,screen.y);await expect(page.getByRole('dialog',{name:'编辑旁注',exact:true})).toContainText('手动确认');await expect(page.getByTestId('source-highlight')).toBeVisible();
 await page.getByRole('button',{name:'保存阅读记录',exact:true}).click();await expect.poll(async()=>{const p=(await savedReading(page)).annotations.find(a=>a.method==='manual')?.center;return p?Math.hypot(p.x-point.x,p.y-point.y):Infinity;}).toBeLessThan(.1);
});
test('UVDoc really runs, supports undo, and repeats after an offline cold reload',async({page,context})=>{
 await page.goto('./');const f=await sample(page,true),image={name:'book.png',mimeType:'image/png',buffer:Buffer.from(f.base64,'base64')};await page.getByTestId('file-upload').setInputFiles(image);
 const rectify=page.getByRole('button',{name:'矫正透视与弯曲',exact:true});await expect(rectify).toBeEnabled({timeout:30000});const original=await page.locator('.preprocess-image image').getAttribute('href');await rectify.click();await expect(page.getByRole('button',{name:'撤销照片矫正',exact:true})).toBeVisible({timeout:150000});expect(await page.locator('.preprocess-image image').getAttribute('href')).not.toBe(original);
 await page.getByRole('button',{name:'撤销照片矫正',exact:true}).click();await expect(page.locator('.preprocess-image image')).toHaveAttribute('href',/^blob:/);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);await page.reload();await page.getByTestId('file-upload').setInputFiles(image);await expect(rectify).toBeEnabled({timeout:30000});await rectify.click();await expect(page.getByRole('button',{name:'撤销照片矫正',exact:true})).toBeVisible({timeout:150000});
});
