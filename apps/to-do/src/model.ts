import { marked, type Token } from 'marked';
export type Point = { x: number; y: number };
// Viewports store physical canvas scale; the UI expresses it relative to this baseline.
export const BOARD_ZOOM_BASE = 0.48;
export const BOARD_MIN_ZOOM = 0.24;
export const BOARD_MAX_ZOOM = 0.72;
export const boardZoomPercent = (zoom: number) => Math.round((zoom / BOARD_ZOOM_BASE) * 100);
export type Side = 'left' | 'right' | 'top' | 'bottom';
export type Task = {
  id: string;
  title: string;
  details: string;
  urgency: 'high' | 'medium' | 'low';
  dueDate: string;
  createdAt: number;
  completed: boolean;
  completedAt?: number;
};
export type Group = {
  id: string;
  name: string;
  autoName: boolean; // Legacy backup field; group names no longer follow task names.
  taskIds: string[];
  position: Point;
  size?: { width: number; height?: number };
  collapsed: boolean;
  hideCompleted: boolean;
  finalized?: boolean;
  completedAt?: number;
};
export type Link = {
  id: string;
  source: string;
  target: string;
  sourceHandle: Side;
  targetHandle: Side;
  label: string;
};
export type Region = {
  id: string;
  name: string;
  color: string;
  position: Point;
  width: number;
  height: number;
  groupIds: string[];
};
export type Entry = { content: string; updatedAt: number };
export type MonthlyEntry = Entry & {
  checklist: { text: string; answer: string; completed?: boolean }[];
};
export type Workspace = {
  schemaVersion: 2;
  revision: number;
  tasks: Record<string, Task>;
  groups: Group[];
  links: Link[];
  regions?: Region[];
  dailyEntries: Record<string, Entry>;
  monthlyEntries: Record<string, MonthlyEntry>;
  monthlyTemplate: string[];
  viewport: { x: number; y: number; zoom: number };
  settings: {
    darkMode: boolean;
    sidebarWidth: number;
    detailWidth?: number;
    sidebarCollapsed: boolean;
    bodySize: 16 | 18 | 20;
    autoBackup: boolean;
    lastAutoBackupMonth: string;
  };
  legacyArchive: Record<string, unknown>;
  lastBackup: number;
};
export const uid = () => crypto.randomUUID();
export const dayKey = (d = new Date()) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
export const monthKey = (d = new Date()) => dayKey(d).slice(0, 7);
export const template = '### DO\n- \n\n### UnDo\n- \n\n### Thinking\n- ';
export function emptyWorkspace(): Workspace {
  return {
    schemaVersion: 2,
    revision: 0,
    tasks: {},
    groups: [],
    links: [],
    dailyEntries: {},
    monthlyEntries: {},
    monthlyTemplate: ['本月最重要的成就', '本月最大的遗憾', '下个月的重心'],
    viewport: { x: 50, y: 50, zoom: BOARD_ZOOM_BASE },
    settings: {
      darkMode: false,
      sidebarWidth: 208,
      detailWidth: 560,
      sidebarCollapsed: false,
      bodySize: 18,
      autoBackup: false,
      lastAutoBackupMonth: '',
    },
    legacyArchive: {},
    lastBackup: 0,
  };
}
export function allTasksDone(g: Group, w: Workspace) {
  return g.taskIds.length > 0 && g.taskIds.every((id) => w.tasks[id]?.completed);
}
export function isDone(g: Group, w: Workspace) {
  return g.finalized === true && allTasksDone(g, w);
}
export function finalizeGroup(w: Workspace, id: string) {
  const g = w.groups.find((g) => g.id === id);
  if (g && allTasksDone(g, w)) g.finalized = true;
}
export function normalize(w: Workspace, now = Date.now(), stamp = true) {
  for (const region of w.regions ?? [])
    region.groupIds = region.groupIds.filter((id) => w.groups.some((g) => g.id === id));
  for (const g of w.groups) {
    if (!allTasksDone(g, w)) g.finalized = false;
    if (isDone(g, w)) {
      if (stamp && g.completedAt === undefined) g.completedAt = now;
    } else delete g.completedAt;
  }
  w.revision++;
}
export function constrainToRegion(
  w: Workspace,
  id: string,
  p: Point,
  width: number,
  height: number,
): Point {
  const r = w.regions?.find((r) => r.groupIds.includes(id));
  if (!r) return p;
  return {
    x: Math.max(r.position.x + 20, Math.min(p.x, r.position.x + r.width - width - 20)),
    y: Math.max(r.position.y + 104, Math.min(p.y, r.position.y + r.height - height - 20)),
  };
}
export function addGroup(w: Workspace, title: string, p: Point) {
  const id = uid(),
    gid = uid();
  w.tasks[id] = {
    id,
    title: title.trim(),
    details: '',
    urgency: 'medium',
    dueDate: '',
    createdAt: Date.now(),
    completed: false,
  };
  w.groups.push({
    id: gid,
    name: title.trim(),
    autoName: false,
    taskIds: [id],
    position: p,
    collapsed: false,
    hideCompleted: false,
    finalized: false,
  });
  const region = w.regions?.find(
    (r) =>
      p.x >= r.position.x &&
      p.x <= r.position.x + r.width &&
      p.y >= r.position.y &&
      p.y <= r.position.y + r.height,
  );
  if (region) {
    region.groupIds.push(gid);
    region.width = Math.max(region.width, 336);
    region.height = Math.max(region.height, 274);
    w.groups[w.groups.length - 1].position = constrainToRegion(w, gid, p, 296, 150);
  }
  return id;
}
export function addTask(w: Workspace, gid: string, title: string) {
  const id = uid();
  w.tasks[id] = {
    id,
    title: title.trim(),
    details: '',
    urgency: 'medium',
    dueDate: '',
    createdAt: Date.now(),
    completed: false,
  };
  const g = w.groups.find((g) => g.id === gid);
  if (!g) throw Error('任务组不存在');
  g.taskIds.push(id);
  g.collapsed = false;
  // Adding content releases a fixed height without discarding the user's width.
  // A later manual resize can set a fixed height again.
  if (g.size) delete g.size.height;
  return id;
}
export function toggleTask(w: Workspace, id: string) {
  const t = w.tasks[id];
  t.completed = !t.completed;
  if (t.completed) t.completedAt = Date.now();
  else delete t.completedAt;
}
export function moveTask(w: Workspace, id: string, to: string, index?: number) {
  const from = w.groups.find((g) => g.taskIds.includes(id)),
    target = w.groups.find((g) => g.id === to);
  if (!from || !target) return;
  from.taskIds = from.taskIds.filter((t) => t !== id);
  target.taskIds.splice(index === undefined ? target.taskIds.length : Math.max(0, index), 0, id);
  target.collapsed = false;
}
export function removeTask(w: Workspace, id: string) {
  for (const g of w.groups) g.taskIds = g.taskIds.filter((t) => t !== id);
  delete w.tasks[id];
}
export function removeGroup(w: Workspace, id: string) {
  const g = w.groups.find((g) => g.id === id);
  g?.taskIds.forEach((id) => delete w.tasks[id]);
  w.groups = w.groups.filter((g) => g.id !== id);
  w.links = w.links.filter((e) => e.source !== id && e.target !== id);
}
export function validConnection(w: Workspace, source: string, target: string, except?: string) {
  return (
    source !== target &&
    w.groups.some((g) => g.id === source) &&
    w.groups.some((g) => g.id === target) &&
    !w.links.some((e) => e.id !== except && e.source === source && e.target === target)
  );
}
function textTokens(tokens: Token[]): string {
  return tokens
    .map((t: Token): string => {
      if (t.type === 'image' || t.type === 'space' || t.type === 'hr' || t.type === 'html')
        return '';
      if (t.type === 'heading' && /^(DO|UnDo|Thinking)$/i.test(String(t.text).trim())) return '';
      if (t.type === 'code' || t.type === 'codespan') return String(t.text || '');
      if (t.type === 'list')
        return t.items.map((i: { tokens: Token[] }) => textTokens(i.tokens)).join(' ');
      if (t.type === 'table')
        return [...t.header, ...t.rows.flat()].map((c) => textTokens(c.tokens)).join(' ');
      if ('tokens' in t && Array.isArray(t.tokens)) return textTokens(t.tokens);
      return 'text' in t ? String(t.text) : '';
    })
    .join(' ');
}
export function contentLength(md: string): number {
  const text = textTokens(marked.lexer(md))
    .replace(/&(?:nbsp|#160);/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, 'x')
    .trim();
  if (!/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(text)) return 0;
  return Array.from(text.replace(/\s/g, '')).length;
}
export const level = (n: number) => (n === 0 ? 0 : n < 50 ? 1 : n < 200 ? 2 : n < 500 ? 3 : 4);
export function calendarMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  return {
    offset: (first.getDay() + 6) % 7,
    days: Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) =>
      dayKey(new Date(year, month, i + 1)),
    ),
  };
}
const obj = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => typeof x === 'string';
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
function validateReviews(raw: Record<string, any>) {
  for (const key of ['dailyEntries', 'monthlyEntries']) {
    assert(obj(raw[key]), key + ' 必须是对象');
    for (const [date, e] of Object.entries(raw[key])) {
      assert(obj(e) && str(e.content) && finite(e.updatedAt), date + ' 的复盘格式错误');
      const valid =
        key === 'dailyEntries'
          ? /^\d{4}-\d{2}-\d{2}$/.test(date) && dayKey(new Date(date + 'T12:00:00')) === date
          : /^\d{4}-(0[1-9]|1[0-2])$/.test(date);
      assert(valid, '日期无效：' + date);
      if (key === 'monthlyEntries')
        assert(
          Array.isArray(e.checklist) &&
            e.checklist.every(
              (i: any) => obj(i) && str(i.text) && (i.answer === undefined || str(i.answer)),
            ),
          '月度问题格式错误',
        );
    }
  }
  assert(Array.isArray(raw.monthlyTemplate) && raw.monthlyTemplate.every(str), '月度模板格式错误');
}
export function importWorkspace(raw: unknown): Workspace {
  assert(obj(raw), '备份必须是 JSON 对象');
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 2) throw Error('不支持的备份版本');
  if (raw.schemaVersion === 2) {
    const w = structuredClone(raw) as Workspace;
    assert(
      obj(w.tasks) && Array.isArray(w.groups) && Array.isArray(w.links),
      '任务、组或连线格式错误',
    );
    const groupIds = new Set<string>(),
      members = new Set<string>(),
      edgeIds = new Set<string>();
    for (const [id, t] of Object.entries(w.tasks))
      assert(
        obj(t) &&
          t.id === id &&
          str(t.title) &&
          str(t.details) &&
          ['high', 'medium', 'low'].includes(t.urgency) &&
          str(t.dueDate) &&
          (t.dueDate === '' ||
            (/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) &&
              dayKey(new Date(t.dueDate + 'T12:00:00')) === t.dueDate)) &&
          typeof t.completed === 'boolean' &&
          finite(t.createdAt) &&
          (t.completedAt === undefined || finite(t.completedAt)),
        '任务格式错误：' + id,
      );
    for (const g of w.groups) {
      assert(
        obj(g) &&
          str(g.id) &&
          !groupIds.has(g.id) &&
          str(g.name) &&
          typeof g.autoName === 'boolean' &&
          Array.isArray(g.taskIds) &&
          obj(g.position) &&
          finite(g.position.x) &&
          finite(g.position.y) &&
          typeof g.collapsed === 'boolean' &&
          typeof g.hideCompleted === 'boolean' &&
          (g.finalized === undefined || typeof g.finalized === 'boolean') &&
          (g.completedAt === undefined || finite(g.completedAt)),
        '任务组格式错误',
      );
      groupIds.add(g.id);
      assert(
        g.size === undefined ||
          (obj(g.size) &&
            finite(g.size.width) &&
            g.size.width >= 240 &&
            (g.size.height === undefined || (finite(g.size.height) && g.size.height >= 100))),
        '任务组尺寸无效',
      );
      for (const id of g.taskIds) {
        assert(str(id) && w.tasks[id] && !members.has(id), '任务归属丢失或重复');
        members.add(id);
      }
      // Preserve previously archived groups while making old pending groups explicit.
      g.finalized ??= allTasksDone(g, w);
    }
    assert(members.size === Object.keys(w.tasks).length, '存在未分组任务');
    assert(w.regions === undefined || Array.isArray(w.regions), '区域格式错误');
    const regionIds = new Set<string>(),
      regionMembers = new Set<string>();
    for (const r of w.regions ?? []) {
      assert(
        obj(r) &&
          str(r.id) &&
          !regionIds.has(r.id) &&
          !groupIds.has(r.id) &&
          str(r.name) &&
          str(r.color) &&
          /^#[0-9a-fA-F]{6}$/.test(r.color) &&
          obj(r.position) &&
          finite(r.position.x) &&
          finite(r.position.y) &&
          finite(r.width) &&
          r.width >= 180 &&
          finite(r.height) &&
          r.height >= 120 &&
          Array.isArray(r.groupIds),
        '区域格式错误',
      );
      regionIds.add(r.id);
      for (const id of r.groupIds) {
        assert(str(id) && groupIds.has(id) && !regionMembers.has(id), '区域任务组归属错误');
        regionMembers.add(id);
      }
    }
    const directions = new Set<string>();
    for (const e of w.links) {
      const pair = JSON.stringify([e.source, e.target]);
      assert(
        obj(e) &&
          str(e.id) &&
          !edgeIds.has(e.id) &&
          groupIds.has(e.source) &&
          groupIds.has(e.target) &&
          e.source !== e.target &&
          !directions.has(pair) &&
          str(e.label) &&
          ['left', 'right', 'top', 'bottom'].includes(e.sourceHandle) &&
          ['left', 'right', 'top', 'bottom'].includes(e.targetHandle),
        '连线格式错误',
      );
      directions.add(pair);
      edgeIds.add(e.id);
    }
    validateReviews(w);
    assert(
      obj(w.settings) &&
        typeof w.settings.darkMode === 'boolean' &&
        typeof w.settings.sidebarCollapsed === 'boolean' &&
        finite(w.settings.sidebarWidth) &&
        w.settings.sidebarWidth >= 176 &&
        w.settings.sidebarWidth <= 260 &&
        (w.settings.detailWidth === undefined ||
          (finite(w.settings.detailWidth) &&
            w.settings.detailWidth >= 360 &&
            w.settings.detailWidth <= 960)) &&
        [16, 18, 20].includes(w.settings.bodySize) &&
        typeof w.settings.autoBackup === 'boolean' &&
        str(w.settings.lastAutoBackupMonth),
      '设置格式错误',
    );
    assert(
      obj(w.viewport) &&
        finite(w.viewport.x) &&
        finite(w.viewport.y) &&
        finite(w.viewport.zoom) &&
        w.viewport.zoom >= BOARD_MIN_ZOOM &&
        w.viewport.zoom <= 1.5,
      '画布视口格式错误',
    );
    assert(obj(w.legacyArchive) && finite(w.revision) && finite(w.lastBackup), '版本信息格式错误');
    // Accept old backups up to physical 1.5, then constrain them to the new 150% limit.
    w.viewport.zoom = Math.min(BOARD_MAX_ZOOM, w.viewport.zoom);
    return w;
  }
  assert(Array.isArray(raw.todos), '不是有效的旧版待办备份');
  validateReviews(raw);
  const w = emptyWorkspace();
  w.dailyEntries = structuredClone(raw.dailyEntries);
  w.monthlyEntries = structuredClone(raw.monthlyEntries);
  w.monthlyTemplate = [...raw.monthlyTemplate];
  for (const e of Object.values(w.monthlyEntries))
    e.checklist = e.checklist.map((i) => ({ ...i, answer: i.answer || '' }));
  raw.todos.forEach((t: any, i: number) => {
    assert(
      obj(t) &&
        str(t.id) &&
        !Object.hasOwn(w.tasks, t.id) &&
        str(t.text) &&
        typeof t.completed === 'boolean' &&
        finite(t.createdAt) &&
        ['high', 'medium', 'low'].includes(t.urgency),
      '旧待办格式错误或 ID 重复',
    );
    assert(t.details === undefined || str(t.details), '旧待办正文格式错误');
    assert(t.completedAt === undefined || finite(t.completedAt), '旧待办完成时间格式错误');
    w.tasks[t.id] = {
      id: t.id,
      title: t.text,
      details: t.details || '',
      urgency: t.urgency,
      dueDate: t.dueDate || '',
      completed: t.completed,
      createdAt: t.createdAt,
      ...(t.completedAt ? { completedAt: t.completedAt } : {}),
    };
    w.groups.push({
      id: uid(),
      name: t.text,
      autoName: false,
      taskIds: [t.id],
      position: { x: (i % 3) * 344, y: Math.floor(i / 3) * 184 },
      collapsed: false,
      hideCompleted: false,
      finalized: t.completed,
      ...(t.completed && t.completedAt ? { completedAt: t.completedAt } : {}),
    });
  });
  const { todos, dailyEntries, monthlyEntries, monthlyTemplate, ...rest } = raw;
  w.legacyArchive = {
    originalExtras: structuredClone(rest),
    originalDailyEntries: structuredClone(dailyEntries),
  };
  if (obj(raw.settings)) {
    w.settings.darkMode = raw.settings.darkMode === true;
    w.settings.autoBackup = raw.settings.autoBackup === true;
    w.settings.lastAutoBackupMonth = str(raw.settings.lastAutoBackupMonth)
      ? raw.settings.lastAutoBackupMonth
      : '';
  }
  w.lastBackup = finite(raw.lastBackup) ? raw.lastBackup : 0;
  return importWorkspace(w);
}
export function summary(w: Workspace) {
  return (
    Object.keys(w.tasks).length +
    ' 条任务 · ' +
    w.groups.length +
    ' 个组 · ' +
    Object.keys(w.dailyEntries).length +
    ' 天复盘 · ' +
    Object.keys(w.monthlyEntries).length +
    ' 个月度记录'
  );
}
