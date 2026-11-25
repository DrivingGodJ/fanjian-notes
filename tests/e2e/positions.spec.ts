import {test,expect,type Page} from '@playwright/test';

async function sample(page:Page,vertical=false,text='這是一個美麗的世界'){return page.evaluate(({vertical,text})=>{
 const c=document.createElement('canvas');c.width=vertical?1000:1400;c.height=vertical?Math.max(1200,150+Array.from(text).length*80):700;const g=c.getContext('2d')!;g.fillStyle='#fffaf0';g.fillRect(0,0,c.width,c.height);g.fillStyle='#1b201a';g.font='64px "SimSun","Noto Serif CJK SC",serif';g.translate(vertical?450:150,vertical?120:290);g.rotate(3*Math.PI/180);
 const positions=[0,76,151,235,313,388,469,550,633];while(positions.length<Array.from(text).length)positions.push(positions.at(-1)!+78);const expected:{original:string;x:number;y:number}[]=[];
 Array.from(text).forEach((char,i)=>{const x=vertical?0:positions[i],y=vertical?positions[i]:0,m=g.measureText(char),p=new DOMPoint(x+(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,y+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2).matrixTransform(g.getTransform());g.fillText(char,x,y);if('這個麗頭髮與發'.includes(char))expected.push({original:char,x:p.x,y:p.y});});
 return {base64:c.toDataURL('image/png').split(',')[1],expected};
},{vertical,text});}

async function savedReading(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fanjian-notes',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise<{annotations:{id:string;original:string;center:{x:number;y:number};visible:boolean;method:string;bgColor?:string;inkColor?:string}[]}>((resolve,reject)=>{const tx=db.transaction('readings','readonly'),r=tx.objectStore('readings').getAll();r.onsuccess=()=>resolve(r.result.at(-1));r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});
});}

for(const [vertical,text] of [[false,'這是一個美麗的世界'],[true,'這是一個美麗的世界'],[true,'「這是一個美麗的世界。」頭髮與發展']] as const)test(`${vertical?'vertical':'horizontal'} ${text.length>10?'punctuated column':'short line'} real OCR replacements match independently measured source glyphs`,async({page},testInfo)=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.goto('./');
 const fixture=await sample(page,vertical,text);
 await page.getByTestId('file-upload').setInputFiles({name:'glyph-position.png',mimeType:'image/png',buffer:Buffer.from(fixture.base64,'base64')});
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});

 // Re-recognize without auto-deskew so coordinates align 1:1 with the raw tilted fixture for sub-10px measurement
 await page.getByLabel('自动矫正',{exact:true}).uncheck();
 await page.getByLabel('图片增强',{exact:true}).uncheck();
 await page.getByRole('button',{name:'重新识别',exact:true}).click();
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});

 await page.getByRole('button',{name:'保存阅读记录',exact:true}).click();
 await expect(page.getByRole('button',{name:'保存阅读记录',exact:true})).toContainText('已保存');
 await expect.poll(async()=>(await savedReading(page))?.annotations.length).toBeGreaterThan(0);
 const reading=await savedReading(page);

 const errors:number[]=[];
 for(const target of fixture.expected){
  const a=reading.annotations.find(n=>n.original===target.original);
  expect(a,`missing ${target.original}`).toBeTruthy();
  expect(a!.visible).toBe(true);
  expect(a!.method).toBe('recognition');
  expect(a!.bgColor).toMatch(/^rgb\(/);
  expect(a!.inkColor).toMatch(/^rgb\(/);
  const error=Math.hypot(a!.center.x-target.x,a!.center.y-target.y);
  errors.push(error);
  expect(error,`${target.original} source position error`).toBeLessThan(10);
 }
 console.log('MEASURED_GLYPH_ERROR',vertical?'vertical':'horizontal',errors.map(v=>+v.toFixed(2)));
 await testInfo.attach('source-position-errors.json',{body:JSON.stringify({fontSize:64,errors}),contentType:'application/json'});
});
