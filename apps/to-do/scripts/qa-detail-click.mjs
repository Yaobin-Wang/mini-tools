import { chromium, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TEMP = process.env.TMP = path.join(root, '.runtime/tmp');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.runtime/test-browsers');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('button', { name: '新建待办', exact: true }).click();
  await page.getByLabel('这次，想完成什么？').fill('拖出面板选字检查');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.locator('.task-title').click();
  const detail = page.locator('.detail-panel');
  const title = page.getByLabel('任务标题', { exact: true });
  await title.fill('修改后的标题');
  const box = await title.boundingBox();
  const panel = await detail.boundingBox();
  await page.mouse.move(box.x + 130, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(panel.x - 80, box.y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(detail).toBeVisible();
  await expect(title).toHaveValue('修改后的标题');
  // Moving on the background is not a click either.
  await page.mouse.move(450, 600);
  await page.mouse.down();
  await page.mouse.move(550, 650, { steps: 8 });
  await page.mouse.up();
  await expect(detail).toBeVisible();
  await page.getByRole('heading', { name: '待办事项', exact: true }).click();
  await expect(detail).toHaveCount(0);
  await page.locator('.task-title').click();
  await expect(title).toHaveValue('修改后的标题');
  console.log('PASS 选字拖出不关闭、背景拖动不关闭、外部点击关闭且保存标题');
} finally {
  await browser.close();
}
