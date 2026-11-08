import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page){
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=650;const ctx=c.getContext('2d')!;ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,1600,650);ctx.fillStyle='#161d18';ctx.font='90px "SimSun","Noto Serif CJK SC",serif';ctx.fillText('這是一個美麗的世界',110,230);ctx.font='76px "SimSun","Noto Serif CJK SC",serif';ctx.fillText('頭髮 發展 電腦與軟體',110,460);return c.toDataURL('image/png').split(',')[1];});
 return {name:'繁体识别验收.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}
test('mobile home, demo, shared transform, correction, export and persistence',async({page,context},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 await expect(page.getByRole('button',{name:'拍照识别',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('home-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'体验示例',exact:true}).click();
 await expect(page.getByTestId('annotation').first()).toBeVisible();
 expect(await page.getByTestId('annotation').filter({has:page.locator('text')}).count()).toBeGreaterThan(3);
 const own=await page.getByTestId('annotation').first().getAttribute('transform');const shared=await page.getByTestId('shared-transform').getAttribute('transform');
 await page.getByRole('button',{name:'放大',exact:true}).click();
 expect(await page.getByTestId('shared-transform').getAttribute('transform')).not.toBe(shared);
 expect(await page.getByTestId('annotation').first().getAttribute('transform')).toBe(own);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:350},{x:250,y:490}]});
 for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140-i*5,y:350-i*5},{x:250+i*5,y:490+i*5}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(await page.getByTestId('annotation').first().getAttribute('transform')).toBe(own);
 await page.getByRole('button',{name:'适合屏幕',exact:true}).click();
 await page.getByRole('button',{name:'隐藏旁注',exact:true}).click();await expect(page.getByTestId('annotation')).toHaveCount(0);await page.getByRole('button',{name:'显示旁注',exact:true}).click();
 const count=await page.getByTestId('annotation').count();await page.getByTestId('annotation').first().click();await expect(page.getByRole('dialog',{name:'编辑旁注',exact:true})).toBeVisible();await page.getByRole('button',{name:'隐藏这一处',exact:true}).click();await expect(page.getByTestId('annotation')).toHaveCount(count-1);await page.getByRole('button',{name:'恢复显示',exact:true}).click();await expect(page.getByTestId('annotation')).toHaveCount(count);await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await page.getByRole('button',{name:'编辑识别原文',exact:true}).click();
 const editor=page.locator('.line-editor').first();await editor.locator('textarea').fill('這是一個溫暖的世界');await editor.getByRole('button',{name:'应用修正',exact:true}).click();
 await expect(page.getByTestId('annotation').filter({has:page.locator('title',{hasText:'溫 → 温'})})).toHaveCount(1);
 await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await page.getByRole('button',{name:'旁注样式',exact:true}).click();await page.getByLabel('旁注颜色',{exact:true}).fill('#123456');await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await page.getByRole('button',{name:'导出图片',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'PNG · 清晰无损',exact:true}).click();const download=await downloadPromise;
 const out=testInfo.outputPath('annotated.png');await download.saveAs(out);const {readFile}=await import('node:fs/promises');const png=await readFile(out);expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(1500);
 await page.getByRole('button',{name:'关闭面板',exact:true}).click();await page.screenshot({path:testInfo.outputPath('reader-mobile.png')});
 await page.getByRole('button',{name:'保存阅读记录',exact:true}).click();await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.reload();await page.locator('.reading-card').first().locator('.reading-thumbnail').click();
 await page.getByRole('button',{name:'编辑识别原文',exact:true}).click();await expect(page.locator('.line-editor textarea').first()).toHaveValue('這是一個溫暖的世界');expect(errors).toEqual([]);
});
test('camera denial provides a file-input fallback',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'拍照识别',exact:true}).click();await expect(page.getByRole('button',{name:'相册 / 系统拍照',exact:true})).toBeVisible();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'相册 / 系统拍照',exact:true}).click();await (await chooser).setFiles(await fixture(page));await expect(page.getByRole('button',{name:'开始本地识别',exact:false})).toBeVisible();
});
test('crop and rotation preview share the actual output geometry; cancel restores preparation',async({page})=>{
 await page.goto('./');await page.getByTestId('file-upload').setInputFiles(await fixture(page));await page.getByRole('button',{name:'旋转 90°',exact:true}).click();
 await expect(page.getByLabel('待识别照片与裁剪区域')).toHaveAttribute('viewBox','0 0 650 1600');
 await page.getByRole('button',{name:'裁剪边缘',exact:true}).click();
 await page.getByLabel('裁剪left',{exact:true}).fill('0.1');
 await page.getByRole('button',{name:'开始本地识别',exact:false}).click();await page.getByRole('button',{name:'取消识别',exact:true}).click();
 await expect(page.getByRole('button',{name:'开始本地识别',exact:false})).toBeVisible();
 await expect(page.getByLabel('待识别照片与裁剪区域')).toHaveAttribute('viewBox','0 0 585 1600');
});
test('desktop home has no overflow',async({page},testInfo)=>{
 await page.setViewportSize({width:1440,height:1040});await page.goto('./');await expect(page.locator('.sidebar')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('home-desktop.png'),fullPage:true});
});
test('real traditional OCR, no upload, offline cold reload and recognition',async({page,context},testInfo)=>{
 page.on('requestfailed',r=>console.log('FAILED_REQUEST',r.url(),r.failure()?.errorText));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const requests:{method:string;url:string}[]=[];context.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 await page.goto('./');const image=await fixture(page);await page.getByTestId('file-upload').setInputFiles(image);await page.getByRole('button',{name:'开始本地识别',exact:false}).click();
 await page.getByTestId('reading-svg').or(page.locator('.processing [role="alert"]')).waitFor({timeout:150000});
 await expect(page.locator('.processing [role="alert"]')).toHaveCount(0);
 await expect(page.getByTestId('reading-svg')).toBeVisible();
 await page.getByRole('button',{name:'编辑识别原文',exact:true}).click();
 const texts=await page.locator('.line-editor textarea').evaluateAll(nodes=>nodes.map(n=>(n as HTMLTextAreaElement).value));console.log('REAL_OCR_TEXT',texts);expect(texts.some(t=>t.includes('這是一個美麗的世界'))).toBe(true);
 const lineIndex=texts.findIndex(t=>t==='這是一個美麗的世界');
 expect(await page.locator(`[data-line="line-${lineIndex}"]`).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-original')))).toEqual(['這','個','麗']);
 expect(await page.locator('[data-original="這"]').count()).toBeGreaterThan(0);expect(await page.locator('[data-original="個"]').count()).toBeGreaterThan(0);expect(await page.locator('[data-original="麗"]').count()).toBeGreaterThan(0);
 await page.getByRole('button',{name:'关闭面板',exact:true}).click();await page.screenshot({path:testInfo.outputPath('real-ocr-mobile.png')});
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;if(!r.active)throw Error('No active SW');});
 await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'拍照识别',exact:true})).toBeVisible();
 await page.getByTestId('file-upload').setInputFiles(image);await page.getByRole('button',{name:'开始本地识别',exact:false}).click();await page.getByTestId('reading-svg').or(page.locator('.processing [role="alert"]')).waitFor({timeout:150000});await expect(page.locator('.processing [role="alert"]')).toHaveCount(0);await expect(page.getByTestId('reading-svg')).toBeVisible();
 expect(requests.filter(r=>r.method!=='GET')).toEqual([]);expect(requests.every(r=>r.url.startsWith(new URL(testInfo.project.use.baseURL!).origin+'/')||r.url.startsWith('blob:'))).toBe(true);expect(errors).toEqual([]);
});
