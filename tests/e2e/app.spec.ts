import {test,expect,type Page} from '@playwright/test';

async function fixture(page:Page){
 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=1600;c.height=650;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,1600,650);ctx.fillStyle='#161d18';
  ctx.font='90px "SimSun","Noto Serif CJK SC",serif';ctx.fillText('這是一個美麗的世界',110,230);
  ctx.font='76px "SimSun","Noto Serif CJK SC",serif';ctx.fillText('頭髮 發展 電腦與軟體',110,460);
  return c.toDataURL('image/png').split(',')[1];
 });
 return {name:'繁体识别验收.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}

test('first-time onboarding prompt appears once, demo is removed, and home has no overflow',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');
 await expect(page.getByRole('dialog',{name:'首次使用模型安装引导',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'立即安装离线模型',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'稍后再说',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'首次使用模型安装引导',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'准备离线模型',exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'拍照识别',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'从相册导入',exact:true})).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('dialog',{name:'首次使用模型安装引导',exact:true})).toHaveCount(0);
 await expect(page.getByText('体验示例')).toHaveCount(0);
 await page.evaluate(()=>document.fonts.load('400 16px "Source Han Serif"','繁简旁注'));
 await expect(page.locator('.mobile-header').getByRole('button',{name:'检查更新',exact:true})).toBeVisible();
 await expect(page.locator('.topbar-update')).toBeHidden();
 await page.locator('.mobile-header').getByRole('button',{name:'检查更新',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1440,height:1040});
 await expect(page.locator('.sidebar')).toBeVisible();
 await expect(page.locator('.mobile-header')).toBeHidden();
 await expect(page.locator('.topbar').getByRole('button',{name:'检查更新',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('entering 我的阅读 provides working 返回首页 on mobile and desktop',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.goto('./');
 await page.getByRole('button',{name:'全部记录',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的阅读',exact:true})).toBeVisible();
 await page.locator('.history-heading').getByRole('button',{name:'返回首页',exact:true}).click();
 await expect(page.locator('.hero-actions').getByRole('button',{name:'准备离线模型',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'全部记录',exact:true}).click();
 await page.locator('.mobile-header').getByRole('button',{name:'返回首页',exact:true}).click();
 await expect(page.locator('.hero-actions').getByRole('button',{name:'准备离线模型',exact:true})).toBeVisible();
});

test('camera uses full-screen frame without misleading inner guide box and supports fallback import after models ready',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.goto('./');
 await page.locator('.hero-actions').getByRole('button',{name:'准备离线模型',exact:true}).click();
 await page.getByRole('button',{name:'下载离线资源',exact:true}).click();
 await expect(page.getByRole('button',{name:'检查并补全缓存',exact:true})).toBeVisible({timeout:60000});
 await page.getByRole('button',{name:'关闭模型管理',exact:true}).click();
 await expect(page.getByRole('button',{name:'从相册导入',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'拍照识别',exact:true}).click();
 await expect(page.locator('.camera-guide')).toHaveCount(0);
 await expect(page.locator('.camera-full-grid')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'相册 / 系统拍照',exact:true}).click();
 await (await chooser).setFiles(await fixture(page));
 await expect(page.getByTestId('reading-svg').or(page.locator('.processing'))).toBeVisible();
});

test('Source Han Serif loads locally and UI follows live system theme changes',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.emulateMedia({colorScheme:'light'});await page.goto('./');
 await page.evaluate(()=>document.fonts.load('600 24px "Source Han Serif"','繁简旁注'));
 expect(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Source Han Serif'&&f.status==='loaded'))).toBe(true);
 await expect(page.locator('html')).toHaveCSS('font-family',/Source Han Serif/);
 await expect(page.locator('html')).toHaveCSS('background-color','rgb(246, 247, 242)');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveCSS('background-color','rgb(18, 27, 22)');
 await expect(page.locator('html')).toHaveCSS('color-scheme','dark');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('auto-sharpen & correct OCR, in-place adaptive replacement, manual save only, re-recognize, export and offline cold reload',async({page,context},testInfo)=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const requests:{method:string;url:string}[]=[];context.on('request',r=>requests.push({method:r.method(),url:r.url()}));
 await page.goto('./');
 const image=await fixture(page);
 await page.getByTestId('file-upload').setInputFiles(image);
 await page.getByTestId('reading-svg').or(page.locator('.processing [role="alert"]')).waitFor({timeout:150000});
 await expect(page.locator('.processing [role="alert"]')).toHaveCount(0);
 await expect(page.getByTestId('reading-svg')).toBeVisible();

 // Only 3 header action buttons + 2 processing toggles + 重新识别; no legacy custom buttons
 await expect(page.getByRole('button',{name:'隐藏简体',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'保存阅读记录',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'导出图片',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'旁注样式',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'编辑识别原文',exact:true})).toHaveCount(0);

 // In-place replacement has large fontSize matching glyph scale and sampled adaptive bg/ink colors
 const first=page.getByTestId('annotation').first();
 await expect(first).toBeVisible();
 expect(Number(await first.locator('text').getAttribute('font-size'))).toBeGreaterThan(24);
 expect(await first.getAttribute('data-bg')).toMatch(/^rgb\(/);
 expect(await first.getAttribute('data-ink')).toMatch(/^rgb\(/);

 // Show/hide toggle works
 const count=await page.getByTestId('annotation').count();
 expect(count).toBeGreaterThan(3);
 await page.getByRole('button',{name:'隐藏简体',exact:true}).click();
 await expect(page.getByTestId('annotation')).toHaveCount(0);
 await page.getByRole('button',{name:'显示简体',exact:true}).click();
 await expect(page.getByTestId('annotation')).toHaveCount(count);

 // NOT saved by default when going back home
 await page.getByRole('button',{name:'返回首页',exact:true}).click();
 await expect(page.locator('.reading-card')).toHaveCount(0);

 // Re-import, manually save, verify persistence across reload
 await page.getByTestId('file-upload').setInputFiles(image);
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});
 await page.getByRole('button',{name:'保存阅读记录',exact:true}).click();
 await expect(page.getByRole('button',{name:'保存阅读记录',exact:true})).toContainText('已保存');
 await page.getByRole('button',{name:'返回首页',exact:true}).click();
 await expect(page.locator('.reading-card')).toHaveCount(1);
 await page.reload();
 await expect(page.locator('.reading-card')).toHaveCount(1);
 await page.locator('.reading-card .reading-thumbnail').first().click();
 await expect(page.getByTestId('reading-svg')).toBeVisible();

 // Unchecking 自动矫正 or 图片增强 enables 重新识别 and runs cleanly
 await expect(page.getByRole('button',{name:'重新识别',exact:true})).toBeDisabled();
 await page.getByLabel('图片增强',{exact:true}).uncheck();
 await expect(page.getByRole('button',{name:'重新识别',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'重新识别',exact:true}).click();
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});

 // Export PNG works
 await page.getByRole('button',{name:'导出图片',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'PNG · 清晰无损',exact:true}).click();
 const download=await downloadPromise;
 const out=testInfo.outputPath('replaced.png');await download.saveAs(out);
 const {readFile}=await import('node:fs/promises');const png=await readFile(out);
 expect(png.readUInt32BE(16)).toBeGreaterThan(100);expect(png.readUInt32BE(20)).toBeGreaterThan(100);

 // Offline cold reload & recognition
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;if(!r.active)throw Error('No active SW');});
 await context.setOffline(true);await page.reload();
 await expect(page.getByRole('button',{name:'拍照识别',exact:true})).toBeVisible();
 await page.getByTestId('file-upload').setInputFiles(image);
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});
 expect(requests.filter(r=>r.method!=='GET')).toEqual([]);
 expect(requests.filter(r=>!r.url.startsWith('edge://')&&!r.url.startsWith('chrome://')).every(r=>r.url.startsWith(new URL(testInfo.project.use.baseURL!).origin+'/')||r.url.startsWith('blob:'))).toBe(true);
 expect(errors).toEqual([]);
});
