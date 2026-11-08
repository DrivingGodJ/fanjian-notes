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
