import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createRestService, windowBridge } from './rest-service.mjs';
import { createRestHandler } from './rest-http.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TEMP = process.env.TMP = path.join(root, '.runtime/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.runtime/test-browsers');
const folder = fs.mkdtempSync(path.join(root, '.runtime/tmp/rest-qa-'));
let clock = Date.now(),
  native = { ok: true, count: 1, ready: true, verified: true },
  raised = 0;
const bridge = {
  async call(action) {
    if (action === 'raise') raised++;
    return native;
  },
  async close() {},
};
const rest = createRestService({
  root,
  bridge,
  now: () => clock,
  stateFile: path.join(folder, 'state.json'),
});
let browser, server;
try {
  for (const minutes of [90, 60, 30]) {
    await rest.action('start', minutes);
    assert.equal(rest.snapshot().endsAt, clock + minutes * 60000);
  }
  clock += 15000;
  await rest.action('pause');
  assert.equal(rest.snapshot().remainingMs, 30 * 60000 - 15000);
  clock += 50000;
  await rest.action('resume');
  assert.equal(rest.snapshot().endsAt, clock + 30 * 60000 - 15000);
  clock += 30 * 60000;
  native.ready = false;
  await rest.tick();
  assert.equal(rest.snapshot().attention, 'deferred');
  assert.equal(raised, 0);
  native.ready = true;
  await rest.tick();
  await rest.tick();
  assert.equal(raised, 1);
  assert.equal(rest.snapshot().attention, 'shown');
  await rest.action('snooze');
  assert.equal(rest.snapshot().endsAt, clock + 600000);
  native.count = 0;
  await rest.tick();
  clock += 4000;
  await rest.tick();
  assert.equal(rest.snapshot().status, 'idle');
  native.count = 1;
  await rest.action('start', 30);
  native = { ok: false, error: 'fixture failure' };
  clock += 31 * 60000;
  await rest.tick();
  assert.equal(rest.snapshot().attention, 'failed');
  native = { ok: true, count: 1, ready: true, verified: true };
  await rest.action('ack');
  console.log('PASS 三档时长、暂停继续、休眠延期、一次提醒、延后、窗口关闭、辅助失败');
  let handler;
  server = http.createServer(async (req, res) => {
    if (await handler(req, res)) return;
    const filename = path.join(
      root,
      'dist',
      req.url === '/' ? 'index.html' : req.url.split('?')[0],
    );
    try {
      const data = fs.readFileSync(filename);
      res.setHeader(
        'Content-Type',
        filename.endsWith('.js')
          ? 'application/javascript'
          : filename.endsWith('.css')
            ? 'text/css'
            : filename.endsWith('.html')
              ? 'text/html'
              : 'application/octet-stream',
      );
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createRestHandler(rest, origin);
  assert.equal(
    (
      await fetch(origin + '/api/rest/session', {
        headers: { Origin: 'https://other.invalid', 'X-ToDo-Client': 'rest-v1' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(origin + '/api/rest/action', { method: 'POST', body: '{}' })).status,
    401,
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: '休息提醒', exact: true }).click();
  const preset = page.getByRole('button', { name: '60分钟', exact: true });
  await expect(preset).toBeEnabled();
  await preset.click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '待办事项', exact: true }).click();
  await page.reload();
  await expect(page.locator('.rest-nav-time')).toContainText('60:00');
  await page.getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByLabel('这次，想完成什么？').fill('休息提醒独立测试');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.locator('.task-title').click();
  await page.getByLabel('任务标题', { exact: true }).fill('保留编辑中的标题');
  clock += 61 * 60000;
  await rest.tick();
  await expect(page.getByRole('dialog', { name: '该休息一下了' })).toBeVisible();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('保留编辑中的标题');
  await page.getByRole('button', { name: '知道了', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '该休息一下了' })).toHaveCount(0);
  await expect(page.locator('.detail-panel')).toBeVisible();
  await page.getByRole('button', { name: '休息提醒', exact: true }).click();
  await page.screenshot({ path: path.join(root, '.runtime/test-results/rest-light.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.setViewportSize({ width: 1100, height: 768 });
  await page.screenshot({ path: path.join(root, '.runtime/test-results/rest-dark.png'), animations: 'disabled' });
  const second = await context.newPage();
  await second.goto(origin);
  await second.getByRole('button', { name: '休息提醒', exact: true }).click();
  await expect(second.getByRole('button', { name: '90分钟', exact: true })).toBeDisabled();
  console.log('PASS API 来源校验、页面操作、刷新、多窗口只读、到期弹层、编辑保留、浅深色截图');
} finally {
  await browser?.close();
  await rest.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
// A real isolated browser window: never use the user's daily profile.
const nativeBridge = windowBridge(root, path.join(folder, 'browser-profile'));
let nativeContext;
try {
  nativeContext = await chromium.launchPersistentContext(path.join(folder, 'browser-profile'), {
    headless: false,
    args: ['--app=about:blank'],
  });
  const page = nativeContext.pages()[0] || (await nativeContext.newPage());
  const cdp = await nativeContext.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const before = await nativeBridge.call('probe');
  assert.equal(before.ok, true, JSON.stringify(before));
  assert.ok(before.count >= 1, JSON.stringify(before));
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  const result = await nativeBridge.call('raise');
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.notEqual(
    (await cdp.send('Browser.getWindowBounds', { windowId })).bounds.windowState,
    'minimized',
  );
  assert.equal((await nativeBridge.call('release')).ok, true);
  assert.equal((await nativeBridge.call('probe')).topmostCount, before.topmostCount);
  console.log('PASS 真实 Windows 专用窗口识别、最小化恢复、置顶样式验证、解除置顶');
} finally {
  await nativeBridge.close();
  await nativeContext?.close();
}
