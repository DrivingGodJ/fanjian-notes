import {test,expect} from '@playwright/test';

test('auto-correction straightens tilted vertical page and re-recognize toggles options cleanly',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.goto('./');
 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=900;c.height=1200;const g=c.getContext('2d')!;
  g.fillStyle='#fffdf2';g.fillRect(0,0,c.width,c.height);
  g.translate(450,600);g.rotate(5*Math.PI/180);g.translate(-450,-600);
  g.fillStyle='#1e2920';g.font='44px "SimSun","Noto Serif CJK SC",serif';
  for(let col=0;col<7;col++)Array.from('這是一個美麗的世界我們一起閱讀').forEach((char,row)=>g.fillText(char,130+col*100,120+row*62));
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.getByTestId('file-upload').setInputFiles({name:'竖排倾斜测试.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});
 await expect(page.getByTestId('annotation').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

 await expect(page.getByLabel('自动矫正',{exact:true})).toBeChecked();
 await expect(page.getByLabel('图片增强',{exact:true})).toBeChecked();
 await page.getByLabel('自动矫正',{exact:true}).uncheck();
 await page.getByLabel('图片增强',{exact:true}).uncheck();
 await page.getByRole('button',{name:'重新识别',exact:true}).click();
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});
});

test('sideways 90-degree landscape photo is automatically rotated upright by text orientation',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('fanjian-onboarding-dismissed','1');});
 await page.goto('./');
 const data=await page.evaluate(()=>{
  // Build an upright 900x1200 vertical book page, then rotate it 90° CW into a sideways 1200x900 landscape image
  const src=document.createElement('canvas');src.width=900;src.height=1200;const sg=src.getContext('2d')!;
  sg.fillStyle='#fffdf2';sg.fillRect(0,0,900,1200);
  sg.fillStyle='#1e2920';sg.font='48px "SimSun","Noto Serif CJK SC",serif';
  for(let col=0;col<6;col++)Array.from('這是一個美麗的世界我們一起閱讀').forEach((char,row)=>sg.fillText(char,140+col*115,120+row*66));

  const sideways=document.createElement('canvas');sideways.width=1200;sideways.height=900;
  const g=sideways.getContext('2d')!;g.translate(600,450);g.rotate(Math.PI/2);g.drawImage(src,-450,-600);
  return sideways.toDataURL('image/png').split(',')[1];
 });
 await page.getByTestId('file-upload').setInputFiles({name:'横屏误拍测试.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 await expect(page.getByTestId('reading-svg')).toBeVisible({timeout:150000});
 const img=page.getByTestId('reading-svg').locator('image');
 const w=Number(await img.getAttribute('width')),h=Number(await img.getAttribute('height'));
 expect(h).toBeGreaterThan(w);
 expect(await page.getByTestId('annotation').count()).toBeGreaterThan(5);
});
