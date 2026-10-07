import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type NodeProps, useReactFlow, useStore, NodeResizer } from '@xyflow/react';
import { useWorkspace } from './state';
import { Modal } from './ui';
import { type Point, type Workspace, type Region } from './model';
import { arrange, type Rect } from './layout';

export const REGION_COLORS = ['#8CA591', '#B8A078', '#879FB6', '#AC94B5', '#BD9393', '#84AAA6'];
export function RegionNode({ id, data }: NodeProps) {
  const { w, commit, readonly } = useWorkspace();
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const r = w.regions?.find((r) => r.id === id);
  if (!r) return null;
  return (
    <section
      className="canvas-region"
      data-region-id={id}
      style={
        {
          '--region-color': r.color,
          '--region-text-scale': Math.min(1.7, 1 / Math.min(zoom, 1)),
        } as CSSProperties
      }
    >
      <NodeResizer
        isVisible={!readonly}
        minWidth={180}
        minHeight={120}
        handleClassName="region-resize-handle"
        lineClassName="region-resize-line"
        shouldResize={(_, box) =>
          rf
            .getNodes()
            .filter((n) => r.groupIds.includes(n.id))
            .every(
              (n) =>
                n.position.x >= box.x + 20 - 0.5 &&
                n.position.y >= box.y + 104 - 0.5 &&
                n.position.x + (n.measured?.width ?? n.width ?? 296) <=
                  box.x + box.width - 20 + 0.5 &&
                n.position.y + (n.measured?.height ?? n.height ?? 150) <=
                  box.y + box.height - 20 + 0.5,
            )
        }
        onResizeStart={() => (data.resizeActive as (active: boolean) => void)(true)}
        onResizeEnd={(_, box) => {
          (data.resizeActive as (active: boolean) => void)(false);
          commit(
            (d) => {
              const region = d.regions!.find((a) => a.id === id)!;
              region.position = { x: box.x, y: box.y };
              region.width = box.width;
              region.height = box.height;
            },
            true,
            true,
          );
        }}
      />
      <button
        className="region-label nodrag nopan"
        onClick={() => (data.edit as () => void)()}
        aria-label={'设置区域：' + r.name}
      >
        <span className="region-name">{r.name}</span>
        <span className="region-count">{r.groupIds.length} 组</span>
        <span className="region-settings">设置</span>
      </button>
    </section>
  );
}

export function RegionSettings({ id, onClose }: { id: string; onClose: () => void }) {
  const { w, commit, readonly } = useWorkspace();
  const r = w.regions?.find((r) => r.id === id);
  if (!r) return null;
  return (
    <Modal title="区域设置" onClose={onClose}>
      <label className="field">
        区域名称
        <input
          aria-label="区域名称"
          disabled={readonly}
          value={r.name}
          onChange={(e) =>
            commit((d) => {
              d.regions!.find((a) => a.id === id)!.name = e.target.value;
            }, false)
          }
        />
      </label>
      <p>浅背景色</p>
      <div className="region-palette">
        {REGION_COLORS.map((color, i) => (
          <button
            key={color}
            aria-label={'区域颜色 ' + (i + 1)}
            aria-pressed={r.color === color}
            disabled={readonly}
            style={{ '--region-color': color } as CSSProperties}
            onClick={() =>
              commit(
                (d) => {
                  d.regions!.find((a) => a.id === id)!.color = color;
                },
                true,
                true,
              )
            }
          />
        ))}
      </div>
      <p className="muted">
        区域内的任务组不能拖出边界。拖入完整落在区域内的未分区任务组，会自动加入。内容变高时区域会扩展。
      </p>
      {r.groupIds.map((gid) => (
        <div className="region-member" key={gid}>
          <span>{w.groups.find((g) => g.id === gid)?.name}</span>
          <button
            className="button ghost"
            disabled={readonly}
            onClick={() =>
              commit(
                (d) => {
                  const a = d.regions!.find((a) => a.id === id)!;
                  a.groupIds = a.groupIds.filter((g) => g !== gid);
                },
                true,
                true,
              )
            }
          >
            解除区域限制
          </button>
        </div>
      ))}
      <div className="modal-actions">
        <button
          className="button danger"
          disabled={readonly}
          onClick={() => {
            commit(
              (d) => {
                d.regions = d.regions?.filter((a) => a.id !== id);
              },
              true,
              true,
            );
            onClose();
          }}
        >
          删除区域（保留任务）
        </button>
        <button className="button primary" onClick={onClose}>
          完成
        </button>
      </div>
    </Modal>
  );
}

