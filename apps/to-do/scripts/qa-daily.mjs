import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { addRestElapsed, createRestService } from './rest-service.mjs';
import { createRestHandler } from './rest-http.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TEMP = process.env.TMP = path.join(root, '.runtime/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.runtime/test-browsers');
const folder = fs.mkdtempSync(path.join(root, '.runtime/tmp/daily-qa-'));
const key = (d) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
const days = {};
addRestElapsed(
  days,
  new Date(2024, 1, 28, 23, 59).getTime(),
  new Date(2024, 1, 29, 0, 1).getTime(),
);
assert.deepEqual(days, { '2024-02-28': 60000, '2024-02-29': 60000 });
let clock = new Date().setHours(8, 0, 0, 0);
const today = key(new Date(clock));
const yesterday = key(new Date(new Date(clock).setDate(new Date(clock).getDate() - 1)));
const bridge = {
  async call() {
    return { ok: true, count: 1, ready: true, verified: true };
  },
  async close() {},
};
const stateFile = path.join(folder, 'rest-state.json');
let service = createRestService({ root, bridge, stateFile, now: () => clock });
await service.action('start', 90);
clock += 60000;
await service.action('pause');
assert.equal(service.snapshot().tracking.days[today], 60000);
clock += 60000;
assert.equal(service.snapshot().tracking.days[today], 60000);
await service.action('resume');
clock += 2 * 60000;
await service.action('cancel');
assert.equal(service.snapshot().tracking.days[today], 180000);
await service.action('start', 30);
clock += 35 * 60000;
await service.tick();
assert.equal(service.snapshot().tracking.days[today], 33 * 60000);
clock += 5 * 60000;
assert.equal(service.snapshot().tracking.days[today], 33 * 60000);
await service.action('snooze');
clock += 60000;
await service.action('cancel');
assert.equal(service.snapshot().tracking.days[today], 34 * 60000);
const sourceId = service.snapshot().tracking.id;
await service.close();
service = createRestService({ root, bridge, stateFile, now: () => clock });
assert.equal(service.snapshot().tracking.id, sourceId);
assert.equal(service.snapshot().tracking.days[today], 34 * 60000);
assert.equal(service.snapshot().status, 'idle');
console.log('PASS 提醒实际累计、暂停、提前结束、到期封顶、延后、重启保留、跨午夜闰日拆分');
let handler, browser;
const server = http.createServer(async (req, res) => {
  if (await handler(req, res)) return;
  const file = path.join(root, 'dist', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    const data = fs.readFileSync(file);
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'application/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.html')
            ? 'text/html'
            : 'application/octet-stream',
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createRestHandler(service, origin);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(origin);
  await page.getByRole('button', { name: '每日复盘', exact: true }).click();
  await expect(page.getByRole('button', { name: '插入复盘模板' })).toHaveCount(0);
  await expect(page.locator('.daily-summary')).toContainText('提醒计时 34 分钟');
  await expect(page.locator('.daily-summary > span').first()).toHaveCSS('font-size', '14px');
  await page.getByRole('button', { name: '源码编辑', exact: true }).click();
  const content = page.getByLabel('思考与总结 Markdown');
  await expect(content).toHaveValue('');
  await page.getByLabel('添加每日目标').fill('第一条目标');
  await page.getByLabel('添加每日目标').press('Enter');
  await content.fill('今天的一点记录');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('每日目标标题')).toHaveCount(0);
  await expect(content).toHaveValue('今天的一点记录');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByLabel('每日目标标题')).toHaveValue('第一条目标');
  await page.getByRole('checkbox', { name: '完成目标：第一条目标', exact: true }).check();
  await expect(page.locator('.daily-summary')).toContainText('目标 1/1');
  await page.getByLabel('复盘日期').fill(yesterday);
  await expect(page.getByLabel('每日目标标题')).toHaveCount(0);
  await page.getByRole('button', { name: '源码编辑', exact: true }).click();
  await content.fill('');
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await expect(page.getByLabel('每日目标标题')).toHaveValue('第一条目标');
  await expect(page.locator('.daily-paper .prose')).toContainText('今天的一点记录');
  await page.getByLabel('复盘日期').fill(yesterday);
  await page.getByRole('button', { name: '源码编辑', exact: true }).click();
  await expect(content).toHaveValue('');
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '每日复盘', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '完成目标：第一条目标', exact: true }),
  ).toBeChecked();
  await expect(page.locator('.continuity-panel header')).toContainText('记录了 1 天');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '数据与显示', exact: true }).click();
  await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
  const exported = await download;
  const raw = JSON.parse(fs.readFileSync(await exported.path(), 'utf8'));
  assert.equal(raw.dailyEntries[today].goals[0].completed, true);
  assert.equal(raw.dailyEntries[yesterday].contentInitialized, true);
  assert.equal(raw.restTracking[sourceId].days[today], 34 * 60000);
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.screenshot({
    path: path.join(root, '.runtime/test-results/daily-goals-light.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({
    path: path.join(root, '.runtime/test-results/daily-goals-dark.png'),
    animations: 'disabled',
  });
  console.log(
    'PASS 每日目标、默认空白、清空记忆、正文保留、撤销重做、日期隔离、连续性、刷新与导出、浅深色布局',
  );
} finally {
  await browser?.close();
  await service.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
