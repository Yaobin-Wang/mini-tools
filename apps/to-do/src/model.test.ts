/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import {
  emptyWorkspace,
  importWorkspace,
  addGroup,
  addTask,
  moveTask,
  toggleTask,
  normalize,
  isDone,
  finalizeGroup,
  removeGroup,
  removeTask,
  validConnection,
  contentLength,
  calendarMonth,
  dayKey,
  level,
  template,
  BOARD_ZOOM_BASE,
  boardZoomPercent,
  constrainToRegion,
} from './model';
import { snapRect, magneticSnap, arrange, route, segmentBlocked, freePosition } from './layout';
describe('人工示例备份迁移', () => {
  for (const completed of [false, true]) {
    it(`保留任务、正文与历史归档（已完成：${completed}）`, () => {
      const raw = {
        todos: [{ id: 'example-task', text: '示例任务', details: '人工构造的迁移示例', completed,
          urgency: 'medium', createdAt: 1704067200000,
          ...(completed ? { completedAt: 1704153600000 } : {}),
        }],
        dailyEntries: {}, monthlyEntries: {}, monthlyTemplate: [], goals: [],
      };
      const w = importWorkspace(raw);
      expect(Object.keys(w.tasks)).toHaveLength(raw.todos.length);
      expect(w.groups).toHaveLength(raw.todos.length);
      for (const t of raw.todos) {
        expect(w.tasks[t.id].title).toBe(t.text);
        expect(w.tasks[t.id].details).toBe(t.details || '');
        expect(w.tasks[t.id].completedAt).toBe(t.completedAt);
      }
      expect(w.dailyEntries).toEqual(raw.dailyEntries);
      expect(w.legacyArchive.originalExtras).toHaveProperty('goals');
      expect(importWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
    });
  }
});
describe('任务与状态', () => {
  it('追加任务恢复内容高度但保留宽度，自动高度可备份并允许再次手动调整', () => {
    const w = emptyWorkspace();
    addGroup(w, '新增测试', { x: 0, y: 0 });
    const g = w.groups[0];
    g.size = { width: 450, height: 100 };
    g.collapsed = true;
    addTask(w, g.id, '需要完整显示的新任务');
    expect(g.collapsed).toBe(false);
    expect(g.size).toEqual({ width: 450 });
    const restored = importWorkspace(JSON.parse(JSON.stringify(w)));
    expect(restored.groups[0].size).toEqual({ width: 450 });
    g.size.height = 180;
    normalize(w);
    expect(g.size.height).toBe(180);
    addTask(w, g.id, '再次新增');
    expect(g.size).toEqual({ width: 450 });
    delete g.size;
    addTask(w, g.id, '默认宽度新增');
    expect(g.size).toBeUndefined();
  });
  it.each([true, false])('组标题仅初始化同名，后续独立（旧自动命名标记 %s）', (autoName) => {
    const w = emptyWorkspace();
    const first = addGroup(w, 'Agent_Aes', { x: 0, y: 0 });
    const g = w.groups[0];
    expect(g.name).toBe(w.tasks[first].title);
    g.autoName = autoName;
    w.tasks[first].title = '文章改写';
    normalize(w);
    expect(g.name).toBe('Agent_Aes');
    const second = addTask(w, g.id, '第二条任务');
    moveTask(w, second, g.id, 0);
    normalize(w);
    expect(g.name).toBe('Agent_Aes');
    removeTask(w, second);
    normalize(w);
    expect(g.name).toBe('Agent_Aes');
    g.name = '独立组名';
    normalize(w);
    expect(w.tasks[first].title).toBe('文章改写');
    expect(g.name).toBe('独立组名');
    const restored = importWorkspace(JSON.parse(JSON.stringify(w)));
    restored.tasks[first].title = '再次改名';
    normalize(restored);
    expect(restored.groups[0].name).toBe('独立组名');
  });
  it('两步完成、组归属、排序、恢复、删除连线', () => {
    const w = emptyWorkspace(),
      a = addGroup(w, 'A', { x: 0, y: 0 }),
      b = addGroup(w, 'B', { x: 400, y: 0 }),
      ga = w.groups[0],
      gb = w.groups[1],
      c = addTask(w, ga.id, 'C');
    toggleTask(w, a);
    normalize(w, 100);
    expect(isDone(ga, w)).toBe(false);
    toggleTask(w, c);
    normalize(w, 200);
    expect(isDone(ga, w)).toBe(false);
    expect(ga.completedAt).toBeUndefined();
    expect(isDone(importWorkspace(w).groups[0], w)).toBe(false);
    const legacy = structuredClone(w);
    delete legacy.groups[0].finalized;
    expect(isDone(importWorkspace(legacy).groups[0], legacy)).toBe(true);
    finalizeGroup(w, ga.id);
    normalize(w, 200);
    expect(isDone(ga, w)).toBe(true);
    expect(ga.completedAt).toBe(200);
    toggleTask(w, a);
    normalize(w, 300);
    expect(ga.completedAt).toBeUndefined();
    expect(ga.finalized).toBe(false);
    moveTask(w, c, gb.id, 0);
    expect(gb.taskIds).toEqual([c, b]);
    expect(ga.taskIds).toEqual([a]);
    expect(validConnection(w, ga.id, ga.id)).toBe(false);
    w.links.push({
      id: 'e',
      source: ga.id,
      target: gb.id,
      sourceHandle: 'right',
      targetHandle: 'left',
      label: '',
    });
    expect(validConnection(w, ga.id, gb.id)).toBe(false);
    expect(validConnection(w, gb.id, ga.id)).toBe(true);
    removeGroup(w, ga.id);
    expect(w.links).toHaveLength(0);
    expect(w.tasks[a]).toBeUndefined();
  });
  it('空组不完成，旧记录未知完成时间保持未知', () => {
    const w = emptyWorkspace();
    w.groups.push({
      id: 'g',
      name: 'empty',
      autoName: false,
      taskIds: [],
      position: { x: 0, y: 0 },
      collapsed: false,
      hideCompleted: false,
    });
    normalize(w);
    expect(isDone(w.groups[0], w)).toBe(false);
  });
  it('拒绝损坏与重复归属，不修改输入对象', () => {
    const w = emptyWorkspace(),
      id = addGroup(w, 'A', { x: 0, y: 0 });
    const before = JSON.stringify(w);
    const raw = JSON.parse(before);
    raw.groups[0].taskIds.push(id);
    expect(() => importWorkspace(raw)).toThrow();
    expect(JSON.stringify(w)).toBe(before);
    expect(() => importWorkspace({ todos: [] })).toThrow();
    expect(() => importWorkspace({ ...w, schemaVersion: 9 })).toThrow();
  });
});
describe('文字即记录', () => {
  it.each([
    '',
    '  \n',
    '---\n### \n- ',
    '![图片](https://example.com/a.png)',
    template,
    '### DO\n\n### UnDo\n\n### Thinking',
  ])('无有效文字 %s', (s) => expect(contentLength(s)).toBe(0));
  it.each([
    ['你好', 2],
    ['Hello world', 10],
    ['🪴', 1],
    ['正文 DO Thinking 仍保留', 15],
    ['[链接](https://example.com)', 2],
    ['- [x] 完成', 2],
    ['\`\`\`js\nconst a = 1\n\`\`\`', 8],
  ])('统计 %s', (s, n) => expect(contentLength(s)).toBe(n));
  it('等级边界', () =>
    expect([0, 1, 49, 50, 199, 200, 499, 500].map(level)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]));
  it('闰年、月底、本地午夜', () => {
    expect(calendarMonth(2024, 1).days).toHaveLength(29);
    expect(calendarMonth(2025, 1).days).toHaveLength(28);
    expect(calendarMonth(2026, 3).days.at(-1)).toBe('2026-04-30');
    expect(dayKey(new Date(2026, 8, 9, 0, 1))).toBe('2026-09-09');
  });
});
describe('画布几何', () => {
  it('区域边界、备份与非法归属校验', () => {
    const w = emptyWorkspace();
    addGroup(w, '受限任务', { x: 40, y: 70 });
    const id = w.groups[0].id;
    w.regions = [
      {
        id: 'region',
        name: '学习区',
        color: '#879FB6',
        position: { x: 0, y: 0 },
        width: 600,
        height: 400,
        groupIds: [id],
      },
    ];
    expect(constrainToRegion(w, id, { x: -20, y: -10 }, 296, 100)).toEqual({ x: 20, y: 56 });
    expect(constrainToRegion(w, id, { x: 700, y: 600 }, 296, 100)).toEqual({ x: 284, y: 280 });
    expect(importWorkspace(w).regions).toEqual(w.regions);
    const invalid = structuredClone(w);
    invalid.regions![0].groupIds.push(id);
    expect(() => importWorkspace(invalid)).toThrow('区域任务组归属错误');
    const brokenColor = structuredClone(w);
    brokenColor.regions![0].color = 'url(example)';
    expect(() => importWorkspace(brokenColor)).toThrow('区域格式错误');
  });
  it('原60%作为新100%，兼容旧视口并保留新范围', () => {
    expect(BOARD_ZOOM_BASE).toBe(0.48);
    expect(emptyWorkspace().viewport.zoom).toBe(0.48);
    expect([0.24, 0.48, 0.6, 0.72].map(boardZoomPercent)).toEqual([50, 100, 125, 150]);
    const w = emptyWorkspace();
    for (const zoom of [0.24, 0.48, 0.6, 0.72]) {
      w.viewport.zoom = zoom;
      expect(importWorkspace(JSON.parse(JSON.stringify(w))).viewport.zoom).toBe(zoom);
    }
    w.viewport.zoom = 1.5;
    expect(importWorkspace(w).viewport).toEqual({ x: 50, y: 50, zoom: 0.72 });
    expect(w.viewport.zoom).toBe(1.5);
    for (const zoom of [0, 0.23, 1.51, Infinity]) {
      w.viewport.zoom = zoom;
      expect(() => importWorkspace(w)).toThrow('画布视口格式错误');
    }
  });
  it('详情宽度兼容旧备份并校验范围', () => {
    const w = emptyWorkspace();
    expect(w.settings.detailWidth).toBe(560);
    delete w.settings.detailWidth;
    expect(importWorkspace(w).settings.detailWidth).toBeUndefined();
    w.settings.detailWidth = 740;
    expect(importWorkspace(JSON.parse(JSON.stringify(w))).settings.detailWidth).toBe(740);
    for (const width of [0, 359, 961, Infinity]) {
      w.settings.detailWidth = width;
      expect(() => importWorkspace(w)).toThrow('设置格式错误');
    }
  });
  it('自定义尺寸导入导出保留，兼容旧数据并拒绝无效尺寸', () => {
    const w = emptyWorkspace();
    addGroup(w, '尺寸测试', { x: 10, y: 20 });
    expect(importWorkspace(w).groups[0].size).toBeUndefined();
    w.groups[0].size = { width: 420, height: 260 };
    expect(importWorkspace(JSON.parse(JSON.stringify(w))).groups[0].size).toEqual({
      width: 420,
      height: 260,
    });
    for (const size of [
      { width: 200, height: 100 },
      { width: 300, height: 0 },
      { width: Infinity, height: 100 },
    ]) {
      w.groups[0].size = size;
      expect(() => importWorkspace(w)).toThrow('任务组尺寸无效');
    }
  });
  it.each([0.5, 0.75, 1, 1.5])('磁性吸附滞回与Alt释放，缩放 %s', (zoom) => {
    const other = { id: 'b', x: 400, y: 200, width: 296, height: 100 };
    const moving = { id: 'a', x: 30, y: 200 - 5 / zoom, width: 296, height: 100 };
    const acquired = magneticSnap(moving, [other], zoom, {});
    expect(acquired.position.y).toBeCloseTo(200);
    const held = magneticSnap({ ...moving, y: 200 + 10 / zoom }, [other], zoom, acquired.locks);
    expect(held.position.y).toBeCloseTo(200);
    const released = magneticSnap({ ...moving, y: 200 + 13 / zoom }, [other], zoom, held.locks);
    expect(released.position.y).toBe(200 + 13 / zoom);
    expect(released.locks.y).toBeUndefined();
    expect(magneticSnap(moving, [other], zoom, acquired.locks, true).position).toEqual({
      x: moving.x,
      y: moving.y,
    });
  });
  it('缩放下按屏幕像素吸附、Alt关闭', () => {
    const m = { id: 'a', x: 5, y: 90, width: 320, height: 100 },
      o = { id: 'b', x: 0, y: 0, width: 320, height: 50 };
    expect(snapRect(m, [o], 1).position.x).toBe(0);
    expect(snapRect(m, [o], 1.5).position.x).toBe(0);
    expect(snapRect(m, [o], 0.5).guides.length).toBeGreaterThan(0);
    expect(snapRect(m, [o], 1, true).position.x).toBe(5);
  });
  it('整理不会重叠，创建寻找空位', () => {
    const rs = [
      { id: 'b', x: 400, y: 0, width: 320, height: 200 },
      { id: 'a', x: 0, y: 0, width: 320, height: 100 },
      { id: 'c', x: 20, y: 300, width: 320, height: 100 },
    ];
    const p = arrange(rs, 720);
    expect(p.a).toEqual({ x: 0, y: 0 });
    expect(p.b).toEqual({ x: 384, y: 0 });
    expect(p.c.y).toBe(264);
    expect(freePosition({ x: 0, y: 0 }, rs)).not.toEqual({ x: 0, y: 0 });
  });
  it('连线路径绕开中间阻挡组', () => {
    const obstacles = [
      { id: 'a', x: 0, y: 0, width: 320, height: 100 },
      { id: 'b', x: 800, y: 0, width: 320, height: 100 },
      { id: 'block', x: 450, y: -40, width: 200, height: 180 },
    ];
    const ps = route({ x: 320, y: 50 }, { x: 800, y: 50 }, 'right', 'left', obstacles);
    expect(ps.slice(2, -1).some((p, i) => segmentBlocked(ps[i + 1], p, [obstacles[2]]))).toBe(
      false,
    );
  });
  it('24px窄间距不产生外绕或反向箭头', () => {
    const rs = [
      { id: 'a', x: 0, y: 0, width: 280, height: 110 },
      { id: 'b', x: 304, y: 0, width: 280, height: 160 },
    ];
    const ps = route({ x: 280, y: 55 }, { x: 304, y: 80 }, 'right', 'left', rs);
    expect(ps.every((p) => p.x >= 280 && p.x <= 304 && p.y >= 55 && p.y <= 80)).toBe(true);
    expect(ps.at(-2)!.x).toBeLessThan(304);
    expect(ps.at(-2)!.y).toBe(80);
    expect(ps[1].x).toBeGreaterThan(280);
    expect(ps[1].y).toBe(55);
  });
});
