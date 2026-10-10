import { useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2, Undo2, Redo2 } from 'lucide-react';
import { uid, type DailyGoal } from './model';
import { useWorkspace } from './state';
import { IconButton } from './ui';

function GoalRow({
  goal,
  update,
  remove,
  readonly,
}: {
  goal: DailyGoal;
  update: (patch: Partial<DailyGoal>, history?: boolean) => void;
  remove: () => void;
  readonly: boolean;
}) {
  const [draft, setDraft] = useState(goal.title);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => setDraft(goal.title), [goal.title]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    const resize = () => {
      el.style.height = '0px';
      el.style.height = el.scrollHeight + 'px';
    };
    resize();
    // Observe width only; observing the textarea's height would loop.
    const parent = el.parentElement!;
    let width = parent.clientWidth;
    const widths = new ResizeObserver(() => {
      if (width !== parent.clientWidth) {
        width = parent.clientWidth;
        resize();
      }
    });
    widths.observe(parent);
    return () => widths.disconnect();
  }, [draft]);
  const save = () => {
    if (!draft.trim()) setDraft(goal.title);
    else if (draft.trim() !== goal.title) update({ title: draft.trim() }, false);
  };
  return (
    <div className={'daily-goal-row' + (goal.completed ? ' completed' : '')}>
      <label className="daily-goal-check">
        <input
          type="checkbox"
          checked={goal.completed}
          disabled={readonly}
          aria-label={`完成目标：${goal.title}`}
          onChange={(e) =>
            update({
              completed: e.target.checked,
              completedAt: e.target.checked ? Date.now() : undefined,
            })
          }
        />
      </label>
      <textarea
        ref={input}
        rows={1}
        aria-label="每日目标标题"
        value={draft}
        readOnly={readonly}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          if (value.trim()) update({ title: value }, false);
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(goal.title);
          }
        }}
      />
      <IconButton
        className="daily-goal-delete"
        label={`删除目标：${goal.title}`}
        disabled={readonly}
        onClick={remove}
      >
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
}

export function DailyGoals({ date }: { date: string }) {
  const { w, commit, readonly, flush, undo, redo, canUndo, canRedo } = useWorkspace();
  const [draft, setDraft] = useState('');
  const goals = w.dailyEntries[date]?.goals ?? [];
  const prepare = () =>
    commit(
      (d) => {
        const e = (d.dailyEntries[date] ??= { content: '', updatedAt: 0 });
        e.goals ??= [];
      },
      false,
      true,
    );
  const update = (id: string, patch: Partial<DailyGoal>, history = true) => {
    commit(
      (d) => {
        const e = d.dailyEntries[date];
        const goal = e?.goals?.find((g) => g.id === id);
        if (!goal) return;
        Object.assign(goal, patch);
        e.updatedAt = Date.now();
      },
      history,
      history,
    );
  };
  return (
    <section className="daily-goals" aria-label="每日目标">
      <header>
        <h2>每日目标</h2>
        <span>
          已完成 {goals.filter((g) => g.completed).length}/{goals.length}
        </span>
        <div className="daily-goal-history">
          <IconButton label="撤销" disabled={readonly || !canUndo} onClick={undo}>
            <Undo2 />
          </IconButton>
          <IconButton label="重做" disabled={readonly || !canRedo} onClick={redo}>
            <Redo2 />
          </IconButton>
        </div>
      </header>
      {!goals.length && <p className="daily-goals-empty">今天，想完成哪几件事？</p>}
      <div className="daily-goal-list">
        {goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            readonly={readonly}
            update={(patch, history) => update(goal.id, patch, history)}
            remove={() => {
              commit(
                (d) => {
                  const e = d.dailyEntries[date];
                  e.goals = e.goals!.filter((g) => g.id !== goal.id);
                  e.updatedAt = Date.now();
                },
                true,
                true,
              );
            }}
          />
        ))}
      </div>
      <form
        className="daily-goal-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (readonly || !draft.trim()) return;
          prepare();
          commit(
            (d) => {
              const e = d.dailyEntries[date];
              e.goals!.push({
                id: uid(),
                title: draft.trim(),
                completed: false,
                createdAt: Date.now(),
              });
              e.updatedAt = Date.now();
            },
            true,
            true,
          );
          setDraft('');
        }}
      >
        <Plus size={18} />
        <input
          aria-label="添加每日目标"
          placeholder="添加一个目标，按 Enter 保存…"
          value={draft}
          disabled={readonly}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing && e.key === 'Enter') e.preventDefault();
            if (e.key === 'Escape') setDraft('');
          }}
          onBlur={() => void flush().catch(() => {})}
        />
        <button type="submit" disabled={readonly || !draft.trim()}>
          添加
        </button>
      </form>
    </section>
  );
}
