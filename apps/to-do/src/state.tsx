import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { enablePatches, produceWithPatches, applyPatches, type Patch } from 'immer';
import {
  emptyWorkspace,
  normalize,
  isDone,
  mergeRestTracking,
  importWorkspace,
  type Workspace,
} from './model';
import { readWorkspace, saveWorkspace, replaceWorkspace, downloadWorkspace } from './storage';
enablePatches();
type Mutation = (draft: Workspace) => void;
type API = {
  w: Workspace;
  epoch: number;
  ready: boolean;
  readonly: boolean;
  status: string;
  error: string;
  commit: (fn: Mutation, history?: boolean, immediate?: boolean) => void;
  flush: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  replace: (w: Workspace) => Promise<void>;
  notify: (s: string) => void;
  notice: string;
  exportData: (auto?: boolean) => void;
};
const Context = createContext<API>(null!);
export const useWorkspace = () => useContext(Context);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [w, setW] = useState(emptyWorkspace),
    [epoch, setEpoch] = useState(0),
    [ready, setReady] = useState(false),
    [readonly, setReadonly] = useState(true),
    [status, setStatus] = useState('正在读取'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const current = useRef(w),
    isReadonly = useRef(true),
    pending = useRef(false),
    generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    queue = useRef(Promise.resolve()),
    channel = useRef<BroadcastChannel | null>(null);
  const history = useRef<{
    past: { p: Patch[]; i: Patch[] }[];
    future: { p: Patch[]; i: Patch[] }[];
  }>({ past: [], future: [] });
  const [, refresh] = useState(0);
  const notify = (s: string) => setNotice(s);
  const flush = async () => {
    clearTimeout(timer.current);
    if (!pending.current || isReadonly.current) return queue.current;
    const data = structuredClone(current.current),
      gen = generation.current;
    const job = queue.current
      .catch(() => {})
      .then(async () => {
        try {
          await saveWorkspace(data);
          if (gen === generation.current) {
            pending.current = false;
            setStatus('已保存');
            setError('');
          }
          channel.current?.postMessage('saved');
        } catch (e) {
          setStatus('保存失败');
          setError(String(e));
          throw e;
        }
      });
    queue.current = job;
    return job;
  };
  const schedule = (next: Workspace, immediate: boolean) => {
    current.current = next;
    setW(next);
    generation.current++;
    pending.current = true;
    setStatus('保存中');
    clearTimeout(timer.current);
    if (immediate) void flush().catch(() => {});
    else timer.current = setTimeout(() => void flush().catch(() => {}), 300);
  };
  const commit = (fn: Mutation, record = true, immediate = false) => {
    if (isReadonly.current) return;
    const doneBefore = new Set(
      current.current.groups.filter((g) => isDone(g, current.current)).map((g) => g.id),
    );
    const [next, p, i] = produceWithPatches(current.current, (d) => {
      fn(d);
      normalize(d, Date.now(), false);
      for (const g of d.groups)
        if (isDone(g, d) && !doneBefore.has(g.id)) g.completedAt = Date.now();
    });
    if (record) {
      history.current.past.push({ p, i });
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
    }
    schedule(next, immediate);
    refresh((n) => n + 1);
  };
  const travel = (redo: boolean) => {
    if (isReadonly.current) return;
    const h = history.current,
      item = (redo ? h.future : h.past).pop();
    if (!item) return;
    const [next, forward, backward] = produceWithPatches(current.current, (draft) =>
      applyPatches(draft, redo ? item.p : item.i),
    );
    // Derive the opposite operation from current data, preserving edits made since the command.
    (redo ? h.past : h.future).push(
      redo ? { p: forward, i: backward } : { p: backward, i: forward },
    );
    schedule(next, true);
    refresh((n) => n + 1);
    notify(redo ? '已重做' : '已撤销');
  };
  const replace = async (next: Workspace) => {
    if (isReadonly.current) throw Error('当前标签页为只读');
    await flush();
    await replaceWorkspace(next, current.current);
    current.current = next;
    setW(next);
    setEpoch((n) => n + 1);
    pending.current = false;
    history.current = { past: [], future: [] };
    setStatus('已保存');
    setError('');
    channel.current?.postMessage('saved');
    refresh((n) => n + 1);
  };
  const exportData = async (auto = false) => {
    let source;
    try {
      const response = await fetch('/api/rest/state', { signal: AbortSignal.timeout(2000) });
      if (response.ok) source = (await response.json()).tracking;
    } catch {
      /* Offline export retains the last saved statistics. */
    }
    const data = structuredClone(current.current);
    if (source) {
      try {
        const checked = importWorkspace({ ...data, restTracking: { [source.id]: source } });
        mergeRestTracking(data, checked.restTracking![source.id]);
        if (!isReadonly.current) commit((d) => mergeRestTracking(d, source), false);
      } catch {
        /* Invalid external statistics cannot invalidate a workspace export. */
      }
    }
    downloadWorkspace(data, auto);
    if (!auto && !isReadonly.current)
      commit(
        (d) => {
          d.lastBackup = Date.now();
        },
        false,
        true,
      );
    notify(auto ? '已触发每月备份下载，请在备份目录确认文件' : '已触发备份下载');
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    let alive = true,
      loadOK = false,
      release: () => void = () => {};
    const load = async () => {
      try {
        const data = await readWorkspace();
        if (alive) {
          current.current = data;
          setW(data);
          setStatus('已保存');
          loadOK = true;
        }
      } catch (e) {
        loadOK = false;
        if (alive) {
          setError('读取失败，原数据库未改动：' + String(e));
          setStatus('读取失败');
        }
      } finally {
        if (alive) setReady(true);
      }
    };
    channel.current = new BroadcastChannel('todo-v2');
    channel.current.onmessage = () => {
      if (isReadonly.current) void load();
    };
    if (!navigator.locks) {
      setError('当前浏览器不支持单编辑者锁，请使用 Chrome 或 Edge');
      setReady(true);
    } else
      void navigator.locks.request('todo-v2-editor', { ifAvailable: true }, async (lock) => {
        if (!alive) return;
        await load();
        if (!alive) return;
        isReadonly.current = !lock || !loadOK;
        setReadonly(!lock || !loadOK);
        if (lock)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
      });
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        void flushRef.current().catch(() => {});
        e.preventDefault();
      }
    };
    const blur = () => {
      void flushRef.current().catch(() => {});
    };
    window.addEventListener('beforeunload', before);
    window.addEventListener('blur', blur);
    return () => {
      alive = false;
      clearTimeout(timer.current);
      release();
      channel.current?.close();
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,[contenteditable=true]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        travel(e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        travel(true);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  return (
    <Context.Provider
      value={{
        w,
        epoch,
        ready,
        readonly,
        status,
        error,
        commit,
        flush,
        undo: () => travel(false),
        redo: () => travel(true),
        canUndo: history.current.past.length > 0,
        canRedo: history.current.future.length > 0,
        replace,
        notify,
        notice,
        exportData,
      }}
    >
      {children}
    </Context.Provider>
  );
}
