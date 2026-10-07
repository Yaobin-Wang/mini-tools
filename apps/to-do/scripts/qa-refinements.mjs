import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime'),
  out = path.join(runtime, 'test-results');
process.env.TEMP = path.join(runtime, 'tmp');
process.env.TMP = process.env.TEMP;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(runtime, 'test-browsers');
const context = await chromium.launchPersistentContext(
  path.join(runtime, 'test-profile', 'refinements-' + Date.now()),
  {
    headless: true,
    viewport: { width: 1536, height: 800 },
    args: ['--disk-cache-dir=' + path.join(runtime, 'browser-cache', 'qa-refinements')],
  },
);
const page = context.pages()[0],
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
await context.route('**/*', (r) =>
  new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
);
const save = () => expect(page.locator('.save-status')).toContainText('已保存');
const read = () =>
  page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('todo-desktop-v2');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve) => {
      const req = db.transaction('state').objectStore('state').get('workspace');
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
    });
  });
const load = async (w) => {
  await page.getByRole('button', { name: '数据与显示', exact: true }).click();
  await page.getByLabel('导入备份文件').setInputFiles({
    name: 'isolated-regression.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(w)),
  });
  await page.getByRole('button', { name: '确认替换', exact: true }).click();
  await expect(page.locator('.import-review')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await save();
  await page.reload();
  await page.locator('[data-group-id=g0]').waitFor();
  await page.evaluate(() => document.fonts.ready);
};
const step = async (name, fn) => {
  const detail = await fn();
  results.push({ name, passed: true, ...detail });
  console.log('PASS ' + name);
};
try {
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('heading', { name: '待办事项' }).waitFor();
  await save();
  const fixture = {
    schemaVersion: 2,
    revision: 0,
    tasks: {},
    groups: [],
    links: [],
    dailyEntries: {},
    monthlyEntries: {},
    monthlyTemplate: [],
    viewport: { x: 64, y: 60, zoom: 1 },
    lastBackup: 0,
    legacyArchive: {},
    settings: {
      darkMode: false,
      sidebarWidth: 208,
      sidebarCollapsed: false,
      bodySize: 18,
      autoBackup: false,
      lastAutoBackupMonth: '',
    },
  };
  fixture.settings.autoBackup = false;
  for (let i = 0; i < 2; i++) {
    const id = 't' + i;
    fixture.tasks[id] = {
      id,
      title: ['读完一章书并整理笔记', '把想法写成一个小实验'][i],
      details: '',
      urgency: 'medium',
      dueDate: '',
      createdAt: Date.now(),
      completed: false,
    };
    fixture.groups.push({
      id: 'g' + i,
      name: ['阅读计划', '实验计划'][i],
      autoName: false,
      taskIds: [id],
      position: { x: i * 320, y: 0 },
      collapsed: false,
      hideCompleted: false,
    });
  }
  fixture.links = [
    {
      id: 'e0',
      source: 'g0',
      target: 'g1',
      sourceHandle: 'right',
      targetHandle: 'left',
      label: '',
    },
  ];
  for (const zoom of [1, 0.75, 0.5]) {
    fixture.viewport = { x: 64, y: 60, zoom };
    await load(fixture);
    await step('标题拖动连续跟手与松手吸附 / ' + zoom, async () => {
      const title = page.locator('[data-group-id=g0] .group-name > span');
      const b = await title.boundingBox(),
        before = (await read()).groups[0].position;
      const x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      await page.keyboard.down('Alt');
      await page.mouse.move(x, y);
      await page.mouse.down();
      // One-pixel increments expose the previous per-event rounding feedback bug.
      for (let i = 1; i <= 20; i++) await page.mouse.move(x + i, y + i / 2);
      const activated = await page.locator('[data-group-id=g0]').boundingBox();
      for (let i = 21; i <= 80; i++) await page.mouse.move(x + i, y + i / 2);
      const moving = await page.locator('[data-group-id=g0]').boundingBox();
      expect(Math.abs(moving.x - activated.x - 60)).toBeLessThan(3);
      await page.mouse.up();
      await page.keyboard.up('Alt');
      await save();
      const after = (await read()).groups[0];
      expect(after.collapsed).toBe(false);
      expect(Math.abs((after.position.x - before.x) * zoom - 80)).toBeLessThanOrEqual(8 * zoom + 7);
      const font = await page
        .locator('[data-group-id=g0] .task-title')
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(font * zoom).toBeGreaterThanOrEqual(15);
      const groupFont = await title.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(groupFont * zoom).toBeCloseTo(zoom === 0.5 ? 17 : 20, 1);
      await page.getByLabel('撤销', { exact: true }).click();
      await save();
      expect((await read()).groups[0].position).toEqual(before);
      return { screenTitlePx: font * zoom, screenGroupTitlePx: groupFont * zoom };
    });
  }
  fixture.viewport = { x: 64, y: 60, zoom: 1 };
  for (const zoom of [1, 0.75, 0.5]) {
    fixture.viewport.zoom = zoom;
    fixture.groups[0].position = { x: 0, y: 0 };
    fixture.groups[1].position = { x: 400, y: 160 };
    await load(fixture);
    await step('吸住、保持、脱开及Alt释放 / ' + zoom, async () => {
      const handle = await page.locator('[data-group-id=g0] .group-drag').boundingBox();
      const target = await page.locator('[data-group-id=g1]').boundingBox();
      const x = handle.x + handle.width / 2,
        y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 8);
      await page.mouse.move(x, y + 8 + 160 * zoom - 5);
      let box = await page.locator('[data-group-id=g0]').boundingBox();
      expect(Math.abs(box.y - target.y)).toBeLessThan(1);
      await page.mouse.move(x, y + 8 + 160 * zoom + 9);
      box = await page.locator('[data-group-id=g0]').boundingBox();
      expect(Math.abs(box.y - target.y)).toBeLessThan(1);
      await page.mouse.move(x, y + 8 + 160 * zoom + 15);
      box = await page.locator('[data-group-id=g0]').boundingBox();
      expect(box.y - target.y).toBeGreaterThan(12);
      await page.keyboard.down('Alt');
      await page.mouse.move(x, y + 8 + 160 * zoom + 3);
      box = await page.locator('[data-group-id=g0]').boundingBox();
      expect(Math.abs(box.y - target.y - 3)).toBeLessThan(1);
      await page.mouse.up();
      await page.keyboard.up('Alt');
      await save();
      expect(Math.abs((await read()).groups[0].position.y - 160 - 3 / zoom)).toBeLessThan(1);
    });
  }
  fixture.viewport.zoom = 1;
  fixture.groups[0].position = { x: 0, y: 0 };
  fixture.groups[1].position = { x: 320, y: 0 };
  await load(fixture);
  await step('点击框体折叠、内联改名、直接删除与完整撤销', async () => {
    const group = page.locator('[data-group-id=g0]');
    await group.locator('.group-count').click();
    await expect(group.locator('.group-body')).toHaveCount(0);
    await group.locator('.group-count').click();
    await expect(group.locator('.group-body')).toHaveCount(1);
    await group.locator('.group-title').click();
    const input = page.getByLabel('编辑组标题', { exact: true });
    await input.fill('直接修改标题');
    await input.press('Enter');
    await save();
    expect((await read()).groups[0].name).toBe('直接修改标题');
    await expect(group.locator('.group-body')).toHaveCount(1);
    await group.locator('.group-title').click();
    await input.fill('取消的修改');
    await input.press('Escape');
    await save();
    expect((await read()).groups[0].name).toBe('直接修改标题');
    await group.locator('.group-title').click();
    await input.fill('');
    await input.press('Enter');
    await save();
    expect((await read()).groups[0].name).toBe('直接修改标题');
    const before = await read();
    await page.getByLabel('设置组：直接修改标题', { exact: true }).click();
    await page.getByRole('button', { name: '删除组', exact: true }).click();
    await save();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(group).toHaveCount(0);
    expect((await read()).links).toEqual([]);
    await page.getByLabel('撤销', { exact: true }).click();
    await save();
    const after = await read();
    expect(after.groups).toEqual(before.groups);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.links).toEqual(before.links);
  });
  await step('窄间距箭头方向与整理留白', async () => {
    const d = await page.locator('.react-flow__edge-path').getAttribute('d');
    const values = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const ys = values.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(80);
    const source = await page.locator('[data-group-id=g0]').boundingBox();
    expect(source.width).toBe(296);
    await page.getByRole('button', { name: '整理布局', exact: true }).click();
    await save();
    const w = await read();
    expect(w.groups[1].position.x - w.groups[0].position.x - 296).toBe(64);
    await page.screenshot({ path: path.join(out, 'refined-board.png') });
    return { groupWidth: source.width, arrangedGap: 64 };
  });
  await step('多组移动保持相对位置与松手网格吸附', async () => {
    await page.locator('.react-flow__pane').click({ position: { x: 900, y: 420 } });
    await page.keyboard.down('Shift');
    await page.locator('[data-group-id=g0] .group-count').click();
    await page.locator('[data-group-id=g1] .group-count').click();
    await page.keyboard.up('Shift');
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
    const before = await read();
    const h = await page.locator('[data-group-id=g0] .group-drag').boundingBox();
    const x = h.x + h.width / 2,
      y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 9, y + 2);
    await page.mouse.move(x + 80, y + 91, { steps: 30 });
    await page.mouse.up();
    await save();
    const after = await read();
    const delta = after.groups.map((g, i) => ({
      x: g.position.x - before.groups[i].position.x,
      y: g.position.y - before.groups[i].position.y,
    }));
    expect(delta[0]).toEqual(delta[1]);
    expect(delta[0].x).toBeGreaterThan(30);
    expect(after.groups[0].position.x % 16).toBe(0);
    expect(after.groups[0].position.y % 16).toBe(0);
    await page.getByLabel('撤销', { exact: true }).click();
    await save();
    expect((await read()).groups).toEqual(before.groups);
  });
  for (const zoom of [1, 0.75, 0.5]) {
    fixture.viewport = { x: 64, y: 60, zoom };
    await load(fixture);
    await step('拖动四角调整尺寸与撤销重做 / ' + zoom, async () => {
      const group = page.locator('[data-group-id=g0]');
      await group.locator('.group-count').click({ modifiers: ['Shift'] });
      const before = await group.boundingBox(),
        stateBefore = await read();
      const handle = await group.locator('.group-resize-handle.bottom.right').boundingBox();
      const x = handle.x + handle.width / 2,
        y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 100 * zoom, y + 80 * zoom, { steps: 30 });
      await page.mouse.up();
      await save();
      const after = await group.boundingBox(),
        stateAfter = await read();
      expect(Math.abs(after.width - before.width - 100 * zoom)).toBeLessThan(2);
      expect(Math.abs(after.height - before.height - 80 * zoom)).toBeLessThan(2);
      expect(stateAfter.groups[0].size.width).toBeCloseTo(after.width / zoom, 0);
      expect(stateAfter.groups[0].collapsed).toBe(false);
      expect(stateAfter.tasks).toEqual(stateBefore.tasks);
      await page.getByLabel('撤销', { exact: true }).click();
      await save();
      expect((await read()).groups).toEqual(stateBefore.groups);
      expect((await group.boundingBox()).height).toBeCloseTo(before.height, 0);
      await page.getByLabel('重做', { exact: true }).click();
      await save();
      expect((await read()).groups).toEqual(stateAfter.groups);
      const top = await group.locator('.group-resize-handle.top.left').boundingBox();
      const tx = top.x + top.width / 2,
        ty = top.y + top.height / 2;
      await page.mouse.move(tx, ty);
      await page.mouse.down();
      await page.mouse.move(tx - 30 * zoom, ty - 20 * zoom, { steps: 20 });
      await page.mouse.up();
      await save();
      const moved = (await read()).groups[0];
      expect(moved.position.x).toBeCloseTo(stateAfter.groups[0].position.x - 30, 0);
      expect(moved.position.y).toBeCloseTo(stateAfter.groups[0].position.y - 20, 0);
      expect(moved.size.width).toBeCloseTo(stateAfter.groups[0].size.width + 30, 0);
      const edgeBox = await group.boundingBox();
      await page.mouse.move(edgeBox.x + edgeBox.width, edgeBox.y + edgeBox.height * 0.25);
      await page.mouse.down();
      await page.mouse.move(
        edgeBox.x + edgeBox.width + 40 * zoom,
        edgeBox.y + edgeBox.height * 0.25,
        { steps: 20 },
      );
      await page.mouse.up();
      await save();
      const edgeResized = (await read()).groups[0];
      expect(edgeResized.size.width).toBeCloseTo(moved.size.width + 40, 0);
      expect(edgeResized.size.height).toBeCloseTo(moved.size.height, 0);
    });
  }
  fixture.viewport = { x: 64, y: 60, zoom: 1 };
  fixture.groups[1].position.x = 640;
  await load(fixture);
  await step('数值尺寸、折叠恢复、刷新持久化与自动布局', async () => {
    const group = page.locator('[data-group-id=g0]');
    await page.getByLabel('设置组：阅读计划', { exact: true }).click();
    await page.getByLabel('任务组宽度', { exact: true }).fill('450');
    await page.getByLabel('任务组宽度', { exact: true }).press('Tab');
    await page.getByLabel('任务组高度', { exact: true }).fill('260');
    await page.getByLabel('任务组高度', { exact: true }).press('Tab');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await save();
    expect((await read()).groups[0].size).toEqual({ width: 450, height: 260 });
    let box = await group.boundingBox();
    expect(box.width).toBe(450);
    expect(box.height).toBe(260);
    await group.locator('.group-collapse').click();
    await save();
    expect((await group.boundingBox()).height).toBe(46);
    if (
      !(await page
        .locator('.react-flow__node[data-id=g0]')
        .evaluate((el) => el.classList.contains('selected')))
    )
      await group.locator('.group-count').click({ modifiers: ['Shift'] });
    const collapsed = await group.locator('.group-resize-handle.bottom.right').boundingBox();
    const cx = collapsed.x + collapsed.width / 2,
      cy = collapsed.y + collapsed.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy, { steps: 15 });
    await page.mouse.up();
    await save();
    expect((await read()).groups[0].size).toEqual({ width: 480, height: 260 });
    await page.getByLabel('撤销', { exact: true }).click();
    await save();
    await group.locator('.group-collapse').click();
    await save();
    expect((await group.boundingBox()).height).toBe(260);
    await page.getByRole('button', { name: '整理布局', exact: true }).click();
    await save();
    const arranged = await read();
    expect(arranged.groups[1].position.x - arranged.groups[0].position.x).toBeGreaterThanOrEqual(
      514,
    );
    expect(arranged.groups[0].size).toEqual({ width: 450, height: 260 });
    await page.reload();
    await group.waitFor();
    box = await group.boundingBox();
    expect(box.width).toBeCloseTo(450 * (await read()).viewport.zoom, 0);
    await group.locator('.group-count').click({ modifiers: ['Shift'] });
    await page.screenshot({ path: path.join(out, 'resizable-groups.png') });
    await page.getByLabel('设置组：阅读计划', { exact: true }).click();
    await page.getByLabel('任务组高度', { exact: true }).fill('100');
    await page.getByLabel('任务组高度', { exact: true }).press('Tab');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.getByLabel('添加到组：阅读计划', { exact: true }).click();
    for (const title of ['新增任务一', '新增任务二', '新增任务三']) {
      await group.getByLabel('添加同组任务', { exact: true }).fill(title);
      await group.getByLabel('添加同组任务', { exact: true }).press('Enter');
    }
    await expect
      .poll(() => group.locator('.group-body').evaluate((el) => el.scrollHeight <= el.clientHeight))
      .toBe(true);
    await save();
    expect((await read()).groups[0].size).toEqual({ width: 450 });
    await expect(group.locator('.task-title').filter({ hasText: '新增任务三' })).toBeInViewport();
    await page.getByRole('heading', { name: '待办事项', exact: true }).click();
    await page.reload();
    await group.waitFor();
    await expect(group.locator('.task-title').filter({ hasText: '新增任务三' })).toBeInViewport();
    expect((await read()).groups[0].size).toEqual({ width: 450 });
    await page.getByLabel('设置组：阅读计划', { exact: true }).click();
    await page.getByLabel('任务组高度', { exact: true }).fill('100');
    await page.getByLabel('任务组高度', { exact: true }).press('Tab');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await save();
    expect((await read()).groups[0].size).toEqual({ width: 450, height: 100 });
    expect(
      await group.locator('.group-body').evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await page.getByLabel('设置组：阅读计划', { exact: true }).click();
    await page.getByRole('button', { name: '恢复自动尺寸', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await save();
    expect((await read()).groups[0].size).toBeUndefined();
    expect((await group.boundingBox()).width).toBeCloseTo(296 * (await read()).viewport.zoom, 0);
  });
  for (const zoom of [1, 0.75, 0.5]) {
    const small = structuredClone(fixture);
    small.viewport.zoom = zoom;
    small.groups[0].size = { width: 296, height: 100 };
    small.groups[0].collapsed = true;
    await load(small);
    await step('新增长标题自动适应高度、保留宽度与撤销重做 / ' + zoom, async () => {
      const group = page.locator('[data-group-id=g0]');
      await group.getByLabel('添加到组：阅读计划', { exact: true }).click();
      await group
        .getByLabel('添加同组任务', { exact: true })
        .fill('新增任务需要自动换行，并完整显示到最后一行');
      await group.getByLabel('添加同组任务', { exact: true }).press('Enter');
      await save();
      expect((await read()).groups[0].size).toEqual({ width: 296 });
      await expect
        .poll(() =>
          group.locator('.group-body').evaluate((el) => el.scrollHeight <= el.clientHeight),
        )
        .toBe(true);
      const box = await group.boundingBox();
      const last = await group.locator('.task-card').last().boundingBox();
      expect(last.y + last.height).toBeLessThanOrEqual(box.y + box.height);
      expect(box.width).toBeCloseTo(296 * zoom, 0);
      await page.getByLabel('撤销', { exact: true }).click();
      await save();
      expect((await read()).groups[0].size).toEqual({ width: 296, height: 100 });
      expect((await read()).groups[0].taskIds).toHaveLength(1);
      await page.getByLabel('重做', { exact: true }).click();
      await save();
      expect((await read()).groups[0].size).toEqual({ width: 296 });
      expect((await read()).groups[0].taskIds).toHaveLength(2);
      await expect
        .poll(() =>
          group.locator('.group-body').evaluate((el) => el.scrollHeight <= el.clientHeight),
        )
        .toBe(true);
    });
  }
  fixture.groups[1].position.x = 320;
  fixture.groups[0].autoName = true;
  await load(fixture);
  await step('详情外部点击收起、切换任务与编辑保存', async () => {
    const openFirst = () => page.locator('[data-task-id=t0] .task-title').click();
    const detail = page.locator('.detail-panel');
    await openFirst();
    await page.getByLabel('任务标题', { exact: true }).fill('外部关闭后保留的标题');
    await page.getByRole('heading', { name: '待办事项', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await save();
    expect((await read()).tasks.t0.title).toBe('外部关闭后保留的标题');
    expect((await read()).groups[0].name).toBe('阅读计划');
    await openFirst();
    await page.getByLabel('源码编辑', { exact: true }).click();
    await page.getByLabel('详细备注 Markdown').fill('最后一次输入也应立即保存');
    await expect(detail).toHaveCount(1);
    await page.locator('.react-flow__pane').click({ position: { x: 60, y: 400 } });
    await expect(detail).toHaveCount(0);
    await save();
    expect((await read()).tasks.t0.details).toBe('最后一次输入也应立即保存');
    await openFirst();
    await page.getByLabel('任务标题', { exact: true }).fill('切换前保存');
    await page.locator('[data-task-id=t1] .task-title').click();
    await expect(detail).toHaveCount(1);
    await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('把想法写成一个小实验');
    await save();
    expect((await read()).tasks.t0.title).toBe('切换前保存');
    await page.getByRole('button', { name: '删除任务', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(detail).toHaveCount(1);
    await page.getByLabel('切换主题', { exact: true }).click();
    await expect(detail).toHaveCount(0);
    await page.getByLabel('切换主题', { exact: true }).click();
    await openFirst();
    await page.getByLabel('任务标题', { exact: true }).fill('Escape退出同样保存');
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await save();
    expect((await read()).tasks.t0.title).toBe('Escape退出同样保存');
    await page.reload();
    await page.getByRole('heading', { name: '待办事项', exact: true }).waitFor();
    expect((await read()).tasks.t0.details).toBe('最后一次输入也应立即保存');
  });
  await step('详情拖拽宽度、组件自适应、保存及窗口约束', async () => {
    const openFirst = () => page.locator('[data-task-id=t0] .task-title').click();
    const detail = page.locator('.detail-panel');
    const handle = page.getByRole('separator', { name: '调整详情宽度', exact: true });
    const dragWidth = async (width) => {
      const box = await detail.boundingBox();
      const h = await handle.boundingBox();
      const x = h.x + h.width / 2,
        y = h.y + 90;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + box.width - width, y, { steps: 25 });
      await page.mouse.up();
      await save();
      await expect(detail).toHaveCount(1);
      expect((await detail.boundingBox()).width).toBeCloseTo(width, 0);
    };
    await openFirst();
    expect((await detail.boundingBox()).width).toBeCloseTo(560, 0);
    await page.getByLabel('实时预览', { exact: true }).click();
    await page
      .getByLabel('详细备注 Markdown')
      .fill('## 宽度自适应\n\n' + '长标题与正文自动换行。'.repeat(15));
    await dragWidth(760);
    expect((await read()).settings.detailWidth).toBeCloseTo(760, 0);
    expect(
      await detail.locator('.editor-body').evaluate((el) => getComputedStyle(el).flexDirection),
    ).toBe('row');
    await page.screenshot({ path: path.join(out, 'detail-wide.png') });
    await dragWidth(380);
    expect(
      await detail.locator('.editor-body').evaluate((el) => getComputedStyle(el).flexDirection),
    ).toBe('column');
    expect(
      await detail
        .locator('.detail-fields > label')
        .first()
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    ).toBe(1);
    const editor = await detail.locator('.editor-body').boundingBox();
    const preview = await detail.locator('.preview-wrap').boundingBox();
    expect(Math.abs(preview.width - editor.width)).toBeLessThan(2);
    expect(
      await detail.locator('.detail-content').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: path.join(out, 'detail-narrow.png') });
    await handle.focus();
    await handle.press('ArrowLeft');
    await save();
    expect((await read()).settings.detailWidth).toBeCloseTo(390, 0);
    await handle.press('Home');
    await save();
    expect((await detail.boundingBox()).width).toBeCloseTo(360, 0);
    await handle.dblclick();
    await save();
    expect((await detail.boundingBox()).width).toBeCloseTo(560, 0);
    await dragWidth(760);
    await page.getByRole('heading', { name: '待办事项', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await openFirst();
    expect((await detail.boundingBox()).width).toBeCloseTo(760, 0);
    await page.reload();
    await openFirst();
    expect((await detail.boundingBox()).width).toBeCloseTo(760, 0);
    for (const width of [1093, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(async () => Math.round((await detail.boundingBox()).width))
        .toBe(Math.min(760, width - 208 - 320));
      await expect
        .poll(() =>
          page.locator('.page-and-detail').evaluate((el) => el.scrollWidth <= el.clientWidth),
        )
        .toBe(true);
    }
    await page.setViewportSize({ width: 1536, height: 900 });
    await handle.dblclick();
    await page.getByRole('heading', { name: '待办事项', exact: true }).click();
    expect((await read()).tasks.t0.details).toContain('宽度自适应');
  });
  await step('同组添加框点击外部收起、草稿保留与连续添加', async () => {
    const group = page.locator('[data-group-id=g0]');
    const other = page.locator('[data-group-id=g1]');
    const open = () => group.getByLabel('添加到组：阅读计划', { exact: true }).click();
    const input = group.getByLabel('添加同组任务', { exact: true });
    const before = await group.boundingBox();
    const originalCount = (await read()).groups[0].taskIds.length;
    await open();
    await input.click();
    await expect(input).toBeVisible();
    await input.fill('尚未提交的草稿');
    await page.getByRole('heading', { name: '待办事项', exact: true }).click();
    await expect(input).toHaveCount(0);
    expect((await group.boundingBox()).height).toBeCloseTo(before.height, 0);
    expect((await read()).groups[0].taskIds.length).toBe(originalCount);
    await open();
    await expect(input).toHaveValue('尚未提交的草稿');
    await group.getByLabel('确认添加', { exact: true }).click();
    await save();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('');
    expect((await read()).groups[0].taskIds.length).toBe(originalCount + 1);
    await input.fill('回车连续添加');
    await input.press('Enter');
    await save();
    await expect(input).toBeVisible();
    expect((await read()).groups[0].taskIds.length).toBe(originalCount + 2);
    await open();
    await expect(input).toHaveCount(0);
    await open();
    await group.locator('.task-title').first().click();
    await expect(input).toHaveCount(0);
    await expect(page.locator('.detail-panel')).toBeVisible();
    await page.getByRole('heading', { name: '待办事项', exact: true }).click();
    await open();
    await other.getByLabel('添加到组：实验计划', { exact: true }).click();
    await expect(input).toHaveCount(0);
    await expect(other.getByLabel('添加同组任务', { exact: true })).toBeVisible();
    await other.getByLabel('添加同组任务', { exact: true }).press('Escape');
    await expect(other.getByLabel('添加同组任务', { exact: true })).toHaveCount(0);
  });
  await step('每日三列月份、左对齐日期与加宽月度面板', async () => {
    const sizes = [];
    for (const width of [1093, 1366, 1536, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: '每日复盘', exact: true }).click();
      const columns = await page
        .locator('.year-calendar')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(3);
      const journal = await page.locator('.journal-column').boundingBox();
      const date = await page.getByLabel('复盘日期').boundingBox();
      expect(journal.x).toBeLessThanOrEqual(248);
      expect(date.x + date.width).toBeLessThanOrEqual(journal.x + journal.width + 1);
      expect(
        await page.locator('.daily-layout').evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (width === 1536) await page.screenshot({ path: path.join(out, 'refined-daily.png') });
      await page.getByRole('button', { name: '每月总结', exact: true }).click();
      const month = await page.locator('.monthly-paper').boundingBox();
      expect(month.width).toBeGreaterThanOrEqual(width - 208 - 82);
      if (width === 1536) await page.screenshot({ path: path.join(out, 'refined-monthly.png') });
      sizes.push({ width, columns, journalWidth: journal.width, monthlyWidth: month.width });
    }
    return { sizes };
  });
  expect(errors).toEqual([]);
} catch (e) {
  results.push({ passed: false, failure: String(e) });
  console.error(e);
  await page.screenshot({ path: path.join(out, 'refined-failure.png') });
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    path.join(out, 'refinements-result.json'),
    JSON.stringify({ results, errors }, null, 2),
  );
  await context.close();
}
