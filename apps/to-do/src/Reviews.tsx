import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
  Settings2,
  Trash2,
  Sprout,
  Check,
} from 'lucide-react';
import { useWorkspace } from './state';
import {
  dayKey,
  monthKey,
  calendarMonth,
  contentLength,
  level,
  dailyContent,
  isEmptyDailyTemplate,
  restTimeForDate,
} from './model';
import { DailyGoals } from './DailyGoals';
import { MarkdownEditor, IconButton, Modal } from './ui';
export function Daily() {
  const { w, commit, flush, readonly } = useWorkspace(),
    [date, setDate] = useState(dayKey()),
    [year, setYear] = useState(new Date().getFullYear());
  const [today, setToday] = useState(dayKey());
  useEffect(() => {
    if (readonly || !Object.values(w.dailyEntries).some(e => isEmptyDailyTemplate(e.content))) return;
    commit(d => {
      for (const entry of Object.values(d.dailyEntries)) {
        if (isEmptyDailyTemplate(entry.content)) {
          entry.content = '';
          entry.contentInitialized = true;
        }
      }
    }, false);
  }, [w.dailyEntries, readonly, commit]);
  useEffect(() => {
    const tick = () => setToday(dayKey());
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);
  const entry = w.dailyEntries[date] || { content: '', updatedAt: 0 },
    counts = useMemo(
      () =>
        Object.fromEntries(
          Object.entries(w.dailyEntries).map(([d, e]) => [d, contentLength(e.content)]),
        ),
      [w.dailyEntries],
    ),
    total = Object.entries(counts).filter(([d, n]) => d.startsWith(String(year)) && n > 0).length;
  const choose = (d: string) => {
    void flush().catch(() => {});
    setDate(d);
    setYear(Number(d.slice(0, 4)));
  };
  const write = (s: string) =>
    commit((d) => {
      const e = (d.dailyEntries[date] ??= { content: '', updatedAt: 0 });
      e.content = s;
      e.contentInitialized = true;
      e.updatedAt = Date.now();
    }, false);
  const goalCount = entry.goals?.length ?? 0;
  const goalDone = entry.goals?.filter((g) => g.completed).length ?? 0;
  const restMs = restTimeForDate(w, date);
  const restMinutes = Math.floor((restMs ?? 0) / 60000);
  const restLabel =
    restMs === null
      ? '—'
      : restMinutes >= 60
        ? `${Math.floor(restMinutes / 60)} 小时 ${restMinutes % 60} 分`
        : `${restMinutes} 分钟`;
  return (
    <div className="review-page daily-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LEAVE A TRACE OF TODAY</div>
          <h1>
            每日复盘
            <span className="heading-dot" />
          </h1>
          <p>列下今天的目标，留下今天的思考。</p>
        </div>
      </div>
      <div className="daily-layout">
        <div className="journal-column">
          <div className="journal-heading">
            <div>
              <span className="journal-day">{Number(date.slice(-2))}</span>
              <span>
                {new Date(date + 'T12:00:00').toLocaleDateString('zh-CN', {
                  month: 'long',
                  weekday: 'long',
                })}
              </span>
            </div>
            <div className="journal-date-tools">
              <div className="review-date">
                {date !== today && (
                  <button className="button ghost" onClick={() => choose(today)}>
                    回到今天
                  </button>
                )}
                <CalendarDays size={17} />
                <input
                  aria-label="复盘日期"
                  type="date"
                  value={date}
                  max={dayKey()}
                  onChange={(e) => {
                    if (e.target.value) choose(e.target.value);
                  }}
                />
              </div>
              <span className="word-count">
                {counts[date] || 0} 字
                {(counts[date] || 0) > 0 && (
                  <>
                    {' '}
                    · <Check size={13} />
                    已留下印记
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="paper-panel daily-paper">
            <DailyGoals key={'goals-' + date} date={date} />
            <MarkdownEditor
              key={'review-' + date}
              label="思考与总结"
              value={dailyContent(w.dailyEntries[date])}
              onChange={write}
              minHeight={400}
            />
            <div className="journal-actions daily-summary">
              <span>
                {entry.updatedAt
                  ? '更新于 ' +
                    new Date(entry.updatedAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '尚未编辑'}
              </span>
              <span>正文 {counts[date] || 0} 字</span>
              <span>
                目标 {goalDone}/{goalCount}
              </span>
              <span title="倒计时实际运行的累计时间：暂停与到期等待不计入，延后计入；休眠经过时间按结束时刻封顶。不是实际休息或专注时长。旧日期没有统计时显示 —。">
                提醒计时 {restLabel}
              </span>
            </div>
          </div>
          <div className="journal-bottom">
            <Sprout size={18} />
            <span>不必写得完整，真实就好。</span>
          </div>
        </div>
        <aside className="continuity-panel">
          <header>
            <div>
              <h2>连续性视图</h2>
              <p>
                这一年，记录了 <strong>{total}</strong> 天
              </p>
            </div>
            <Sprout size={22} />
          </header>
          <div className="year-switch">
            <IconButton label="上一年" onClick={() => setYear(year - 1)}>
              <ChevronLeft />
            </IconButton>
            <input
              type="number"
              aria-label="连续性年份"
              min={1900}
              max={9999}
              value={year}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1900 && n <= 9999) setYear(n);
              }}
            />
            <IconButton label="下一年" onClick={() => setYear(year + 1)}>
              <ChevronRight />
            </IconButton>
          </div>
          <div className="year-calendar">
            {Array.from({ length: 12 }, (_, m) => {
              const c = calendarMonth(year, m);
              return (
                <section className="mini-month" key={m}>
                  <h3>
                    {String(m + 1).padStart(2, '0')} <span>月</span>
                  </h3>
                  <div className="calendar-grid">
                    {Array.from({ length: c.offset }, (_, i) => (
                      <span key={'blank' + i} />
                    ))}
                    {c.days.map((d) => (
                      <button
                        key={d}
                        disabled={d > dayKey()}
                        aria-label={d + '，' + (counts[d] || 0) + ' 字'}
                        title={d + ' · ' + (counts[d] || 0) + ' 字'}
                        className={
                          'heat-cell level-' +
                          level(counts[d] || 0) +
                          (d === date ? ' current' : '') +
                          (d === dayKey() ? ' today' : '')
                        }
                        onClick={() => choose(d)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="heat-legend">
            <span>留白</span>
            {[0, 1, 2, 3, 4].map((n) => (
              <i key={n} className={'heat-cell level-' + n} />
            ))}
            <span>丰盈</span>
          </div>
          <p className="calendar-caption">写字即记录。点击日期，回到那一天。</p>
        </aside>
      </div>
    </div>
  );
}
export function Monthly() {
  const { w, commit, readonly, flush } = useWorkspace(),
    [month, setMonth] = useState(monthKey()),
    [settings, setSettings] = useState(false);
  const entry = w.monthlyEntries[month] || {
    content: '',
    updatedAt: 0,
    checklist: w.monthlyTemplate.map((text) => ({ text, answer: '' })),
  };
  const update = (fn: (e: typeof entry) => void) =>
    commit((d) => {
      const e = d.monthlyEntries[month] || {
        content: '',
        updatedAt: 0,
        checklist: d.monthlyTemplate.map((text) => ({ text, answer: '' })),
      };
      fn(e);
      e.updatedAt = Date.now();
      d.monthlyEntries[month] = e;
    }, false);
  return (
    <div className="review-page monthly-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A MOMENT TO LOOK BACK</div>
          <h1>
            每月总结
            <span className="heading-dot" />
          </h1>
          <p>把脚步放慢一点，看看这一程的收获。</p>
        </div>
        <div className="review-date">
          <CalendarDays size={17} />
          <input
            type="month"
            aria-label="总结月份"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                void flush().catch(() => {});
                setMonth(e.target.value);
              }
            }}
          />
          <IconButton label="设置月度问题" disabled={readonly} onClick={() => setSettings(true)}>
            <Settings2 />
          </IconButton>
        </div>
      </div>
      <div className="monthly-paper">
        <div className="monthly-title">
          <span>
            {month.slice(0, 4)} / {month.slice(5)}
          </span>
          <h2>这一个月</h2>
          <FileText size={36} />
        </div>
        <div className="monthly-questions">
          {entry.checklist.map((item, i) => (
            <label key={i}>
              <span>
                <small>{String(i + 1).padStart(2, '0')}</small>
                {item.text}
              </span>
              <textarea
                aria-label={item.text}
                disabled={readonly}
                value={item.answer}
                placeholder="记下一件值得回看的事…"
                onChange={(e) =>
                  update((a) => {
                    a.checklist[i].answer = e.target.value;
                  })
                }
                onBlur={() => void flush().catch(() => {})}
              />
            </label>
          ))}
        </div>
        <MarkdownEditor
          key={month}
          value={entry.content}
          label="深度复盘"
          onChange={(s) =>
            update((e) => {
              e.content = s;
            })
          }
          minHeight={320}
        />
      </div>
      {settings && <MonthlySettings onClose={() => setSettings(false)} month={month} />}
    </div>
  );
}
function MonthlySettings({ onClose, month }: { onClose: () => void; month: string }) {
  const { w, commit } = useWorkspace(),
    [items, setItems] = useState([...w.monthlyTemplate]),
    [newItem, setNewItem] = useState('');
  return (
    <Modal title="月度问题" onClose={onClose}>
      <p className="muted">
        更新模板，并同步到正在查看的月份。同名问题保留回答，其他已有月份不变。
      </p>
      <div className="template-items">
        {items.map((item, i) => (
          <div key={i}>
            <input
              aria-label={'月度问题 ' + (i + 1)}
              value={item}
              onChange={(e) => setItems(items.map((s, j) => (i === j ? e.target.value : s)))}
            />
            <IconButton
              label={'移除问题 ' + (i + 1)}
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </IconButton>
          </div>
        ))}
      </div>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (newItem.trim()) {
            setItems([...items, newItem.trim()]);
            setNewItem('');
          }
        }}
      >
        <input
          aria-label="新月度问题"
          placeholder="添加一个问题…"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
        />
        <button type="submit" className="icon-button" aria-label="添加问题">
          <Plus />
        </button>
      </form>
      <footer>
        <button
          className="button primary"
          disabled={
            items.some((s) => !s.trim()) ||
            new Set(items.map((s) => s.trim())).size !== items.length
          }
          onClick={() => {
            commit(
              (d) => {
                d.monthlyTemplate = items.map((s) => s.trim());
                const old = d.monthlyEntries[month];
                if (old) {
                  const removed = old.checklist.filter((i) => !d.monthlyTemplate.includes(i.text));
                  if (removed.length) {
                    const key = 'monthlyQuestions:' + month + ':' + Date.now();
                    d.legacyArchive[key] = removed;
                  }
                  old.checklist = d.monthlyTemplate.map((text) => ({
                    text,
                    answer: old.checklist.find((i) => i.text === text)?.answer || '',
                  }));
                }
              },
              true,
              true,
            );
            onClose();
          }}
        >
          保存模板
        </button>
      </footer>
    </Modal>
  );
}
