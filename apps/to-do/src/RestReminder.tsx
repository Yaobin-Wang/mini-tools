import { useEffect, useRef, useState } from 'react';
import { Coffee, Pause, Play, Square } from 'lucide-react';
import { Modal } from './ui';
import type { RestTracking } from './model';

type RestState = {
  status: 'idle' | 'running' | 'paused' | 'pending';
  selectedMinutes: number;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  serverNow: number;
  attention: 'none' | 'waiting' | 'deferred' | 'shown' | 'failed';
  warning: string;
  tracking?: RestTracking;
};
export function formatRestTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function useRestReminder(readonly: boolean) {
  const [state, setState] = useState<RestState | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const token = useRef(''),
    offset = useRef(0);
  function receive(next: RestState) {
    offset.current = next.serverNow - Date.now();
    setState(next);
    setClock(Date.now());
  }
  useEffect(() => {
    let disposed = false,
      source: EventSource | null = null;
    const controller = new AbortController();
    async function connect() {
      try {
        const response = await fetch('/api/rest/session', {
          headers: { 'X-ToDo-Client': 'rest-v1' },
          signal: controller.signal,
        });
        if (response.status === 404 || response.status === 405)
          throw Error('本地服务需要更新：请关闭应用，再双击“启动 To-Do”。');
        if (!response.ok) throw Error('休息提醒服务暂不可用，请重新启动应用。');
        const data = await response.json();
        if (disposed) return;
        token.current = data.token;
        receive(data.state);
        source = new EventSource('/api/rest/events');
        source.onopen = () => {
          setConnected(true);
          setError('');
        };
        source.onmessage = (event) => {
          receive(JSON.parse(event.data));
          setConnected(true);
          setError('');
        };
        source.onerror = () => {
          setConnected(false);
          setError('与提醒服务的连接已断开；若服务已重启，请刷新页面。');
        };
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    }
    void connect();
    const interval = setInterval(() => setClock(Date.now()), 250);
    return () => {
      disposed = true;
      controller.abort();
      source?.close();
      clearInterval(interval);
    };
  }, []);
  const remaining =
    state?.status === 'running'
      ? Math.max(0, (state.endsAt ?? 0) - clock - offset.current)
      : (state?.remainingMs ?? 0);
  const active = state !== null && state.status !== 'idle';
  const label =
    state?.status === 'pending'
      ? '到时间了'
      : state?.status === 'paused'
        ? `已暂停 ${formatRestTime(remaining)}`
        : active
          ? formatRestTime(remaining)
          : '';
  async function action(action: string, minutes?: number) {
    if (readonly || busy || !connected) return;
    setBusy(true);
    try {
      const response = await fetch('/api/rest/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ToDo-Token': token.current },
        body: JSON.stringify({ action, minutes }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '提醒操作失败');
      receive(result);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    state,
    remaining,
    active,
    label,
    error,
    action,
    disabled: readonly || busy || !connected,
    readonly,
  };
}
type Reminder = ReturnType<typeof useRestReminder>;
export function RestReminderPage({ reminder: r }: { reminder: Reminder }) {
  const idle = !r.state || r.state.status === 'idle';
  const display = idle ? (r.state?.selectedMinutes ?? 60) * 60000 : r.remaining;
  const progress = idle ? 1 : Math.min(1, display / (r.state?.durationMs || 1));
  return (
    <section className="rest-page">
      <header className="rest-heading">
        <span>A MOMENT TO BREATHE</span>
        <h1>
          休息提醒 <i />
        </h1>
        <p>适时停一停，让思绪和身体都舒展一下。</p>
      </header>
      <div className="rest-card">
        <Coffee size={26} strokeWidth={1.4} />
        <div className="rest-clock" aria-label={`剩余 ${formatRestTime(display)}`}>
          <svg viewBox="0 0 280 280" aria-hidden="true">
            <circle className="rest-track" cx="140" cy="140" r="130" />
            <circle
              className="rest-progress"
              cx="140"
              cy="140"
              r="130"
              pathLength="1"
              strokeDasharray={`${progress} 1`}
            />
          </svg>
          <div>
            <strong>{formatRestTime(display)}</strong>
            <span>
              {idle
                ? '留一点时间给自己'
                : r.state?.status === 'paused'
                  ? '已暂停'
                  : r.state?.status === 'pending'
                    ? '该休息一下了'
                    : '距离下一次休息'}
            </span>
          </div>
        </div>
        <div className="rest-presets">
          {[90, 60, 30].map((minutes) => (
            <button
              key={minutes}
              disabled={r.disabled}
              className={r.state?.selectedMinutes === minutes ? 'chosen' : ''}
              onClick={() => void r.action('start', minutes)}
            >
              {minutes}
              <small>分钟</small>
            </button>
          ))}
        </div>
        <div className="rest-actions">
          {r.state?.status === 'running' && (
            <button disabled={r.disabled} onClick={() => void r.action('pause')}>
              <Pause size={17} />
              暂停
            </button>
          )}
          {r.state?.status === 'paused' && (
            <button disabled={r.disabled} onClick={() => void r.action('resume')}>
              <Play size={17} />
              继续
            </button>
          )}
          {r.active && (
            <button disabled={r.disabled} onClick={() => void r.action('cancel')}>
              <Square size={15} />
              结束
            </button>
          )}
          {idle && <span>选择时长即开始 · 到时提醒一次</span>}
        </div>
        {r.readonly && <p className="rest-help">此窗口只读，请在编辑窗口操作提醒。</p>}
        {(r.error || r.state?.warning) && (
          <p className="rest-error" role="alert">
            {r.error || r.state?.warning}
          </p>
        )}
      </div>
      <p className="rest-footnote">可以回到其他页面，提醒会继续计时。</p>
    </section>
  );
}
export function RestReminderAlert({ reminder: r }: { reminder: Reminder }) {
  if (r.state?.status !== 'pending' || !['shown', 'failed'].includes(r.state.attention))
    return null;
  return (
    <Modal
      title="该休息一下了"
      onClose={() => {
        if (!r.disabled) void r.action('ack');
      }}
    >
      <div className="rest-alert">
        <Coffee size={38} strokeWidth={1.4} />
        <p>暂时离开屏幕，起身活动一下。</p>
        {r.readonly && <p className="rest-help">此窗口只读，请在编辑窗口确认提醒。</p>}
        {(r.error || r.state.warning) && (
          <p className="rest-error" role="alert">
            {r.error || r.state.warning}
          </p>
        )}
        <div className="rest-actions">
          <button disabled={r.disabled} onClick={() => void r.action('snooze')}>
            10 分钟后再提醒
          </button>
          <button
            className="rest-primary"
            disabled={r.disabled}
            onClick={() => void r.action('ack')}
          >
            知道了
          </button>
        </div>
      </div>
    </Modal>
  );
}
