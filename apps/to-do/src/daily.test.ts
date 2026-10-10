import { describe, it, expect } from 'vitest';
import {
  dailyContent,
  template,
  contentLength,
  emptyWorkspace,
  importWorkspace,
  mergeRestTracking,
  restTimeForDate,
  dayKey,
} from './model';

describe('每日目标与提醒统计', () => {
  it('默认空白，移除未填写模板，旧正文保持', () => {
    expect(dailyContent()).toBe('');
    expect(dailyContent({ content: template, updatedAt: 0 })).toBe('');
    expect(dailyContent({ content: template + '\n今天的记录', updatedAt: 1 })).toBe(template + '\n今天的记录');
    expect(contentLength(template)).toBe(0);
    expect(dailyContent({ content: '', updatedAt: 0, contentInitialized: true })).toBe('');
    expect(dailyContent({ content: '已有复盘', updatedAt: 1 })).toBe('已有复盘');
  });
  it('目标、清空标记、统计随备份往返，旧备份无需新增字段', () => {
    const w = emptyWorkspace();
    expect(importWorkspace(w).restTracking).toBeUndefined();
    w.dailyEntries['2026-10-01'] = {
      content: '',
      contentInitialized: true,
      updatedAt: 1,
      goals: [{ id: 'goal-1', title: '示例目标', completed: true, createdAt: 1, completedAt: 2 }],
    };
    mergeRestTracking(w, { id: 'source-1', startedAt: 1, days: { '2026-10-01': 60000 } });
    expect(importWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
    const invalid = structuredClone(w);
    invalid.dailyEntries['2026-10-01'].goals![0].title = ' ';
    expect(() => importWorkspace(invalid)).toThrow();
  });
  it('重复同步或导入不会重复累计，不同来源可合并；未知历史显示空值', () => {
    const w = emptyWorkspace(),
      date = dayKey();
    const source = { id: 'source-1', startedAt: Date.now(), days: { [date]: 120000 } };
    mergeRestTracking(w, source);
    mergeRestTracking(w, source);
    mergeRestTracking(w, { ...source, days: { [date]: 60000 } });
    expect(restTimeForDate(w, date)).toBe(120000);
    mergeRestTracking(w, { ...source, id: 'source-2', days: { [date]: 60000 } });
    expect(restTimeForDate(w, date)).toBe(180000);
    expect(restTimeForDate(w, '2000-01-01')).toBeNull();
  });
});
