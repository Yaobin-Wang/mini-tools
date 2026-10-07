import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function windowBridge(root, profile = path.join(root, '.runtime/browser-profile')) {
  let child,
    pending,
    queue = Promise.resolve();
  function launch() {
    child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'scripts/rest-window.ps1'),
        '-Profile',
        profile,
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEMP: path.join(root, '.runtime/tmp'),
          TMP: path.join(root, '.runtime/tmp'),
        },
      },
    );
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (!pending) return;
      try {
        const result = JSON.parse(line);
        pending.resolve(result);
        pending = null;
      } catch {
        /* Ignore non-protocol output. */
      }
    });
    child.stderr.on('data', (data) => console.error('Rest window:', data.toString().trim()));
    const failed = () => {
      pending?.reject(new Error('Windows 窗口辅助组件已停止'));
      pending = null;
      child = null;
    };
    child.on('error', failed);
    child.on('exit', failed);
  }
  return {
    call(action) {
      const task = queue
        .catch(() => {})
        .then(
          () =>
            new Promise((resolve, reject) => {
              if (!child) launch();
              const timeout = setTimeout(() => {
                pending = null;
                child?.kill();
                reject(new Error('Windows 窗口辅助组件响应超时'));
              }, 15000);
              pending = {
                resolve: (value) => {
                  clearTimeout(timeout);
                  resolve(value);
                },
                reject: (e) => {
                  clearTimeout(timeout);
                  reject(e);
                },
              };
              child.stdin.write(JSON.stringify({ action }) + '\n', (e) => {
                if (e) pending?.reject(e);
              });
            }),
        );
      queue = task;
      return task;
    },
    async close() {
      try {
        await this.call('release');
      } finally {
        child?.stdin.end();
      }
    },
  };
}

export function createRestService({
  root,
  bridge = windowBridge(root),
  now = Date.now,
  stateFile = path.join(root, '.runtime/rest/state.json'),
}) {
  let selectedMinutes = 60;
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if ([30, 60, 90].includes(saved.selectedMinutes)) selectedMinutes = saved.selectedMinutes;
  } catch {
    /* First launch. */
  }
  let state = {
    status: 'idle',
    selectedMinutes,
    durationMs: selectedMinutes * 60000,
    remainingMs: 0,
    endsAt: null,
    roundId: null,
    attention: 'none',
    warning: '',
  };
  let busy = false,
    seenWindow = false,
    missingSince = null;
  const listeners = new Set();
  const snapshot = () => ({ ...state, serverNow: now() });
  const broadcast = () => {
    for (const listener of listeners) listener(snapshot());
  };
  function persist(next) {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile + '.tmp', JSON.stringify(next));
    fs.renameSync(stateFile + '.tmp', stateFile);
    state = next;
    broadcast();
  }
  // Never resume a timer merely because the local service restarted.
  persist(state);
  async function release() {
    try {
      const r = await bridge.call('release');
      if (!r.ok) throw Error(r.error);
      return '';
    } catch {
      return '窗口置顶状态恢复失败，请关闭应用窗口解除。';
    }
  }
  async function action(command, minutes) {
    if (busy) throw Error('提醒正在更新，请稍后重试');
    busy = true;
    try {
      const next = { ...state, warning: '' };
      if (command === 'start' || command === 'snooze') {
        if (command === 'start' && ![30, 60, 90].includes(minutes)) throw Error('不支持的提醒时长');
        if (command === 'snooze' && state.status !== 'pending') throw Error('当前没有待确认的提醒');
        const native = await bridge.call('probe');
        if (!native.ok || !native.count)
          throw Error('未找到专用 To-Do 窗口，请通过“启动 To-Do”入口使用。');
        seenWindow = true;
        missingSince = null;
        if (command === 'start') next.selectedMinutes = minutes;
        next.durationMs = (command === 'snooze' ? 10 : minutes) * 60000;
        Object.assign(next, {
          status: 'running',
          endsAt: now() + next.durationMs,
          remainingMs: next.durationMs,
          roundId: randomUUID(),
          attention: 'none',
        });
        next.warning = await release();
      } else if (command === 'pause' && state.status === 'running') {
        const remaining = Math.max(0, state.endsAt - now());
        Object.assign(next, {
          status: remaining ? 'paused' : 'pending',
          remainingMs: remaining,
          endsAt: null,
          attention: remaining ? 'none' : 'waiting',
        });
      } else if (command === 'resume' && state.status === 'paused') {
        Object.assign(next, { status: 'running', endsAt: now() + state.remainingMs });
      } else if (command === 'cancel' || (command === 'ack' && state.status === 'pending')) {
        Object.assign(next, {
          status: 'idle',
          endsAt: null,
          remainingMs: 0,
          attention: 'none',
          warning: await release(),
        });
      } else throw Error('当前状态不支持此操作');
      persist(next);
      return snapshot();
    } finally {
      busy = false;
    }
  }
  async function tick() {
    if (busy || state.status === 'idle') return;
    busy = true;
    try {
      const native = await bridge.call('probe');
      if (!native.ok) throw Error(native.error);
      if (!native.count) {
        if (!native.ready) return;
        missingSince ??= now();
        if (seenWindow && now() - missingSince >= 3000)
          persist({
            ...state,
            status: 'idle',
            endsAt: null,
            remainingMs: 0,
            attention: 'none',
            warning: await release(),
          });
        return;
      }
      seenWindow = true;
      missingSince = null;
      if (state.status === 'running' && now() >= state.endsAt)
        persist({
          ...state,
          status: 'pending',
          remainingMs: 0,
          endsAt: null,
          attention: 'waiting',
        });
      if (state.status === 'pending' && ['waiting', 'deferred'].includes(state.attention)) {
        if (!native.ready) {
          if (state.attention !== 'deferred') persist({ ...state, attention: 'deferred' });
          return;
        }
        const result = await bridge.call('raise');
        if (!result.ok || (result.ready && !result.verified))
          throw Error(result.error || '窗口显示检查失败');
        persist({ ...state, attention: result.ready ? 'shown' : 'deferred', warning: '' });
      }
    } catch (e) {
      // Count down even if native integration fails; do not claim native success.
      const expired = state.status === 'running' && now() >= state.endsAt;
      const warning = '窗口提醒不可用：' + e.message;
      if (state.warning !== warning || expired)
        persist({
          ...state,
          ...(expired ? { status: 'pending', remainingMs: 0, endsAt: null } : {}),
          attention: 'failed',
          warning,
        });
    } finally {
      busy = false;
    }
  }
  const interval = setInterval(() => {
    void tick().catch((e) => console.error('Rest state:', e));
  }, 1000);
  return {
    snapshot,
    action,
    tick,
    subscribe(fn) {
      listeners.add(fn);
      fn(snapshot());
      return () => listeners.delete(fn);
    },
    async close() {
      clearInterval(interval);
      await bridge.close();
    },
  };
}
