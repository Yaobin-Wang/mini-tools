import { chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TEMP = process.env.TMP = path.join(root, '.runtime/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.runtime/test-browsers');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByLabel('恢复100%缩放', { exact: true })).toHaveText('100%');
  await page.getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByLabel('这次，想完成什么？').fill('区域内任务');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const group = page.locator('.task-group');
  let b = await group.boundingBox();
  expect(b.width).toBeCloseTo(296 * 0.48, 0);
  await page.getByRole('button', { name: '框选区域', exact: true }).click();
  await page.mouse.move(b.x - 30, b.y - 50);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 160, b.y + b.height + 120, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('区域名称', { exact: true }).fill('学习区');
  await page.getByLabel('区域颜色 3', { exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const region = page.locator('.canvas-region');
  await expect(region).toBeVisible();
  const originalRegion = await region.boundingBox();
  const contained = async () => {
    const g = await group.boundingBox(),
      r = await region.boundingBox();
    return (
      g.x >= r.x - 1 &&
      g.y >= r.y - 1 &&
      g.x + g.width <= r.x + r.width + 1 &&
      g.y + g.height <= r.y + r.height + 1
    );
  };
  for (const [dx, dy] of [
    [-500, 0],
    [500, 0],
    [0, -350],
    [0, 500],
  ]) {
    const grip = await group.locator('.group-drag').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + dx, grip.y + grip.height / 2 + dy, {
      steps: 10,
    });
    await page.mouse.up();
    await expect.poll(contained).toBe(true);
    const rb = await region.boundingBox();
    expect(rb.width).toBeCloseTo(originalRegion.width, 0);
    expect(rb.height).toBeCloseTo(originalRegion.height, 0);
  }
  await page.getByLabel('添加到组：区域内任务', { exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await group.getByLabel('添加同组任务', { exact: true }).fill('新增事件 ' + i);
    await group.getByLabel('添加同组任务', { exact: true }).press('Enter');
  }
  await expect.poll(contained).toBe(true);
  await page.getByRole('button', { name: '整理布局', exact: true }).click();
  await expect.poll(contained).toBe(true);
  await expect
    .poll(async () => (await region.boundingBox()).width - (await group.boundingBox()).width)
    .toBeLessThan(25);
  await expect(page.locator('.save-status')).toContainText('已保存');
  await page.reload();
  await expect(page.getByLabel('设置区域：学习区', { exact: true })).toBeVisible();
  await expect.poll(contained).toBe(true);
  await page.screenshot({ path: path.join(root, '.runtime/test-results/regions-light.png') });
  await page.getByLabel('切换主题', { exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(root, '.runtime/test-results/regions-dark.png') });
  await page.getByLabel('设置区域：学习区', { exact: true }).click();
  await page.getByRole('button', { name: '删除区域（保留任务）', exact: true }).click();
  await expect(region).toHaveCount(0);
  await expect(group).toHaveCount(1);
  await page.getByLabel('撤销', { exact: true }).click();
  await expect(region).toHaveCount(1);
  expect(errors).toEqual([]);
  console.log('PASS 新默认缩放、绘制选色、四向边界、内容扩展、整理布局、刷新、主题与删除撤销');
} finally {
  await browser.close();
}
