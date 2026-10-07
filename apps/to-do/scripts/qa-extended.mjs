import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  runtime = path.join(root, '.runtime'),
  out = path.join(runtime, 'test-results');
process.env.TEMP = path.join(runtime, 'tmp');
process.env.TMP = process.env.TEMP;
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(runtime, 'test-browsers');
const context = await chromium.launchPersistentContext(
  path.join(runtime, 'test-profile', 'extended-' + Date.now()),
  {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    args: ['--disk-cache-dir=' + path.join(runtime, 'test-cache')],
  },
);
const page = context.pages()[0],
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
await context.route('**/*', (r) =>
  new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort(),
);
const step = async (name, fn) => {
  const start = performance.now();
  await fn();
  results.push({ name, passed: true, ms: Math.round(performance.now() - start) });
  console.log('PASS ' + name);
};
const read = () =>
  page.evaluate(async () => {
    const db = await new Promise((ok, no) => {
      const req = indexedDB.open('todo-desktop-v2');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => no(req.error);
    });
    return new Promise((ok) => {
      const req = db.transaction('state').objectStore('state').get('workspace');
      req.onsuccess = () => {
        db.close();
        ok(req.result);
      };
    });
  });
const save = () => expect(page.locator('.save-status')).toContainText('已保存');
function fixture(count = 6) {
  const now = Date.now(),
    w = {
      schemaVersion: 2,
      revision: 0,
      tasks: {},
      groups: [],
      links: [],
      dailyEntries: {},
      monthlyEntries: {},
      monthlyTemplate: ['本月最重要的成就', '本月最大的遗憾', '下个月的重心'],
      viewport: { x: 64, y: 40, zoom: 1 },
      settings: {
        darkMode: false,
        sidebarWidth: 208,
        sidebarCollapsed: false,
        bodySize: 18,
        autoBackup: false,
        lastAutoBackupMonth: '',
      },
      legacyArchive: { qa: true },
      lastBackup: 0,
    };
  const names = ['研究与阅读', '实验设计', '写作与表达', '本周的小事', '学习计划', '生活留白'];
  const titles = [
    ['梳理研究问题', '阅读相关文献', '整理阅读笔记'],
    ['明确实验假设', '准备验证数据', '运行对照实验'],
    ['完成文章提纲', '写下核心论点', '打磨第一稿'],
    ['整理桌面', '备份重要文件', '回复邮件'],
    ['读完一章书', '记录三个问题', '练习一个例子'],
    ['散步半小时', '整理照片', '给自己一点空闲'],
  ];
  for (let i = 0; i < count; i++) {
    const gid = 'g' + i,
      ids = [];
    for (let j = 0; j < (count > 6 ? 5 : 3); j++) {
      const id = 't' + i + '-' + j;
      ids.push(id);
      w.tasks[id] = {
        id,
        title: count > 6 ? '任务 ' + i + ' / ' + j : titles[i][j],
        details:
          '## 下一小步\n\n把目标写清楚，给行动留一点空间。\n\n- 明确问题\n- 记录过程\n- 回看结果\n\n> 进步来自持续而具体的行动。\n\n\`\`\`python\nprogress = small_steps + consistency\n\`\`\`',
        urgency: j === 0 ? 'high' : 'medium',
        dueDate: '',
        createdAt: now - j * 60000,
        completed: i === 0 && j === 2,
        ...(i === 0 && j === 2 ? { completedAt: now } : {}),
      };
    }
    w.groups.push({
      id: gid,
      name: count > 6 ? '任务组 ' + String(i).padStart(3, '0') : names[i],
      autoName: false,
      taskIds: ids,
      position: {
        x: (i % (count > 6 ? 10 : 3)) * 370,
        y: Math.floor(i / (count > 6 ? 10 : 3)) * 310,
      },
      collapsed: false,
      hideCompleted: false,
    });
  }
  for (let i = 0; i < (count > 6 ? 150 : 3); i++) {
    const a = count > 6 ? i % count : [0, 1, 4][i],
      b = count > 6 ? (i < count ? (i + 1) % count : (i + 10) % count) : [1, 2, 0][i];
    w.links.push({
      id: 'e' + i,
      source: 'g' + a,
      target: 'g' + b,
      sourceHandle: 'right',
      targetHandle: 'left',
      label: count > 6 ? '' : ['提供依据', '整理结果', '积累问题'][i],
    });
  }
  for (let m = 0; m < 9; m++)
    for (let d = 1; d <= 28; d++) {
      if ((d + m) % 3 === 0) continue;
      const date = '2026-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      w.dailyEntries[date] = {
        content: '今天继续向前，认真记录自己的思考。'.repeat((d % 15) + 1),
        updatedAt: now,
      };
    }
  w.dailyEntries['2026-09-09'] = {
    content:
      '## 今天的收获\n\n读完一篇论文，重新梳理了问题的边界。有些想法还不成熟，但已经比昨天清楚了一点。\n\n### 做得好的事\n\n- 为实验留下完整记录\n- 给阅读留出不被打断的时间\n- 及时整理零散的想法\n\n> 把注意力放在下一件能够完成的小事上。\n\n### 明天继续\n\n尝试把新的思路写成一个可以验证的假设。',
    updatedAt: now,
  };
  w.monthlyEntries['2026-09'] = {
    content:
      '## 这个月的方向\n\n把积累的线索连接起来，形成可以执行的计划。\n\n| 方向 | 下一步 |\n| --- | --- |\n| 阅读 | 整理关键问题 |\n| 实验 | 完成第一轮验证 |\n| 写作 | 明确论证结构 |',
    updatedAt: now,
    checklist: [
      { text: '本月最重要的成就', answer: '把模糊的想法转化为清楚的问题。' },
      { text: '本月最大的遗憾', answer: '需要为休息留出更完整的时间。' },
      { text: '下个月的重心', answer: '保持节奏，完成一轮有记录的验证。' },
    ],
  };
  return w;
}
const load = async (w) => {
  await page.getByRole('button', { name: '数据与显示', exact: true }).click();
  await page.getByLabel('导入备份文件').setInputFiles({
    name: 'demo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(w)),
  });
  await page.getByRole('button', { name: '确认替换', exact: true }).click();
  await expect(page.locator('.import-review')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await save();
};
const drag = async (a, b) => {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 9, a.y + 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 15 });
  await page.mouse.up();
  await save();
};
const center = async (loc) => {
  const b = await loc.boundingBox();
  if (!b) throw Error('Missing drag target');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
try {
  await page.goto('http://127.0.0.1:4173');
  await page.getByRole('heading', { name: '待办事项' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await load(fixture());
  await step('组拖动、位置持久化与撤销重做', async () => {
    const before = await read(),
      a = await center(page.locator('[data-group-id=g0] .group-drag'));
    await drag(a, { x: a.x + 75, y: a.y + 36 });
    const after = await read();
    expect(after.groups[0].position).not.toEqual(before.groups[0].position);
    await page.getByLabel('撤销', { exact: true }).click();
    await save();
    expect((await read()).groups[0].position).toEqual(before.groups[0].position);
    await page.getByLabel('重做', { exact: true }).click();
    await save();
    expect((await read()).groups[0].position).toEqual(after.groups[0].position);
  });
  await step('真实类内排序与跨组拖动', async () => {
    await page.locator('[data-task-id="t0-0"]').hover();
    await drag(
      await center(page.locator('[data-task-id="t0-0"] .task-drag')),
      await center(page.locator('[data-task-id="t0-1"] .task-title')),
    );
    expect((await read()).groups[0].taskIds.slice(0, 2)).toEqual(['t0-1', 't0-0']);
    await page.locator('[data-task-id="t0-0"]').hover();
    await drag(
      await center(page.locator('[data-task-id="t0-0"] .task-drag')),
      await center(page.locator('[data-group-id=g1] .group-header')),
    );
    const d = await read();
    expect(d.groups[0].taskIds).not.toContain('t0-0');
    expect(d.groups[1].taskIds).toContain('t0-0');
  });
  await step('拖至空白创建新组', async () => {
    await page.locator('[data-task-id="t0-1"]').hover();
    const b = await page.locator('.canvas-shell').boundingBox();
    await drag(await center(page.locator('[data-task-id="t0-1"] .task-drag')), {
      x: b.x + b.width - 190,
      y: b.y + b.height - 120,
    });
    expect((await read()).groups.length).toBe(7);
  });
  await step('保存失败提示与恢复', async () => {
    await page.evaluate(() => {
      window.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'state')
          throw new DOMException('QA simulated quota', 'QuotaExceededError');
        return window.__put.apply(this, args);
      };
    });
    await page.getByLabel('切换主题', { exact: true }).click();
    await expect(page.locator('.error-banner')).toBeVisible();
    await expect(page.locator('.save-status')).toContainText('保存失败');
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.__put;
    });
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await save();
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await page.getByLabel('切换主题', { exact: true }).click();
    await save();
  });
  await step('视口在刷新后保持', async () => {
    const b = await page.locator('.canvas-shell').boundingBox();
    await page.keyboard.down('Space');
    await drag({ x: b.x + b.width - 80, y: b.y + 80 }, { x: b.x + b.width - 150, y: b.y + 135 });
    await page.keyboard.up('Space');
    const v = (await read()).viewport;
    await page.reload();
    await save();
    expect((await read()).viewport).toEqual(v);
  });
  await step('多选交换位置、拖线与关系编辑', async () => {
    await load(fixture());
    const before = await read();
    await page.locator('[data-group-id=g0] .group-drag').click();
    await page.keyboard.down('Shift');
    await page.locator('[data-group-id=g1] .group-drag').click();
    await page.keyboard.up('Shift');
    await page.getByLabel('交换选中组位置').click();
    await save();
    expect((await read()).groups[0].position).toEqual(before.groups[1].position);
    await page.getByLabel('撤销', { exact: true }).click();
    await save();
    const a = await center(page.locator('[data-group-id=g3] .port-right'));
    const b = await center(page.locator('[data-group-id=g4] .port-left'));
    await drag(a, b);
    expect((await read()).links.length).toBe(4);
    await page.locator('.edge-label').filter({ hasText: '提供依据' }).click();
    await page.getByLabel('关系说明', { exact: true }).fill('经过验证后');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await save();
    expect((await read()).links.find((e) => e.id === 'e0').label).toBe('经过验证后');
    await page.locator('.edge-label').filter({ hasText: '经过验证后' }).click();
    await page.getByRole('button', { name: '删除关系', exact: true }).click();
    await save();
    expect((await read()).links.length).toBe(3);
  });
  await step('搜索归档任务与未知完成时间', async () => {
    const data = fixture();
    for (const id of data.groups[2].taskIds) {
      data.tasks[id].completed = true;
      delete data.tasks[id].completedAt;
    }
    await load(data);
    await page.getByLabel('搜索任务', { exact: true }).fill('完成文章提纲');
    await page.locator('.search-results button').first().click();
    await expect(page.locator('.archive-group')).toHaveCount(1);
    await expect(page.locator('.archive-meta')).toContainText('完成时间未知');
    await expect(page.locator('.detail-panel')).toBeVisible();
    await page.getByLabel('关闭详情', { exact: true }).click();
    await save();
    expect((await read()).groups[2].completedAt).toBeUndefined();
    await page.getByRole('button', { name: /^未完成/ }).click();
  });
  await step('浅深色与三种分辨率视觉产物', async () => {
    await load(fixture());
    await page.reload();
    await save();
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [
      [1366, 768],
      [1920, 1080],
      [2560, 1440],
    ]) {
      await page.setViewportSize({ width, height });
      for (const dark of [false, true]) {
        if ((await read()).settings.darkMode !== dark) {
          await page.getByLabel('切换主题', { exact: true }).click();
          await save();
        }
        await page.mouse.move(210, 0);
        await page.screenshot({
          path: path.join(out, 'board-' + width + '-' + (dark ? 'dark' : 'light') + '.png'),
          animations: 'disabled',
        });
      }
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByLabel('切换主题', { exact: true }).click();
    await save();
    await page.locator('[data-task-id="t0-0"] .task-title').click();
    await page.screenshot({ path: path.join(out, 'detail-light.png'), animations: 'disabled' });
    await page.getByLabel('关闭详情', { exact: true }).click();
    await page.getByRole('button', { name: '每日复盘', exact: true }).click();
    await page.getByLabel('复盘日期').fill('2026-09-09');
    await page.getByRole('heading', { name: '每日复盘' }).click();
    await page.mouse.move(210, 0);
    await page.screenshot({ path: path.join(out, 'daily-light.png'), animations: 'disabled' });
    await page.getByLabel('切换主题', { exact: true }).click();
    await save();
    await page.mouse.move(210, 0);
    await page.screenshot({ path: path.join(out, 'daily-dark.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '每月总结', exact: true }).click();
    await page.getByLabel('总结月份').fill('2026-09');
    await page.getByRole('heading', { name: '每月总结' }).click();
    await page.mouse.move(210, 0);
    await page.screenshot({ path: path.join(out, 'monthly-dark.png'), animations: 'disabled' });
    await page.getByLabel('切换主题', { exact: true }).click();
    await save();
    await page.mouse.move(210, 0);
    await page.screenshot({ path: path.join(out, 'monthly-light.png'), animations: 'disabled' });
  });
  await step('125% / 150% 像素缩放与颜色对比', async () => {
    const cdp = await context.newCDPSession(page);
    await page.getByRole('button', { name: '待办事项', exact: true }).click();
    for (const scale of [1.25, 1.5]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1366,
        height: 768,
        deviceScaleFactor: scale,
        mobile: false,
      });
      await page.screenshot({
        path: path.join(out, 'board-scale-' + scale + '.png'),
        animations: 'disabled',
      });
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    const contrast = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const rgb = (name) =>
        s
          .getPropertyValue(name)
          .trim()
          .match(/[a-f0-9]{2}/gi)
          .map((x) => parseInt(x, 16) / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      const lum = (name) => {
        const c = rgb(name);
        return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
      };
      const ratio = (a, b) => {
        const x = lum(a),
          y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      return {
        text: ratio('--text', '--surface'),
        secondary: ratio('--muted', '--surface'),
        control: ratio('--control-border', '--surface'),
        selected: ratio('--accent', '--selected'),
      };
    });
    expect(contrast.text).toBeGreaterThanOrEqual(4.5);
    expect(contrast.secondary).toBeGreaterThanOrEqual(4.5);
    expect(contrast.control).toBeGreaterThanOrEqual(3);
    expect(contrast.selected).toBeGreaterThanOrEqual(4.5);
    results.push({ name: 'light-contrast', ...contrast });
  });
  await step('100 组 / 500 任务 / 150 连线拖动性能', async () => {
    await page.getByRole('button', { name: '待办事项', exact: true }).click();
    await load(fixture(100));
    await page.reload();
    await save();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.__frames = [];
      let last = performance.now();
      window.__measuring = true;
      const tick = (t) => {
        if (!window.__measuring) return;
        window.__frames.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const a = await center(page.locator('[data-group-id=g0] .group-drag'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 0; i < 60; i++)
      await page.mouse.move(a.x + Math.sin(i / 8) * 80, a.y + Math.cos(i / 8) * 30);
    await page.mouse.up();
    await save();
    const frames = await page.evaluate(() => {
      window.__measuring = false;
      return window.__frames;
    });
    const sorted = frames.slice(3).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)],
      p95 = sorted[Math.floor(sorted.length * 0.95)];
    results.push({
      name: 'frame-timing',
      samples: sorted.length,
      medianMs: median,
      p95Ms: p95,
      over50ms: sorted.filter((n) => n > 50).length,
    });
    await page.screenshot({ path: path.join(out, 'stress-100-groups.png') });
    expect(errors).toEqual([]);
  });
  await fs.writeFile(
    path.join(out, 'extended-result.json'),
    JSON.stringify({ results, errors }, null, 2),
  );
} catch (e) {
  console.error(e);
  await page.screenshot({ path: path.join(out, 'extended-failure.png') });
  await fs.writeFile(
    path.join(out, 'extended-result.json'),
    JSON.stringify({ results, errors, failure: String(e) }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await context.close();
}
