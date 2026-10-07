import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, Code2, Columns2, Check, Copy, Plus } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useWorkspace } from './state';
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className = '',
  buttonRef,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={'icon-button ' + className}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const el = ref.current!;
    el.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const focus = [
          ...el.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ].filter((e) => e.offsetParent !== null);
        if (!focus.length) return;
        if (e.shiftKey && document.activeElement === focus[0]) {
          e.preventDefault();
          focus.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === focus.at(-1)) {
          e.preventDefault();
          focus[0].focus();
        }
      }
    };
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('keydown', key);
      old?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="关闭窗口" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function TextDialog({
  title,
  label,
  initial = '',
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            onSubmit(value.trim());
            onClose();
          }
        }}
      >
        <label className="field">
          {label}
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} required />
        </label>
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={!value.trim()}>
            <Check size={16} />
            确定
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Confirm({
  title,
  children,
  onClose,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="confirm-body">{children}</div>
      <footer>
        <button className="button secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="button danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          确认
        </button>
      </footer>
    </Modal>
  );
}
export function Preview({
  value,
  empty = '写下一点，就从这里开始。',
}: {
  value: string;
  empty?: string;
}) {
  const html = DOMPurify.sanitize(marked.parse(value, { async: false, gfm: true, breaks: true }), {
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style'],
  });
  return (
    <div
      className={'prose ' + (!value ? 'empty-prose' : '')}
      dangerouslySetInnerHTML={{ __html: value ? html : DOMPurify.sanitize(empty) }}
    />
  );
}
export function MarkdownEditor({
  value,
  onChange,
  label = '正文',
  minHeight = 280,
}: {
  value: string;
  onChange: (s: string) => void;
  label?: string;
  minHeight?: number;
}) {
  const { readonly, flush } = useWorkspace(),
    [mode, setMode] = useState<'read' | 'source' | 'split'>('read'),
    textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (mode !== 'read') textarea.current?.focus();
  }, [mode]);
  const open = () => {
    if (!readonly) setMode('split');
  };
  return (
    <section className={'markdown-editor mode-' + mode} style={{ minHeight }}>
      <div className="editor-toolbar">
        <span>{label}</span>
        <div className="segmented small">
          <IconButton
            label="阅读预览"
            className={mode === 'read' ? 'active' : ''}
            onClick={() => {
              void flush().catch(() => {});
              setMode('read');
            }}
          >
            <Eye />
          </IconButton>
          <IconButton
            label="源码编辑"
            disabled={readonly}
            className={mode === 'source' ? 'active' : ''}
            onClick={() => setMode('source')}
          >
            <Code2 />
          </IconButton>
          <IconButton
            label="实时预览"
            disabled={readonly}
            className={mode === 'split' ? 'active' : ''}
            onClick={() => setMode('split')}
          >
            <Columns2 />
          </IconButton>
        </div>
      </div>
      <div className="editor-body">
        {mode !== 'read' && (
          <textarea
            ref={textarea}
            aria-label={label + ' Markdown'}
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => void flush().catch(() => {})}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                setMode('read');
                void flush().catch(() => {});
              }
            }}
            placeholder="在这里书写，支持 Markdown…"
            style={{ minHeight }}
          />
        )}
        {mode !== 'source' && (
          <div
            className="preview-wrap"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) return;
              if (mode === 'read') open();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') open();
            }}
            tabIndex={mode === 'read' && !readonly ? 0 : undefined}
            aria-label={mode === 'read' ? '点击编辑' + label : undefined}
          >
            <Preview value={value} />
          </div>
        )}
      </div>
      <div className="editor-footnote">
        {mode === 'read' ? '点击正文开始编辑' : '自动保存 · Ctrl + Enter 完成编辑'}
      </div>
    </section>
  );
}
export function Empty({
  icon,
  heading,
  children,
  action,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-art">
        {icon}
        <span />
        <span />
      </div>
      <h2>{heading}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function InlineAdd({
  onAdd,
  open = true,
  onClose,
  triggerRef,
  placeholder = '添加同组任务…',
  label = '添加同组任务',
}: {
  onAdd: (s: string) => void;
  open?: boolean;
  onClose?: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  placeholder?: string;
  label?: string;
}) {
  const [v, setV] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open || !onClose) return;
    const outside = (e: MouseEvent) => {
      if (
        e.target instanceof Node &&
        !form.current?.contains(e.target) &&
        !triggerRef?.current?.contains(e.target)
      )
        onClose();
    };
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, [open, onClose, triggerRef]);
  // Keep the unsubmitted draft when temporarily hiding the input.
  if (!open) return null;
  return (
    <form
      ref={form}
      className="inline-add nodrag nowheel"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          onClose?.();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onAdd(v.trim());
          setV('');
        }
      }}
    >
      <input
        autoFocus
        aria-label={label}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
      />
      <IconButton
        label="确认添加"
        disabled={!v.trim()}
        onClick={() => {
          if (v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
      >
        <Plus />
      </IconButton>
    </form>
  );
}
