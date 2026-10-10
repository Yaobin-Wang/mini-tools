import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.env.TEMP=process.env.TMP=path.join(root,'.runtime/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'.runtime/test-browsers');
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){res.writeHead(404).end();return;}
  const file=path.join(root,'dist',req.url==='/'?'index.html':req.url.split('?')[0]);
  try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
let browser;
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.getByRole('heading',{name:'待办事项',exact:true})).toBeVisible();
  const top=async()=>({toolbar:(await page.locator('.board-toolbar').boundingBox()).y,canvas:(await page.locator('.react-flow').boundingBox()).y});
  const before=await top();
  await page.getByRole('button',{name:'写下一个想持续推进的目标',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'长期方向',exact:true});
  for(let i=1;i<=4;i++){
    if(i>1)await modal.getByRole('button',{name:'新增目标',exact:true}).click();
    await page.getByLabel('长期方向标题',{exact:true}).fill(`方向 ${i}`);
    await page.getByLabel('长期方向说明',{exact:true}).fill('人工测试说明');
    await page.getByLabel('长期方向目标日期',{exact:true}).fill('2027-01-01');
    await page.getByRole('button',{name:'保存目标',exact:true}).click();
  }
  await page.getByRole('button',{name:'上移目标：方向 2',exact:true}).click();
  await expect(modal.locator('.direction-title').first()).toHaveText('方向 2');
  await page.getByRole('button',{name:'完成目标：方向 2',exact:true}).click();
  await modal.getByRole('button',{name:'已完成 1',exact:true}).click();
  await page.getByRole('button',{name:'恢复目标：方向 2',exact:true}).click();
  await modal.getByRole('button',{name:'进行中 4',exact:true}).click();
  await page.getByRole('button',{name:'删除目标：方向 1',exact:true}).click();
  await page.getByRole('button',{name:'撤销长期方向操作',exact:true}).click();
  await expect(modal.locator('.direction-title')).toHaveCount(4);
  await modal.getByRole('button',{name:'关闭窗口',exact:true}).click();
  assert.deepEqual(await top(),before);
  await expect(page.locator('.directions-items > button')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'管理长期方向',exact:true})).toContainText('其余 1 项');
  await page.reload(); await expect(page.locator('.directions-item-title').first()).toHaveText('方向 2');
  await expect(page.locator('.directions-item-date').first()).toHaveText('2027-01-01');
  await page.getByRole('button',{name:'数据与显示',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份',exact:true}).click();
  const raw=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));assert.equal(raw.longTermGoals.length,4);assert.equal(raw.longTermGoals[0].targetDate,'2027-01-01');
  await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click();
  await page.screenshot({path:path.join(root,'.runtime/test-results/directions-wide.png'),animations:'disabled'});
  await page.getByRole('button',{name:'新建待办',exact:true}).click();await page.getByLabel('这次，想完成什么？').fill('测试任务');await page.getByRole('button',{name:'确定',exact:true}).click();await page.locator('.task-title').click();
  for(const width of [1920,1366,1000]){
    await page.setViewportSize({width,height:900});
    await expect(page.locator('.directions-anchor')).toBeVisible();
    await expect.poll(async()=>{
      const bounds=await page.locator('.directions-anchor').boundingBox();const tabs=await page.locator('.status-tabs').boundingBox();
      return bounds.x+bounds.width <= tabs.x+1 || bounds.y+bounds.height <= tabs.y+1 || bounds.y >= tabs.y+tabs.height-1;
    },{message:`${width}px 下摘要不遮挡筛选`}).toBe(true);
    const withSummary=await top();
    await page.locator('.directions-anchor').evaluate(el=>el.style.display='none');
    assert.deepEqual(await top(),withSummary);
    await page.locator('.directions-anchor').evaluate(el=>el.style.display='');
  }
  await page.getByRole('button',{name:'切换主题',exact:true}).click();
  await page.screenshot({path:path.join(root,'.runtime/test-results/directions-narrow-dark.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);
  console.log('PASS 目标新增/编辑字段/排序/完成恢复/删除撤销/刷新导出；三种窗口宽度及详情打开时不挤压画布、不遮挡筛选');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
