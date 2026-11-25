import {test,expect} from '@playwright/test';
test('automatic deskew previews its correction and allows a manual override',async({page},testInfo)=>{
 await page.goto('./');
 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=900;c.height=1200;const g=c.getContext('2d')!;g.fillStyle='#fffdf2';g.fillRect(0,0,c.width,c.height);g.translate(450,600);g.rotate(5*Math.PI/180);g.translate(-450,-600);g.fillStyle='#1e2920';g.font='44px "SimSun","Noto Serif CJK SC",serif';
  for(let col=0;col<7;col++)Array.from('這是一個美麗的世界我們一起閱讀').forEach((char,row)=>g.fillText(char,130+col*100,120+row*62));
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.getByTestId('file-upload').setInputFiles({name:'竖排倾斜测试.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 const angle=page.getByLabel('拉直角度',{exact:true});await expect(page.locator('.straighten-controls')).toContainText('竖排文字',{timeout:30000});await expect(page.getByRole('button',{name:'开始本地识别',exact:false})).toBeEnabled();
 const correction=Number(await angle.inputValue());expect(correction).toBeLessThan(-3.5);expect(correction).toBeGreaterThan(-6.5);
 await expect(page.locator('.straighten-controls')).toContainText('竖排文字');
 await page.screenshot({path:testInfo.outputPath('auto-deskew-mobile.png'),fullPage:true});
 await angle.fill('-2.5');await expect(page.getByLabel('自动校正倾角',{exact:true})).not.toBeChecked();await expect(page.locator('.straighten-controls output')).toHaveText('-2.5°');
 await page.getByRole('button',{name:'重置',exact:true}).click();await expect(angle).toHaveValue('0');
});

test('4-corner perspective, shadow enhance, compare, and reader copy/swatches work smoothly on mobile',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');
 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=720;c.height=960;const g=c.getContext('2d')!;
  g.fillStyle='#1f241f';g.fillRect(0,0,720,960);
  g.fillStyle='#f5efe0';g.beginPath();g.moveTo(90,80);g.lineTo(630,110);g.lineTo(670,870);g.lineTo(50,840);g.closePath();g.fill();
  g.fillStyle='#242820';g.font='38px "SimSun","Noto Serif CJK SC",serif';g.fillText('這是一個美麗的世界',130,260);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.getByTestId('file-upload').setInputFiles({name:'perspective-test.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 await expect(page.getByRole('button',{name:'开始本地识别',exact:false})).toBeEnabled({timeout:30000});
 const beforeHref=await page.locator('.preprocess-image image').getAttribute('href');

 await page.getByRole('button',{name:'四角透视',exact:true}).click();
 await expect(page.getByTestId('perspective-handle-0')).toBeVisible();
 await expect(page.getByTestId('perspective-handle-3')).toBeVisible();
 await page.getByRole('button',{name:'应用透视拉正',exact:true}).click();
 await expect(page.getByRole('button',{name:'撤销照片矫正',exact:true})).toBeVisible();
 expect(await page.locator('.preprocess-image image').getAttribute('href')).not.toBe(beforeHref);
 await expect(page.getByRole('button',{name:'按住对比原图',exact:true})).toBeVisible();

 await page.getByRole('button',{name:'去阴影增强',exact:true}).click();
 await expect(page.getByRole('button',{name:'撤销照片矫正',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'撤销照片矫正',exact:true}).click();
 await page.getByRole('button',{name:'撤销照片矫正',exact:true}).click();
 await expect(page.getByRole('button',{name:'撤销照片矫正',exact:true})).toHaveCount(0);

 await page.getByRole('button',{name:'返回首页',exact:true}).click();
 await page.getByRole('button',{name:'竖排示例',exact:true}).click();
 await expect(page.getByTestId('reading-svg')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'旁注样式',exact:true}).click();
 await page.getByRole('button',{name:'配色 松烟',exact:true}).click();
 await expect(page.getByLabel('旁注颜色',{exact:true})).toHaveValue('#285745');
 await page.getByRole('button',{name:'关闭面板',exact:true}).click();
 await page.getByRole('button',{name:'编辑识别原文',exact:true}).click();
 await expect(page.getByRole('button',{name:'复制简体全文',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
