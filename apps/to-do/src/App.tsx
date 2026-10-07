import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  Coffee,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  ArrowUpRight,
  X,
  Trash2,
  Download,
  Upload,
  Check,
  AlertCircle,
  LockKeyhole,
  Sprout,
  FolderOpen,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useWorkspace, WorkspaceProvider } from './state';
import { TodoBoard } from './Board';
import { Daily, Monthly } from './Reviews';
import { IconButton, MarkdownEditor, Modal, Confirm } from './ui';
import {
  moveTask,
  removeTask,
  toggleTask,
  importWorkspace,
  summary,
  monthKey,
  isDone,
  type Workspace,
} from './model';
import { snapshots } from './storage';
import { useRestReminder, RestReminderPage, RestReminderAlert } from './RestReminder';
function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { w, commit, readonly, flush } = useWorkspace(),
    t = w.tasks[id],
    g = w.groups.find((g) => g.taskIds.includes(id)),
    [confirm, setConfirm] = useState(false),
    [title, setTitle] = useState(t?.title || '');
  const panel = useRef<HTMLElement>(null);
  const outsideGesture = useRef<{
    x: number;
    y: number;
    startedOutside: boolean;
    endedOutside: boolean;
    moved: boolean;
  } | null>(null);
  const [availableWidth, setAvailableWidth] = useState(window.innerWidth);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const resizeSession = useRef<{ x: number; width: number; latest: number } | null>(null);
  const maxWidth = Math.max(360, Math.min(960, availableWidth - 320));
  const clampWidth = (value: number) => Math.max(360, Math.min(maxWidth, value));
  const detailWidth = clampWidth(liveWidth ?? w.settings.detailWidth ?? 560);
  useLayoutEffect(() => {
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const measure = () => setAvailableWidth(parent.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const storeWidth = (value: number) => {
    if (!readonly)
      commit(
        (d) => {
          d.settings.detailWidth = value;
        },
        false,
        true,
      );
  };
  const closeDetail = () => {
    const name = title.trim();
    if (!readonly && t && name && name !== t.title)
      commit(
        (d) => {
          if (d.tasks[id]) d.tasks[id].title = name;
        },
        false,
        true,
      );
    void flush().catch(() => {});
    onClose();
  };
  useEffect(() => {
    setTitle(t?.title || '');
  }, [id, t?.title]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && resizeSession.current) {
        resizeSession.current = null;
        setLiveWidth(null);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) closeDetail();
    };
    const pointerDown = (e: PointerEvent) => {
      outsideGesture.current = {
        x: e.clientX,
        y: e.clientY,
        startedOutside:
          e.button === 0 &&
          e.target instanceof Node &&
          !panel.current?.contains(e.target) &&
          !document.querySelector('[role=dialog]'),
        endedOutside: false,
        moved: false,
      };
    };
    const pointerMove = (e: PointerEvent) => {
      const gesture = outsideGesture.current;
      if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 5)
        gesture.moved = true;
    };
    const pointerUp = (e: PointerEvent) => {
      pointerMove(e);
      if (outsideGesture.current)
        outsideGesture.current.endedOutside =
          e.target instanceof Node && !panel.current?.contains(e.target);
    };
    const pointerCancel = () => {
      outsideGesture.current = null;
    };
    const outside = (e: MouseEvent) => {
      const gesture = outsideGesture.current;
      outsideGesture.current = null;
      // Wait for a completed click, rather than resizing the canvas under pointerdown.
      // Capture runs before another task's click, allowing it to open its own detail.
      if (
        e.button !== 0 ||
        (e.detail > 0 && (!gesture?.startedOutside || !gesture.endedOutside || gesture.moved)) ||
        resizeSession.current ||
        document.querySelector('[role=dialog]') ||
        !(e.target instanceof Node) ||
        panel.current?.contains(e.target)
      )
        return;
      closeDetail();
    };
    window.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointermove', pointerMove, true);
    document.addEventListener('pointerup', pointerUp, true);
    document.addEventListener('pointercancel', pointerCancel, true);
    document.addEventListener('click', outside, true);
    return () => {
      window.removeEventListener('keydown', esc);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerCancel, true);
      document.removeEventListener('click', outside, true);
    };
  }, [id, title, t?.title, readonly, commit, flush, onClose]);
  if (!t || !g) return null;
  const saveTitle = () => {
    if (title.trim())
      commit(
        (d) => {
          d.tasks[id].title = title.trim();
        },
        false,
        true,
      );
    else setTitle(t.title);
  };
  return (
    <aside
      ref={panel}
      className={'detail-panel' + (liveWidth !== null ? ' is-resizing' : '')}
      style={{ width: detailWidth }}
      aria-label="任务详情"
    >
      <div
        className="detail-resize-handle"
        role="separator"
        aria-label="调整详情宽度"
        aria-orientation="vertical"
        aria-valuemin={360}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(detailWidth)}
        aria-disabled={readonly}
        tabIndex={readonly ? -1 : 0}
        title="拖动调整详情宽度 · 双击恢复默认 · 左右方向键微调"
        onPointerDown={(e) => {
          if (readonly || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          resizeSession.current = { x: e.clientX, width: detailWidth, latest: detailWidth };
          setLiveWidth(detailWidth);
        }}
        onPointerMove={(e) => {
          const session = resizeSession.current;
          if (!session) return;
          session.latest = clampWidth(session.width + session.x - e.clientX);
          setLiveWidth(session.latest);
        }}
        onPointerUp={(e) => {
          const session = resizeSession.current;
          if (!session) return;
          const value = clampWidth(session.width + session.x - e.clientX);
          resizeSession.current = null;
          storeWidth(value);
          setLiveWidth(null);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          resizeSession.current = null;
          setLiveWidth(null);
        }}
        onLostPointerCapture={() => {
          resizeSession.current = null;
          setLiveWidth(null);
        }}
        onDoubleClick={() => {
          if (!readonly) storeWidth(560);
        }}
        onKeyDown={(e) => {
          if (readonly) return;
          const step = e.shiftKey ? 40 : 10;
          const value =
            e.key === 'ArrowLeft'
              ? detailWidth + step
              : e.key === 'ArrowRight'
                ? detailWidth - step
                : e.key === 'Home'
                  ? 360
                  : e.key === 'End'
                    ? maxWidth
                    : null;
          if (value !== null) {
            e.preventDefault();
            e.stopPropagation();
            storeWidth(clampWidth(value));
          }
        }}
      />
      <header>
        <div>
          <span className="eyebrow">TASK DETAILS</span>
          <span className="detail-group-name">{g.name}</span>
        </div>
        <IconButton label="关闭详情" onClick={closeDetail}>
          <X />
        </IconButton>
      </header>
      <div className="detail-content">
        <label className="detail-title-label">
          <span className="sr-only">任务标题</span>
          <textarea
            aria-label="任务标题"
            value={title}
            disabled={readonly}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
          />
        </label>
        <button
          className={'button ' + (t.completed ? 'secondary' : 'primary')}
          disabled={readonly}
          onClick={() => commit((d) => toggleTask(d, id), true, true)}
        >
          <Check size={16} />
          {t.completed ? '已完成 · 点击恢复' : '标记完成'}
        </button>
        <div className="detail-fields">
          <label>
            所属组
            <select
              aria-label="任务所属组"
              disabled={readonly}
              value={g.id}
              onChange={(e) => commit((d) => moveTask(d, id, e.target.value), true, true)}
            >
              {w.groups.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            截止日期
            <input
              type="date"
              aria-label="截止日期"
              disabled={readonly}
              value={t.dueDate}
              onChange={(e) =>
                commit(
                  (d) => {
                    d.tasks[id].dueDate = e.target.value;
                  },
                  false,
                  true,
                )
              }
            />
          </label>
          <label>
            紧急程度
            <select
              aria-label="紧急程度"
              disabled={readonly}
              value={t.urgency}
              onChange={(e) =>
                commit(
                  (d) => {
                    d.tasks[id].urgency = e.target.value as typeof t.urgency;
                  },
                  false,
                  true,
                )
              }
            >
              <option value="high">紧急</option>
              <option value="medium">适中</option>
              <option value="low">暂缓</option>
            </select>
          </label>
        </div>
        <MarkdownEditor
          key={id}
          label="详细备注"
          value={t.details}
          onChange={(s) =>
            commit((d) => {
              d.tasks[id].details = s;
            }, false)
          }
          minHeight={280}
        />
        <div className="detail-timestamps">
          <p>创建于 {new Date(t.createdAt).toLocaleString('zh-CN')}</p>
          {t.completed && (
            <p>完成于 {t.completedAt ? new Date(t.completedAt).toLocaleString('zh-CN') : '未知'}</p>
          )}
        </div>
      </div>
      <footer>
        <button
          className="button danger ghost"
          disabled={readonly}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={15} />
          删除任务
        </button>
      </footer>
      {confirm && (
        <Confirm
          title="删除任务"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            commit((d) => removeTask(d, id), true, true);
            onClose();
          }}
        >
          删除“{t.title}”？删除后可以撤销恢复。
        </Confirm>
      )}
    </aside>
  );
}
function DataSettings({ onClose }: { onClose: () => void }) {
  const { w, readonly, commit, replace, notify, exportData, flush } = useWorkspace(),
    [candidate, setCandidate] = useState<Workspace | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<{ at: number; data: Workspace }[] | null>(null),
    input = useRef<HTMLInputElement>(null);
  const inspect = async (file: File) => {
    setError('');
    try {
      setCandidate(importWorkspace(JSON.parse(await file.text())));
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <Modal title="数据与显示" onClose={onClose} wide>
      <div className="settings-grid">
        <section>
          <h3>
            <FolderOpen size={17} />
            本地数据
          </h3>
          <p className="muted">{summary(w)}</p>
          <p className="muted">
            通过专用快捷方式使用时，数据和浏览器配置保存在 D 盘。备份可在旧版和新版之间迁移导入。
          </p>
          <div className="settings-buttons">
            <button className="button primary" onClick={() => exportData()}>
              <Download size={16} />
              导出完整备份
            </button>
            <button
              className="button secondary"
              disabled={readonly}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              导入 JSON
            </button>
          </div>
          <input
            type="file"
            accept=".json,application/json"
            ref={input}
            className="sr-only"
            aria-label="导入备份文件"
            onChange={(e) => {
              if (e.target.files?.[0]) void inspect(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <label className="switch-field">
            <span>
              <strong>每月自动下载备份</strong>
              <small>每月首次使用时触发，请确认备份文件已落盘。</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="每月自动下载备份"
              checked={w.settings.autoBackup}
              disabled={readonly}
              onChange={(e) =>
                commit(
                  (d) => {
                    d.settings.autoBackup = e.target.checked;
                  },
                  false,
                  true,
                )
              }
            />
          </label>
          <button
            className="button ghost"
            disabled={readonly}
            onClick={() => {
              void snapshots()
                .then(setHistory)
                .catch((e) => setError(String(e)));
            }}
          >
            <RotateCcw size={15} />
            查看导入前的恢复快照
          </button>
          <p className="tiny muted">旧版专注、目标与习惯记录保存在备份的历史归档中。</p>
        </section>
        <section>
          <h3>
            <Settings2 size={17} />
            阅读与外观
          </h3>
          <label className="field">
            正文字号
            <select
              aria-label="正文字号"
              disabled={readonly}
              value={w.settings.bodySize}
              onChange={(e) =>
                commit(
                  (d) => {
                    d.settings.bodySize = Number(e.target.value) as 16 | 18 | 20;
                  },
                  false,
                  true,
                )
              }
            >
              <option value={16}>小 · 16 px</option>
              <option value={18}>标准 · 18 px</option>
              <option value={20}>大 · 20 px</option>
            </select>
          </label>
          <label className="switch-field">
            <span>深色模式</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="深色模式"
              checked={w.settings.darkMode}
              disabled={readonly}
              onChange={(e) =>
                commit(
                  (d) => {
                    d.settings.darkMode = e.target.checked;
                  },
                  false,
                  true,
                )
              }
            />
          </label>
          <div className="font-specimen">
            <span>霞鹜文楷</span>
            <p>把日子写成自己的样子。</p>
            <small>标题与正文 · 屏幕阅读版</small>
          </div>
        </section>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {candidate && (
        <div className="import-review">
          <h3>确认导入</h3>
          <p>{summary(candidate)}</p>
          <p>将替换当前数据，并自动保存一份可恢复的快照。</p>
          <div className="settings-buttons">
            <button className="button secondary" disabled={busy} onClick={() => setCandidate(null)}>
              取消
            </button>
            <button
              className="button primary"
              disabled={readonly || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await replace(candidate);
                  setCandidate(null);
                  notify('导入完成，原数据已保存为恢复快照');
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? '正在导入…' : '确认替换'}
            </button>
          </div>
        </div>
      )}
      {history && (
        <div className="snapshot-list">
          <h3>恢复快照</h3>
          {history.length ? (
            history.map((s, i) => (
              <div key={i}>
                <span>
                  {new Date(s.at).toLocaleString('zh-CN')}
                  <small>{summary(s.data)}</small>
                </span>
                <button
                  className="button secondary"
                  onClick={() => {
                    setCandidate(importWorkspace(s.data));
                    setHistory(null);
                  }}
                >
                  选择恢复
                </button>
              </div>
            ))
          ) : (
            <p className="muted">尚未发生数据替换。</p>
          )}
        </div>
      )}
      <footer>
        <button
          className="button secondary"
          onClick={() => {
            void flush().catch(() => {});
            onClose();
          }}
        >
          关闭
        </button>
      </footer>
    </Modal>
  );
}
function App() {
  const {
    w,
    epoch,
    ready,
    readonly,
    status,
    error,
    commit,
    flush,
    notice,
    notify,
    undo,
    canUndo,
    exportData,
  } = useWorkspace();
  const reminder = useRestReminder(readonly);
  const [page, setPage] = useState<'todo' | 'daily' | 'monthly' | 'rest'>('todo'),
    [detail, setDetail] = useState<string | null>(null),
    [settings, setSettings] = useState(false),
    [sidebar, setSidebar] = useState<number | null>(null);
  const automatic = useRef(''),
    width = w.settings.sidebarCollapsed ? 64 : (sidebar ?? w.settings.sidebarWidth);
  useEffect(() => {
    document.documentElement.dataset.theme = w.settings.darkMode ? 'dark' : 'light';
    document.documentElement.style.setProperty('--body-size', w.settings.bodySize + 'px');
  }, [w.settings.darkMode, w.settings.bodySize]);
  useEffect(() => {
    if (!ready || readonly || !w.settings.autoBackup || error) return;
    const m = monthKey();
    if (w.settings.lastAutoBackupMonth === m || automatic.current === m) return;
    const timer = setTimeout(() => {
      automatic.current = m;
      exportData(true);
      commit(
        (d) => {
          d.settings.lastAutoBackupMonth = m;
        },
        false,
        true,
      );
    }, 2500);
    return () => clearTimeout(timer);
  }, [ready, readonly, w.settings.autoBackup, w.settings.lastAutoBackupMonth, error]);
  const navigate = (p: typeof page) => {
    void flush().catch(() => {});
    setDetail(null);
    setPage(p);
  };
  if (!ready)
    return (
      <div className="boot-screen">
        <div className="brand-mark">
          <Check />
        </div>
        <h1>To-Do</h1>
        <p>正在打开你的工作空间…</p>
      </div>
    );
  const resize = (e: React.PointerEvent) => {
    if (readonly || w.settings.sidebarCollapsed) return;
    const start = e.clientX,
      initial = w.settings.sidebarWidth;
    let latest = initial;
    const move = (ev: PointerEvent) => {
      latest = Math.min(260, Math.max(176, initial + ev.clientX - start));
      setSidebar(latest);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      commit(
        (d) => {
          d.settings.sidebarWidth = latest;
        },
        false,
        true,
      );
      setSidebar(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };
  return (
    <div className="app-shell" style={{ '--sidebar-width': width + 'px' } as React.CSSProperties}>
      <aside className={'sidebar ' + (w.settings.sidebarCollapsed ? 'collapsed' : '')}>
        <div className="brand">
          <div className="brand-mark">
            <Check size={24} />
          </div>
          {!w.settings.sidebarCollapsed && (
            <div>
              <strong>To-Do</strong>
              <span>日有所进</span>
            </div>
          )}
        </div>
        <div className="nav-section-label">{!w.settings.sidebarCollapsed ? '我的空间' : '·'}</div>
        <nav>
          {(
            [
              { id: 'todo', label: '待办事项', icon: LayoutDashboard },
              { id: 'daily', label: '每日复盘', icon: CalendarDays },
              { id: 'monthly', label: '每月总结', icon: BookOpen },
              { id: 'rest', label: '休息提醒', icon: Coffee },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={'nav-item ' + (page === item.id ? 'active' : '')}
              title={
                item.id === 'rest' && reminder.label
                  ? `${item.label} · ${reminder.label}`
                  : item.label
              }
              aria-label={item.label}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              {!w.settings.sidebarCollapsed && (
                <>
                  <span>{item.label}</span>
                  {item.id === 'rest' && reminder.active ? (
                    <small className="rest-nav-time">{reminder.label}</small>
                  ) : (
                    page === item.id && <i />
                  )}
                </>
              )}
              {item.id === 'rest' && reminder.active && w.settings.sidebarCollapsed && (
                <i className="rest-nav-dot" />
              )}
            </button>
          ))}
        </nav>
        {!w.settings.sidebarCollapsed && (
          <div className="sidebar-note">
            <Sprout size={24} />
            <p>
              有条理地生活，
              <br />
              慢慢地向前。
            </p>
            <span>ONE THING AT A TIME</span>
          </div>
        )}
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            aria-label="切换主题"
            title="切换主题"
            disabled={readonly}
            onClick={() =>
              commit(
                (d) => {
                  d.settings.darkMode = !d.settings.darkMode;
                },
                false,
                true,
              )
            }
          >
            {w.settings.darkMode ? <Sun size={19} /> : <Moon size={19} />}
            {!w.settings.sidebarCollapsed && (
              <span>{w.settings.darkMode ? '浅色模式' : '深色模式'}</span>
            )}
          </button>
          <button
            className="nav-item"
            aria-label="数据与显示"
            title="数据与显示"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={19} />
            {!w.settings.sidebarCollapsed && <span>数据与显示</span>}
          </button>
          <div className="sidebar-footer">
            {!w.settings.sidebarCollapsed && (
              <span className={'save-status ' + (error ? 'failed' : '')}>
                <i />
                {readonly ? '只读模式' : status}
              </span>
            )}
            <IconButton
              label={w.settings.sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
              disabled={readonly}
              onClick={() =>
                commit(
                  (d) => {
                    d.settings.sidebarCollapsed = !d.settings.sidebarCollapsed;
                  },
                  false,
                  true,
                )
              }
            >
              {w.settings.sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </IconButton>
          </div>
        </div>
        <div className="sidebar-resize" onPointerDown={resize} />
      </aside>
      <main className="main-content">
        {readonly && (
          <div className="readonly-banner">
            <LockKeyhole size={15} />
            另一个标签页正在编辑，此页只读。关闭编辑页后可刷新接管。
            <button onClick={() => location.reload()}>刷新</button>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => void flush().catch(() => {})}>重试保存</button>
            <button onClick={() => exportData()}>导出备份</button>
          </div>
        )}
        <div className={'page-and-detail ' + (detail && w.tasks[detail] ? 'has-detail' : '')}>
          <div className="page-slot">
            {page === 'todo' ? (
              <TodoBoard key={epoch} openTask={setDetail} />
            ) : page === 'daily' ? (
              <Daily />
            ) : page === 'monthly' ? (
              <Monthly />
            ) : (
              <RestReminderPage reminder={reminder} />
            )}
          </div>
          {detail && w.tasks[detail] && <Detail id={detail} onClose={() => setDetail(null)} />}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{notice}</span>
          {canUndo && !readonly && <button onClick={undo}>撤销</button>}
        </div>
      )}
      {settings && <DataSettings onClose={() => setSettings(false)} />}
      <RestReminderAlert reminder={reminder} />
    </div>
  );
}
export default function Root() {
  return (
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  );
}
