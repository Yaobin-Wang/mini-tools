import { useLayoutEffect, useRef, useState } from 'react';
import { Compass, Plus, Check, RotateCcw, ArrowUp, ArrowDown, Trash2, Undo2, Redo2, Settings2 } from 'lucide-react';
import { useWorkspace } from './state';
import { uid, type LongTermGoal, type Workspace } from './model';
import { IconButton, Modal } from './ui';

function GoalEditor({ goal, onSave, onCancel }: {
  goal?: LongTermGoal; onSave: (title: string, description: string, targetDate: string) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const { readonly } = useWorkspace();
  return <form className="direction-editor" onSubmit={e => { e.preventDefault(); if (!readonly && title.trim()) onSave(title.trim(), description, date); }}>
    <label className="field">标题<input autoFocus aria-label="长期方向标题" value={title} onChange={e => setTitle(e.target.value)} required readOnly={readonly} /></label>
    <label className="field">说明（可选）<textarea aria-label="长期方向说明" rows={3} value={description} onChange={e => setDescription(e.target.value)} readOnly={readonly} /></label>
    <label className="field">目标日期（可选）<input aria-label="长期方向目标日期" type="date" value={date} onChange={e => setDate(e.target.value)} readOnly={readonly} /></label>
    <div className="direction-editor-actions"><button type="button" className="button secondary" onClick={onCancel}>取消</button><button className="button primary" disabled={readonly || !title.trim()}>保存目标</button></div>
  </form>;
}

export function LongTermGoals() {
  const { w, commit, readonly, undo, redo, canUndo, canRedo, notify } = useWorkspace();
  const [open, setOpen] = useState(false), [completed, setCompleted] = useState(false), [editing, setEditing] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ left:0, top:0, width:0, compact:true, icon:false });
  const goals = w.longTermGoals ?? [], active = goals.filter(g => !g.completed), shown = goals.filter(g => g.completed === completed);
  useLayoutEffect(() => {
    const heading = anchor.current!.parentElement!;
    const copy = heading.querySelector<HTMLElement>('.todo-heading-copy')!;
    const tabs = heading.querySelector<HTMLElement>('.status-tabs')!;
    const measure = () => {
      const parent = heading.getBoundingClientRect(), a = copy.getBoundingClientRect(), b = tabs.getBoundingClientRect();
      const gap = b.left - a.right - 40;
      const compact = gap < 340;
      const width = Math.min(820, Math.max(0, gap));
      const title = copy.querySelector('h1')!.getBoundingClientRect();
      const next = gap < 96
        ? { left: title.left - parent.left + Math.max(150, a.width - 40), top:title.top - parent.top + title.height / 2, width:36, compact:true, icon:true }
        : { left:a.right - parent.left + 20 + (gap - width)/2, top:parent.height/2, width, compact, icon:false };
      setLayout(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(heading); observer.observe(copy); observer.observe(tabs);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const launch = (id: string | null = null) => { setCompleted(false); setEditing(id); setOpen(true); };
  const change = (fn: (d: Workspace) => void, message?: string) => { commit(fn, true, true); if (message) notify(message); };
  const move = (id: string, offset: number) => change(d => {
    const list = d.longTermGoals!;
    const visible = list.filter(g => g.completed === completed);
    const other = visible[visible.findIndex(g => g.id === id) + offset];
    if (!other) return;
    const a = list.findIndex(g => g.id === id), b = list.findIndex(g => g.id === other.id);
    [list[a], list[b]] = [list[b], list[a]];
  });
  const count = layout.width >= 650 ? 3 : layout.width >= 470 ? 2 : 1;
  return <>
    <div ref={anchor} className={'directions-anchor' + (layout.compact ? ' compact' : '')} style={{ left:layout.left, top:layout.top, width:layout.width }}>
      {layout.compact ? <button className="directions-compact" aria-label={`长期方向 · ${active.length} 项`} title={`长期方向 · ${active.length} 项`} onClick={() => launch()}><Compass size={18} />{!layout.icon && <span>长期方向 · {active.length} 项</span>}</button> :
        <section className="directions-summary" aria-label="长期方向摘要">
          <div className="directions-label"><Compass size={15} /><span>长期方向</span></div>
          <div className="directions-items">{active.length ? active.slice(0,count).map(g => <button key={g.id} title={g.targetDate ? `${g.title} · 截止 ${g.targetDate}` : g.title} onClick={() => launch(g.id)}><span className="directions-item-title">{g.title}</span>{g.targetDate && <time className="directions-item-date" dateTime={g.targetDate}>{g.targetDate}</time>}</button>) :
            <button className="directions-empty" onClick={() => launch('new')}><Plus size={16} />写下一个想持续推进的目标</button>}</div>
          <button className="directions-manage" aria-label="管理长期方向" title="管理长期方向" onClick={() => launch()}>{active.length > count ? `其余 ${active.length-count} 项` : <Settings2 size={18} />}</button>
        </section>}
    </div>
    {open && <Modal title="长期方向" wide onClose={() => { setOpen(false); setEditing(null); }}>
      <div className="directions-manager">
        <p className="directions-note">把想持续推进的方向放在眼前。这里的目标不会自动改变画布或每日清单。</p>
        <div className="directions-tools"><div className="segmented"><button className={!completed ? 'active' : ''} onClick={() => {setCompleted(false);setEditing(null);}}>进行中 {active.length}</button><button className={completed ? 'active' : ''} onClick={() => {setCompleted(true);setEditing(null);}}>已完成 {goals.length-active.length}</button></div>
          <IconButton label="撤销长期方向操作" disabled={readonly || !canUndo} onClick={() => {setEditing(null);undo();}}><Undo2 /></IconButton><IconButton label="重做长期方向操作" disabled={readonly || !canRedo} onClick={() => {setEditing(null);redo();}}><Redo2 /></IconButton>
          <button className="button primary" disabled={readonly} onClick={() => {setCompleted(false);setEditing('new');}}><Plus size={16} />新增目标</button>
        </div>
        {readonly && <p className="directions-note">当前窗口只读，请在编辑窗口修改。</p>}
        {editing && (editing === 'new' || goals.some(g => g.id === editing)) ? <GoalEditor key={editing} goal={goals.find(g => g.id === editing)} onCancel={() => setEditing(null)} onSave={(title, description, targetDate) => {
          change(d => {
            const list = d.longTermGoals ??= [], time = Date.now();
            const old = list.find(g => g.id === editing);
            if (old) Object.assign(old, { title, description, targetDate, updatedAt:time });
            else list.push({id:uid(),title,description,targetDate,completed:false,createdAt:time,updatedAt:time});
          }); setEditing(null);
        }} /> : <div className="direction-list">
          {!shown.length && <p className="directions-note">{completed ? '还没有已完成的长期目标。' : '暂时没有目标，从一个想持续推进的方向开始。'}</p>}
          {shown.map((g,index) => <article className="direction-row" key={g.id}><div className="direction-text"><button className="direction-title" onClick={() => setEditing(g.id)}>{g.title}</button>{g.description && <p>{g.description}</p>}{g.targetDate && <small>目标日期 {g.targetDate}</small>}</div>
            <div className="direction-controls"><IconButton label={`上移目标：${g.title}`} disabled={readonly || index===0} onClick={() => move(g.id,-1)}><ArrowUp /></IconButton><IconButton label={`下移目标：${g.title}`} disabled={readonly || index===shown.length-1} onClick={() => move(g.id,1)}><ArrowDown /></IconButton>
              <IconButton label={`${g.completed ? '恢复' : '完成'}目标：${g.title}`} disabled={readonly} onClick={() => change(d => {const goal=d.longTermGoals!.find(t=>t.id===g.id)!;goal.completed=!goal.completed;goal.updatedAt=Date.now();if(goal.completed)goal.completedAt=Date.now();else delete goal.completedAt;})}>{g.completed ? <RotateCcw /> : <Check />}</IconButton>
              <IconButton label={`删除目标：${g.title}`} disabled={readonly} onClick={() => change(d => {d.longTermGoals=d.longTermGoals!.filter(t=>t.id!==g.id);},'已删除长期目标，可撤销恢复')}><Trash2 /></IconButton>
            </div></article>)}
        </div>}
      </div>
    </Modal>}
  </>;
}
