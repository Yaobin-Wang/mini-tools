import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime');
process.env.TEMP = path.join(runtime, 'tmp');
process.env.TMP = process.env.TEMP;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(runtime, 'test-browsers');
const out = path.join(runtime, 'test-results');
await fs.mkdir(out, { recursive: true });
const url = 'http://127.0.0.1:4173';
let service;
try {
  const health = await (await fetch(url + '/healthz')).json();
  if (health.app !== 'todo-desktop-v2' || path.resolve(health.root) !== root)
    throw Error('Port occupied');
} catch (e) {
  if (e.message === 'Port occupied') throw e;
  service = spawn(process.execPath, [path.join(root, 'scripts/server.mjs')], {
    cwd: root,
    windowsHide: true,
    env: process.env,
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 1000));
}
const profile = path.join(runtime, 'test-profile', 'qa-' + Date.now());
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1440, height: 960 },
  acceptDownloads: true,
  downloadsPath: path.join(runtime, 'test-downloads'),
  args: ['--disk-cache-dir=' + path.join(runtime, 'test-cache'), '--disable-crash-reporter'],
});
const page = context.pages()[0];
const errors = [],
  external = [];
page.on('pageerror', (e) => errors.push(e.message));
await context.route('**/*', (r) => {
  if (new URL(r.request().url()).hostname !== '127.0.0.1') {
    external.push(r.request().url());
    return r.abort();
  }
  return r.continue();
});
const results = [];
const step = async (name, fn) => {
  const start = performance.now();
  await fn();
  results.push({ name, passed: true, ms: Math.round(performance.now() - start) });
  console.log('PASS ' + name);
};
const read = () =>
  page.evaluate(async () => {
    const db = await new Promise((ok, no) => {
      const req = indexedDB.open('todo-desktop-v2', 1);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => no(req.error);
    });
    return new Promise((ok, no) => {
      const tx = db.transaction('state');
      const req = tx.objectStore('state').get('workspace');
      req.onsuccess = () => {
        db.close();
        ok(req.result);
      };
      req.onerror = () => no(req.error);
    });
  });
