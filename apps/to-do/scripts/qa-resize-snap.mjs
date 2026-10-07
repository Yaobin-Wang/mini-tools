import { chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TEMP = process.env.TMP = path.join(root, '.runtime/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.runtime/test-browsers');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  const load = async (zoom, offscreen = false) => {
    const w = {
      schemaVersion: 2,
      revision: 0,
      tasks: {},
      groups: [],
      links: [],
      dailyEntries: {},
      monthlyEntries: {},
      monthlyTemplate: [],
      viewport: { x: 30, y: 30, zoom },
      settings: {
        darkMode: false,
        sidebarWidth: 208,
        sidebarCollapsed: false,
        bodySize: 18,
        autoBackup: false,
        lastAutoBackupMonth: '',
      },
      legacyArchive: {},
      lastBackup: 0,
    };
    for (let i = 0; i < 2; i++) {
      w.tasks['t' + i] = {
        id: 't' + i,
        title: '任务' + i,
        details: '',
        urgency: 'medium',
        dueDate: '',
        createdAt: 1,
        completed: false,
      };
      w.groups.push({
        id: 'g' + i,
        name: '组' + i,
        autoName: false,
        finalized: false,
        taskIds: ['t' + i],
        position: { x: 100 + i * 650, y: i && offscreen ? 5000 : 100 + i * 300 },
        size: { width: i ? 450 : 296, height: i ? 260 : 150 },
        collapsed: false,
        hideCompleted: false,
      });
    }
    await page.getByRole('button', { name: '数据与显示', exact: true }).click();
    await page
      .getByLabel('导入备份文件')
      .setInputFiles({
        name: 'resize.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(w)),
      });
    await page.getByRole('button', { name: '确认替换', exact: true }).click();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.reload();
    await page.locator('[data-group-id=g0]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-group-id=g0] .group-count').click({ modifiers: ['Shift'] });
  };
  for (const zoom of [0.48, 0.72]) {
    await load(zoom);
    const group = page.locator('[data-group-id=g0]');
    const box = await group.boundingBox();
    const grip = await group.locator('.group-resize-handle.bottom.right').boundingBox();
    const x = grip.x + grip.width / 2,
      y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const targetX = x + (450 - 296) * zoom,
      targetY = y + (260 - 150) * zoom;
    await page.mouse.move(targetX - 4, targetY - 4, { steps: 12 });
    await expect.poll(async () => (await group.boundingBox()).width / zoom).toBeCloseTo(450, 0);
    await expect.poll(async () => (await group.boundingBox()).height / zoom).toBeCloseTo(260, 0);
    await expect(page.locator('.alignment-guides')).toContainText('等宽');
    await page.mouse.move(targetX + 9, targetY + 9, { steps: 3 });
    expect((await group.boundingBox()).width / zoom).toBeCloseTo(450, 0);
    await page.mouse.move(targetX + 18, targetY + 18, { steps: 3 });
    await expect.poll(async () => (await group.boundingBox()).width / zoom).toBeGreaterThan(470);
    await page.keyboard.down('Alt');
    await page.mouse.move(targetX - 4, targetY - 4, { steps: 4 });
    await expect
      .poll(async () => Math.abs((await group.boundingBox()).width / zoom - (450 - 4 / zoom)))
      .toBeLessThan(2);
    await page.keyboard.up('Alt');
    await page.mouse.move(targetX - 3, targetY - 3);
    await page.mouse.up();
    await expect.poll(async () => (await group.boundingBox()).width / zoom).toBeCloseTo(450, 0);
    expect((await group.boundingBox()).x).toBeCloseTo(box.x, 0);
    await expect(page.locator('.save-status')).toContainText('已保存');
    await page.reload();
    await group.waitFor();
    expect((await group.boundingBox()).width / zoom).toBeCloseTo(450, 0);
    expect((await group.boundingBox()).height / zoom).toBeCloseTo(260, 0);
    console.log('PASS 等宽等高、保持脱开、Alt释放与刷新 / ' + zoom);
    await load(zoom);
    const original = await group.boundingBox();
    const left = await group.locator('.group-resize-handle.top.left').boundingBox();
    await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      left.x + left.width / 2 - 154 * zoom + 4,
      left.y + left.height / 2 - 110 * zoom + 4,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect.poll(async () => (await group.boundingBox()).width / zoom).toBeCloseTo(450, 0);
    const result = await group.boundingBox();
    expect(result.x + result.width).toBeCloseTo(original.x + original.width, 0);
    expect(result.y + result.height).toBeCloseTo(original.y + original.height, 0);
    await page.getByLabel('撤销', { exact: true }).click();
    await expect.poll(async () => (await group.boundingBox()).width / zoom).toBeCloseTo(296, 0);
    console.log('PASS 左上角锚点与撤销 / ' + zoom);
    await load(zoom);
    const ref = await page.locator('[data-group-id=g1]').boundingBox();
    const edge = await group.locator('.group-resize-handle.bottom.right').boundingBox();
    const initial = await group.boundingBox();
    const ex = edge.x + edge.width / 2,
      ey = edge.y + edge.height / 2;
    await page.mouse.move(ex, ey);
    await page.mouse.down();
    await page.mouse.move(
      ex + ref.x - initial.x - initial.width - 3,
      ey + ref.y - initial.y - initial.height - 3,
      { steps: 12 },
    );
    await page.mouse.up();
    const aligned = await group.boundingBox();
    expect(aligned.x + aligned.width).toBeCloseTo(ref.x, 0);
    expect(aligned.y + aligned.height).toBeCloseTo(ref.y, 0);
    console.log('PASS 边缘对齐 / ' + zoom);
  }
  await load(0.48, true);
  const group = page.locator('[data-group-id=g0]');
  const handle = await group.locator('.group-resize-handle.bottom.right').boundingBox();
  const hx = handle.x + handle.width / 2, hy = handle.y + handle.height / 2;
  await page.mouse.move(hx, hy); await page.mouse.down();
  await page.mouse.move(hx + 154 * 0.48 - 4, hy + 110 * 0.48 - 4, { steps: 12 });
  expect((await group.boundingBox()).width / 0.48).toBeLessThan(447);
  await expect(page.locator('.alignment-guides line')).toHaveCount(0);
  await page.mouse.up();
  expect((await group.boundingBox()).width / 0.48).toBeLessThan(447);
  const grip = await group.locator('.group-drag').boundingBox();
  const initial = await group.boundingBox();
  const gx = grip.x + grip.width / 2, gy = grip.y + grip.height / 2;
  await page.mouse.move(gx, gy); await page.mouse.down();
  await page.mouse.move(gx + 650 * 0.48 - 4, gy, { steps: 15 });
  await expect(page.locator('.alignment-guides line')).toHaveCount(0);
  expect((await group.boundingBox()).x - initial.x).toBeGreaterThan(200);
  expect(Math.abs((await group.boundingBox()).x - initial.x - 650 * 0.48)).toBeGreaterThan(2);
  await page.mouse.up();
  console.log('PASS 屏幕外任务不参与缩放和移动吸附');
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