export function RegionDrawing({
  onCreate,
  onCancel,
}: {
  onCreate: (rect: Omit<Rect, 'id'>, color: string) => void;
  onCancel: () => void;
}) {
  const rf = useReactFlow();
  const start = useRef<Point | null>(null);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [color] = useState(() => REGION_COLORS[Math.floor(Math.random() * REGION_COLORS.length)]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onCancel]);
  return (
    <div
      className="region-drawing"
      aria-label="绘制区域"
      onContextMenu={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const b = e.currentTarget.getBoundingClientRect();
        setPreview({
          x: Math.min(start.current.x, e.clientX) - b.x,
          y: Math.min(start.current.y, e.clientY) - b.y,
          width: Math.abs(e.clientX - start.current.x),
          height: Math.abs(e.clientY - start.current.y),
        });
      }}
      onPointerCancel={() => {
        start.current = null;
        setPreview(null);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const first = start.current;
        start.current = null;
        if (Math.abs(first.x - e.clientX) < 12 || Math.abs(first.y - e.clientY) < 12) {
          setPreview(null);
          return;
        }
        const a = rf.screenToFlowPosition(first),
          b = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        onCreate(
          {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.max(180, Math.abs(a.x - b.x)),
            height: Math.max(120, Math.abs(a.y - b.y)),
          },
          color,
        );
      }}
    >
      <div className="region-draw-hint">左键拖动框选区域 · Esc / 右键取消</div>
      {preview && (
        <div
          className="region-preview"
          style={
            {
              left: preview.x,
              top: preview.y,
              width: preview.width,
              height: preview.height,
              '--region-color': color,
            } as CSSProperties
          }
        />
      )}
    </div>
  );
}

export function expandRegion(r: Region, rects: Rect[]) {
  for (const b of rects.filter((b) => r.groupIds.includes(b.id))) {
    const left = Math.min(r.position.x, b.x - 20),
      top = Math.min(r.position.y, b.y - 104);
    r.width = Math.max(r.position.x + r.width, b.x + b.width + 20) - left;
    r.height = Math.max(r.position.y + r.height, b.y + b.height + 20) - top;
    r.position = { x: left, y: top };
  }
}

export function arrangeRegions(w: Workspace, rects: Rect[], width: number) {
  const assigned = new Set(w.regions?.flatMap((r) => r.groupIds));
  const blocks = rects.filter((r) => !assigned.has(r.id));
  for (const r of w.regions ?? []) {
    const members = rects.filter((b) => r.groupIds.includes(b.id));
    const positions = arrange(members, r.width - 40);
    for (const b of members) {
      const p = positions[b.id];
      w.groups.find((g) => g.id === b.id)!.position = {
        x: r.position.x + 20 + p.x,
        y: r.position.y + 104 + p.y,
      };
    }
    r.width = Math.max(180, ...members.map((b) => positions[b.id].x + b.width + 40));
    r.height = Math.max(120, ...members.map((b) => positions[b.id].y + b.height + 124));
    blocks.push({ id: r.id, ...r.position, width: r.width, height: r.height });
  }
  const positions = arrange(blocks, width);
  for (const g of w.groups)
    if (!assigned.has(g.id) && positions[g.id]) g.position = positions[g.id];
  for (const r of w.regions ?? []) {
    const p = positions[r.id];
    for (const g of w.groups.filter((g) => r.groupIds.includes(g.id)))
      g.position = { x: g.position.x + p.x - r.position.x, y: g.position.y + p.y - r.position.y };
    r.position = p;
  }
}