const save = async () => {
  await expect(page.locator('.save-status')).toContainText('已保存');
};
try {
  await step('离线资源与空白启动', async () => {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: '待办事项' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(external).toEqual([]);
    expect(await page.evaluate(() => document.fonts.check('17px WenKai'))).toBe(true);
    await expect(page.getByLabel('恢复100%缩放', { exact: true })).toHaveText('100%');
    await page.screenshot({ path: path.join(out, '01-empty.png') });
  });
  await step('创建与同组追加', async () => {
    await page.getByRole('button', { name: '新建待办', exact: true }).click();
    await page.getByLabel('这次，想完成什么？').fill('整理研究问题');
    await page.getByRole('button', { name: '确定', exact: true }).click();
    const g = page.locator('.task-group').first();
    await expect(g).toBeVisible();
    await g.getByRole('button', { name: '添加到组：整理研究问题', exact: true }).click();
    await g.getByLabel('添加同组任务', { exact: true }).fill('阅读相关文献');
    await g.getByLabel('添加同组任务', { exact: true }).press('Enter');
    await expect(g.locator('.task-card')).toHaveCount(2);
    await save();
    const d = await read();
    expect(d.groups.length).toBe(1);
    expect(Object.keys(d.tasks).length).toBe(2);
  });
  await step('新100%等于上一版60%、上下限、适应视图与刷新保存', async () => {
    const ratio = page.getByLabel('恢复100%缩放', { exact: true });
    const group = page.locator('.task-group').first();
    expect((await group.boundingBox()).width).toBeCloseTo(296 * 0.48, 0);
    for (let i = 0; i < 8; i++)
      await page.locator('.react-flow__controls-zoomin').click({ force: true });
    await expect(ratio).toHaveText('150%');
    await save();
    await expect.poll(async () => (await read()).viewport.zoom).toBeCloseTo(0.72);
    for (let i = 0; i < 10; i++)
      await page.locator('.react-flow__controls-zoomout').click({ force: true });
    await expect(ratio).toHaveText('50%');
    await save();
    await expect.poll(async () => (await read()).viewport.zoom).toBeCloseTo(0.24);
    await ratio.click();
    await expect(ratio).toHaveText('100%');
    await save();
    await expect.poll(async () => (await read()).viewport.zoom).toBeCloseTo(0.48);
    await page.reload();
    await expect(ratio).toHaveText('100%');
    expect((await group.boundingBox()).width).toBeCloseTo(296 * 0.48, 0);
    await page.locator('.react-flow__controls-fitview').click();
    await save();
    await expect.poll(async () => (await read()).viewport.zoom).toBeLessThanOrEqual(0.48);
    await ratio.click();
    await save();
  });
  await step('初始同名、任务与组独立改名及刷新保持', async () => {
    const created = await read();
    const first = created.groups[0].taskIds[0];
    expect(created.groups[0].name).toBe(created.tasks[first].title);
    await page.locator('.task-title').filter({ hasText: '整理研究问题' }).click();
    await page.getByLabel('任务标题', { exact: true }).fill('文章改写');
    await page.getByLabel('关闭详情', { exact: true }).click();
    await save();
    expect((await read()).groups[0].name).toBe('整理研究问题');
    await page.reload();
    await page.getByLabel('编辑组标题：整理研究问题', { exact: true }).click();
    await page.getByLabel('编辑组标题', { exact: true }).fill('Agent_Aes');
    await page.getByLabel('编辑组标题', { exact: true }).press('Enter');
    await save();
    expect((await read()).tasks[first].title).toBe('文章改写');
    expect((await read()).groups[0].name).toBe('Agent_Aes');
    await page.getByLabel('编辑组标题：Agent_Aes', { exact: true }).click();
    await page.getByLabel('编辑组标题', { exact: true }).fill('整理研究问题');
    await page.getByLabel('编辑组标题', { exact: true }).press('Enter');
    await page.locator('.task-title').filter({ hasText: '文章改写' }).click();
    await page.getByLabel('任务标题', { exact: true }).fill('整理研究问题');
    await page.getByLabel('关闭详情', { exact: true }).click();
    await save();
  });
  await step('详情编辑与 Markdown 清理', async () => {
    await page.locator('.task-title').filter({ hasText: '整理研究问题' }).click();
    await page.getByLabel('截止日期', { exact: true }).fill('2026-10-01');
    await page.getByLabel('紧急程度').selectOption('high');
    await page.getByRole('button', { name: '源码编辑', exact: true }).click();
    await page
      .getByLabel('详细备注 Markdown')
      .fill(
        '## 思考方向\n\n- 梳理研究边界\n- 明确验证标准\n\n| 对象 | 目标 |\n| --- | --- |\n| 实验 | 可复现 |\n\n\`\`\`python\nprint(\"hello\")\n\`\`\`\n\n<script>window.__unsafe=true</script>',
      );
    await page.getByRole('button', { name: '阅读预览', exact: true }).click();
    await expect(page.locator('.detail-panel .prose h2')).toHaveText('思考方向');
    expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
    await page.getByLabel('关闭详情', { exact: true }).click();
    await save();
  });
  await step('分组连线、归档与恢复', async () => {
    await page.getByRole('button', { name: '新建待办', exact: true }).click();
    await page.getByLabel('这次，想完成什么？').fill('设计实验');
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '整理布局', exact: true }).click();
    await page.getByRole('button', { name: '设置组：整理研究问题', exact: true }).click();
    const options = await page.getByLabel('连接目标组').locator('option').allTextContents();
    expect(options).toContain('设计实验');
    await page.getByLabel('连接目标组').selectOption({ label: '设计实验' });
    await page.getByLabel('关系说明（可选）').fill('为下一步做准备');
    await page.getByRole('button', { name: '添加关系', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await save();
    expect((await read()).links.length).toBe(1);
    await expect(page.locator('.edge-label')).toHaveText('为下一步做准备');
    await page.getByLabel('完成任务：整理研究问题', { exact: true }).click();
    await expect(page.locator('.task-group')).toHaveCount(2);
    await page.getByLabel('完成任务：阅读相关文献', { exact: true }).click();
    await expect(page.locator('.task-group')).toHaveCount(2);
    await page.getByLabel('完成本组：整理研究问题', { exact: true }).click();
    await expect(page.locator('.task-group')).toHaveCount(1);
    await page.getByRole('button', { name: /^已完成/ }).click();
    await page.locator('.archive-expand').click();
    await page.getByLabel('恢复任务：阅读相关文献', { exact: true }).click();
    await page.getByRole('button', { name: /^未完成/ }).click();
    await expect(page.locator('.task-group')).toHaveCount(2);
    await save();
  });
  await step('刷新保存与只读标签页', async () => {
    const before = await read();
    await page.reload();
    await expect(page.locator('.task-group')).toHaveCount(2);
    await save();
    expect((await read()).tasks).toEqual(before.tasks);
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.locator('.readonly-banner')).toBeVisible();
    await expect(other.getByRole('button', { name: '新建待办', exact: true })).toBeDisabled();
    await other.close();
  });
  await step('每日文字打卡、清空与历史日期', async () => {
    await page.getByRole('button', { name: '每日复盘', exact: true }).click();
    await page.getByLabel('复盘日期').fill('2024-02-29');
    await page.getByRole('button', { name: '源码编辑', exact: true }).click();
    await page.getByLabel('思考与总结 Markdown').fill('今天读了一篇论文。');
    await page.getByRole('button', { name: '阅读预览', exact: true }).click();
    await save();
    await expect(page.getByLabel('2024-02-29，9 字', { exact: true })).toHaveClass(/level-1/);
    await page.getByRole('button', { name: '源码编辑', exact: true }).click();
    await page.getByLabel('思考与总结 Markdown').fill('');
    await page.getByRole('button', { name: '阅读预览', exact: true }).click();
    await expect(page.getByLabel('2024-02-29，0 字', { exact: true })).toHaveClass(/level-0/);
    await page.getByRole('button', { name: '插入复盘模板', exact: true }).click();
    await expect(page.getByLabel('2024-02-29，0 字', { exact: true })).toHaveClass(/level-0/);
  });
  await step('历史月份与月度问题', async () => {
    await page.getByRole('button', { name: '每月总结', exact: true }).click();
    await page.getByLabel('总结月份').fill('2020-01');
    await page.getByLabel('本月最重要的成就', { exact: true }).fill('完成第一版计划');
    await page.getByRole('button', { name: '源码编辑', exact: true }).click();
    await page.getByLabel('深度复盘 Markdown').fill('## 一月\n\n保持节奏。');
    await page.getByRole('button', { name: '阅读预览', exact: true }).click();
    await save();
    expect((await read()).monthlyEntries['2020-01'].checklist[0].answer).toBe('完成第一版计划');
  });
  await step('错误导入不破坏数据及导出', async () => {
    await page.getByRole('button', { name: '数据与显示', exact: true }).click();
    await page.getByLabel('导入备份文件').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"todos":[]}'),
    });
    await expect(page.locator('.error-box')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    const file = await download;
    await file.saveAs(path.join(out, 'qa-export.json'));
    expect(
      JSON.parse(await fs.readFile(path.join(out, 'qa-export.json'), 'utf8')).schemaVersion,
    ).toBe(2);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  });
  await step('无运行时页面异常', async () => expect(errors).toEqual([]));
  await page.screenshot({ path: path.join(out, '02-functional.png') });
  await fs.writeFile(
    path.join(out, 'qa-result.json'),
    JSON.stringify({ results, errors, external, profile }, null, 2),
  );
} catch (e) {
  console.error(e);
  await page.screenshot({ path: path.join(out, 'failure.png') });
  await fs.writeFile(
    path.join(out, 'qa-result.json'),
    JSON.stringify({ results, errors, external, failure: String(e) }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await context.close();
  if (service) service.kill();
}
