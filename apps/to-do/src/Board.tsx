import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  memo,
  type CSSProperties,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  Handle,
  NodeResizer,
  Position,
  ConnectionMode,
  BaseEdge,
  EdgeLabelRenderer,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  useStore,
  SelectionMode,
  ViewportPortal,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type Connection,
} from '@xyflow/react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  pointerWithin,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  Plus,
  GripVertical,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Check,
  FolderOpen,
  ArrowUpRight,
  Maximize2,
  LayoutGrid,
  Undo2,
  Redo2,
  Search,
  X,
  ArrowLeftRight,
  CheckCheck,
  MousePointer2,
  Trash2,
  Link2,
  CornerDownRight,
  Scan,
} from 'lucide-react';
import { useWorkspace } from './state';
import {
  addGroup,
  BOARD_ZOOM_BASE,
  BOARD_MIN_ZOOM,
  BOARD_MAX_ZOOM,
  boardZoomPercent,
  addTask,
  moveTask,
  removeGroup,
  removeTask,
  toggleTask,
  isDone,
  allTasksDone,
  finalizeGroup,
  constrainToRegion,
  uid,
  validConnection,
  type Group,
  type Side,
  type Point,
} from './model';
import {
  snapRect,
  freePosition,
  route,
  roundedPath,
  GROUP_WIDTH,
  magneticSnap,
  magneticResize,
  type ResizeEdges,
  type ResizeLocks,
  type MagnetLocks,
  type Rect,
  type Guide,
} from './layout';
import { IconButton, TextDialog, Modal, InlineAdd, Empty } from './ui';
import { RegionNode, RegionSettings, RegionDrawing, expandRegion, arrangeRegions } from './Regions';
import { LongTermGoals } from './LongTermGoals';
const sides: Side[] = ['top', 'right', 'bottom', 'left'];
type DragPointer = { clientX: number; clientY: number; altKey: boolean } | TouchEvent;
type BoardAPI = {
  openTask: (id: string) => void;
  menu: (g: string) => void;
  zoom: number;
  readonly: boolean;
  resizeActive: (active: boolean) => void;
  resizePreview: (rect: Rect | null, guides: Guide[]) => void;
  alignmentRects: () => Rect[];
};
const BoardContext = createContext<BoardAPI>(null!);
function TaskRow({ id }: { id: string }) {
  const { w, commit, readonly } = useWorkspace(),
    api = useContext(BoardContext),
    t = w.tasks[id];
  const sortable = useSortable({ id, disabled: readonly, data: { kind: 'task', id } });
  if (!t) return null;
  const tr = sortable.transform,
    style = tr
      ? {
          transform: 'translate3d(' + tr.x / api.zoom + 'px,' + tr.y / api.zoom + 'px,0)',
          transition: sortable.transition,
          opacity: sortable.isDragging ? 0.25 : 1,
        }
      : undefined;
  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={'task-card nodrag ' + (t.completed ? 'completed' : '')}
      data-task-id={id}
    >
      <button
        className="task-check"
        aria-label={(t.completed ? '恢复任务：' : '完成任务：') + t.title}
        aria-pressed={t.completed}
        disabled={readonly}
        onClick={() => commit((d) => toggleTask(d, id), true, true)}
      >
        <span>{t.completed && <Check size={13} />}</span>
      </button>
      <button className="task-title" onClick={() => api.openTask(id)} title={t.title}>
        {t.title}
      </button>
      <button
        className="task-drag"
        title="拖动任务"
        aria-label={'拖动任务：' + t.title}
        disabled={readonly}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical size={15} />
      </button>
    </div>
  );
}
const GroupNode = memo(function GroupNode({ id, selected }: NodeProps) {
  const { w, commit, readonly } = useWorkspace(),
    api = useContext(BoardContext),
    g = w.groups.find((g) => g.id === id)!;
  const [adding, setAdding] = useState(false);
  const resize = useRef<{
    start: Rect;
    edges: ResizeEdges;
    locks: ResizeLocks;
    last: Rect;
    candidateKey?: string;
  } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [editingName, setEditingName] = useState(false),
    [nameDraft, setNameDraft] = useState('');
  const cancelledName = useRef(false);
  const framePointer = useRef({ x: 0, y: 0, moved: false });
  const update = useUpdateNodeInternals();
  const { setNodeRef, isOver } = useDroppable({
    id: 'group:' + id,
    data: { kind: 'group', id },
    disabled: readonly,
  });
  useEffect(() => {
    const t = requestAnimationFrame(() => update(id));
    return () => cancelAnimationFrame(t);
  }, [id, g?.taskIds.length, g?.collapsed, g?.hideCompleted, g?.size, adding, update]);
  if (!g) return null;
  const done = g.taskIds.filter((id) => w.tasks[id].completed).length,
    ids = g.taskIds.filter((id) => !g.hideCompleted || !w.tasks[id].completed);
  const toggleCollapsed = () => {
    if (!readonly)
      commit(
        (d) => {
          const group = d.groups.find((a) => a.id === id)!;
          group.collapsed = !group.collapsed;
        },
        false,
        true,
      );
  };
  const editName = () => {
    if (readonly || framePointer.current.moved) return;
    cancelledName.current = false;
    setNameDraft(g.name);
    setEditingName(true);
  };
  const finishName = () => {
    const name = nameDraft.trim();
    if (!cancelledName.current && name && name !== g.name && !readonly)
      commit(
        (d) => {
          const group = d.groups.find((a) => a.id === id)!;
          group.name = name;
          group.autoName = false;
        },
        true,
        true,
      );
    setEditingName(false);
  };
  return (
    <section
      className={
        'task-group ' +
        (selected ? 'selected ' : '') +
        (isOver ? 'drop-target ' : '') +
        (g.taskIds.length === 1 ? 'single ' : '') +
        (isDone(g, w) ? 'finishing' : '')
      }
      data-group-id={id}
      style={{ '--board-text-scale': Math.min(1.7, 1 / Math.min(api.zoom, 1)) } as CSSProperties}
      ref={setNodeRef}
      onPointerDownCapture={(e) => {
        framePointer.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMoveCapture={(e) => {
        if (Math.hypot(e.clientX - framePointer.current.x, e.clientY - framePointer.current.y) > 4)
          framePointer.current.moved = true;
      }}
      onClick={(e) => {
        if (
          framePointer.current.moved ||
          e.shiftKey ||
          e.ctrlKey ||
          e.metaKey ||
          (e.target as HTMLElement).closest(
            'button, input, textarea, select, .nodrag, .group-title, .react-flow__handle',
          )
        )
          return;
        toggleCollapsed();
      }}
    >
      <NodeResizer
        isVisible={selected && !readonly}
        minWidth={240}
        minHeight={g.collapsed ? 58 : 100}
        maxHeight={g.collapsed ? 58 : Number.MAX_VALUE}
        handleClassName="group-resize-handle"
        lineClassName="group-resize-line"
        onResizeStart={(event, dimensions) => {
          api.resizeActive(true);
          api.resizePreview(null, []);
          const control = (event.sourceEvent.target as Element).closest(
            '.react-flow__resize-control',
          );
          const start = { id, ...dimensions };
          resize.current = {
            start,
            last: start,
            locks: {},
            edges: {
              left: !!control?.classList.contains('left'),
              right: !!control?.classList.contains('right'),
              top: !g.collapsed && !!control?.classList.contains('top'),
              bottom: !g.collapsed && !!control?.classList.contains('bottom'),
            },
          };
        }}
        onResize={(event, dimensions) => {
          const state = resize.current;
          if (!state) return;
          const others = api.alignmentRects().filter((r) => r.id !== id);
          const candidateKey = others
            .map((r) => r.id)
            .sort()
            .join('|');
          if (state.candidateKey !== candidateKey) state.locks = {};
          state.candidateKey = candidateKey;
          const snapped = magneticResize(
            state.start,
            { id, ...dimensions },
            state.edges,
            others,
            api.zoom,
            state.locks,
            event.sourceEvent.altKey,
            g.collapsed ? 58 : 100,
          );
          state.locks = snapped.locks;
          state.last = snapped.rect;
          api.resizePreview(snapped.rect, snapped.guides);
        }}
        onResizeEnd={(event, raw) => {
          const state = resize.current;
          const others = api.alignmentRects().filter((r) => r.id !== id);
          const candidateKey = others
            .map((r) => r.id)
            .sort()
            .join('|');
          if (state && state.candidateKey !== candidateKey) state.locks = {};
          const dimensions = state
            ? magneticResize(
                state.start,
                { id, ...raw },
                state.edges,
                others,
                api.zoom,
                state.locks,
                event.sourceEvent.altKey,
                g.collapsed ? 58 : 100,
              ).rect
            : raw;
          api.resizePreview({ id, ...dimensions }, []);
          api.resizeActive(false);
          resize.current = null;
          commit(
            (d) => {
              const group = d.groups.find((a) => a.id === id)!;
              group.position = { x: dimensions.x, y: dimensions.y };
              group.size = {
                width: Math.max(240, dimensions.width),
                ...(group.collapsed
                  ? group.size?.height !== undefined
                    ? { height: group.size.height }
                    : {}
                  : { height: Math.max(100, dimensions.height) }),
              };
            },
            true,
            true,
          );
        }}
      />
      <header className="group-header">
        <span
          className="group-drag"
          tabIndex={readonly ? -1 : 0}
          aria-label={'拖动组：' + g.name}
          title="拖动整个任务组"
        >
          <GripVertical size={18} />
        </span>
        <div className="group-name">
          <button
            className="group-collapse nodrag"
            aria-label={(g.collapsed ? '展开组：' : '折叠组：') + g.name}
            title={g.name}
            disabled={readonly}
            onClick={toggleCollapsed}
          >
            {g.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          {editingName ? (
            <input
              className="group-name-input nodrag"
              aria-label="编辑组标题"
              value={nameDraft}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={finishName}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === 'Escape') {
                  cancelledName.current = true;
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <span
              className="group-title"
              role="button"
              tabIndex={readonly ? -1 : 0}
              aria-label={'编辑组标题：' + g.name}
              title={g.name + ' · 点击编辑，拖动移动整组'}
              onClick={(e) => {
                if (!e.shiftKey && !e.ctrlKey && !e.metaKey) editName();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  framePointer.current.moved = false;
                  editName();
                }
              }}
            >
              {g.name || '未命名组'}
            </span>
          )}
        </div>
        {allTasksDone(g, w) && !isDone(g, w) ? (
          <button
            className="group-finalize nodrag"
            disabled={readonly}
            title="确认完成本组，并移入已完成"
            aria-label={'完成本组：' + g.name}
            onClick={() => commit((d) => finalizeGroup(d, id), true, true)}
          >
            完成本组
          </button>
        ) : (
          <span className="group-count">
            {done}/{g.taskIds.length}
          </span>
        )}
        <IconButton
          label={'添加到组：' + g.name}
          buttonRef={addButton}
          className="nodrag"
          disabled={readonly}
          onClick={() => {
            setAdding(!adding);
            if (!adding)
              commit(
                (d) => {
                  const group = d.groups.find((x) => x.id === id)!;
                  group.collapsed = false;
                  if (group.size) delete group.size.height;
                },
                false,
                true,
              );
          }}
        >
          <Plus />
        </IconButton>
        <IconButton label={'设置组：' + g.name} className="nodrag" onClick={() => api.menu(id)}>
          <MoreHorizontal />
        </IconButton>
      </header>
      {!g.collapsed && (
        <div className="group-body nowheel">
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {ids.map((id) => (
              <TaskRow key={id} id={id} />
            ))}
          </SortableContext>
          {!g.taskIds.length && <p className="empty-group">添加一个任务，让想法开始生长。</p>}
          <InlineAdd
            triggerRef={addButton}
            open={adding}
            onClose={() => setAdding(false)}
            onAdd={(s) =>
              commit(
                (d) => {
                  addTask(d, id, s);
                },
                true,
                true,
              )
            }
          />
          {done > 0 && (
            <button
              className="completed-toggle nodrag"
              onClick={() =>
                commit(
                  (d) => {
                    const a = d.groups.find((x) => x.id === id)!;
                    a.hideCompleted = !a.hideCompleted;
                  },
                  false,
                  true,
                )
              }
            >
              {g.hideCompleted ? '显示' : '收起'} {done} 项已完成
            </button>
          )}
        </div>
      )}
      {sides.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side as Position}
          isConnectable={!readonly}
          className={'port port-' + side}
          aria-label={g.name + ' ' + side + ' 连接点'}
        />
      ))}
    </section>
  );
});
function RoutedEdge(props: EdgeProps) {
  const nodes = useStore((s) => s.nodes);
  const points = useMemo(
    () =>
      route(
        { x: props.sourceX, y: props.sourceY },
        { x: props.targetX, y: props.targetY },
        (props.sourceHandleId || 'right') as Side,
        (props.targetHandleId || 'left') as Side,
        nodes
          .filter((n) => !n.hidden && n.type !== 'region')
          .map((n) => ({
            id: n.id,
            x: n.position.x,
            y: n.position.y,
            width: n.measured?.width || GROUP_WIDTH,
            height: n.measured?.height || 150,
          })),
      ),
    [
      props.sourceX,
      props.sourceY,
      props.targetX,
      props.targetY,
      props.sourceHandleId,
      props.targetHandleId,
      nodes,
    ],
  );
  const segment = points
    .slice(1)
    .map((p, i) => ({
      a: points[i],
      b: p,
      length: Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y),
    }))
    .sort((a, b) => b.length - a.length)[0];
  const mid = segment
    ? { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 }
    : points[0];
  let labelWidth = 220;
  for (const n of nodes) {
    if (n.type === 'region') continue;
    if (mid.y + 12 < n.position.y || mid.y - 12 > n.position.y + (n.measured?.height || 150))
      continue;
    const right = n.position.x + (n.measured?.width || GROUP_WIDTH);
    if (right <= mid.x) labelWidth = Math.min(labelWidth, (mid.x - right) * 2 - 8);
    if (n.position.x >= mid.x) labelWidth = Math.min(labelWidth, (n.position.x - mid.x) * 2 - 8);
  }
  return (
    <>
      <BaseEdge
        id={props.id}
        path={roundedPath(points)}
        markerEnd={props.markerEnd}
        interactionWidth={20}
        style={{
          stroke: props.selected ? 'var(--accent)' : 'var(--edge)',
          strokeWidth: props.selected ? 2.8 : 2.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
      {props.label && mid && (
        <EdgeLabelRenderer>
          <button
            className="edge-label nodrag nopan"
            title={String(props.label)}
            style={{
              transform: 'translate(-50%,-50%) translate(' + mid.x + 'px,' + mid.y + 'px)',
              maxWidth: Math.max(28, labelWidth),
            }}
            onClick={() => (props.data?.edit as () => void)?.()}
          >
            {String(props.label)}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { group: GroupNode, region: RegionNode },
  edgeTypes = { relationship: RoutedEdge };
function BoardCanvas({ openTask }: { openTask: (id: string) => void }) {
  const { w, commit, readonly, undo, redo, canUndo, canRedo, notify } = useWorkspace(),
    rf = useReactFlow(),
    updateInternals = useUpdateNodeInternals();
  const [nodes, setNodes] = useState<Node[]>([]),
    [guides, setGuides] = useState<Guide[]>([]),
    [zoom, setZoom] = useState(w.viewport.zoom),
    [menu, setMenu] = useState<string | null>(null),
    [newGroup, setNewGroup] = useState(false),
    [edgeDialog, setEdgeDialog] = useState<string | null>(null),
    [archive, setArchive] = useState(false),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(30),
    [dragTask, setDragTask] = useState<string | null>(null),
    [blankDrop, setBlankDrop] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const resizePreview = useRef<Rect | null>(null);
  const [drawingRegion, setDrawingRegion] = useState(false);
  const [regionMenu, setRegionMenu] = useState<string | null>(null);
  const dragSession = useRef<{
    pointer: Point;
    positions: Map<string, Point>;
    locks: MagnetLocks;
    candidateKey?: string;
  } | null>(null);
  const previousDone = useRef(new Set(w.groups.filter((g) => isDone(g, w)).map((g) => g.id))),
    dragging = useRef(false),
    initialViewport = useRef(w.viewport),
    wrapper = useRef<HTMLDivElement>(null),
    pointer = useRef<Point | null>(null);
  const { setNodeRef: dropCanvas } = useDroppable({
    id: 'canvas-blank',
    data: { kind: 'blank' },
    disabled: readonly,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const rects = useCallback(
    () =>
      rf
        .getNodes()
        .filter((n) => n.type !== 'region' && !n.hidden)
        .map((n) => ({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          width: n.measured?.width || GROUP_WIDTH,
          height: n.measured?.height || 150,
        })),
    [rf],
  );
  const eventPosition = (event: DragPointer) => {
    const p = 'touches' in event ? event.touches[0] || event.changedTouches[0] : event;
    return rf.screenToFlowPosition({ x: p.clientX, y: p.clientY });
  };
  const alignmentRects = () => {
    const bounds = wrapper.current?.querySelector('.react-flow')?.getBoundingClientRect();
    if (!bounds) return [];
    const left = Math.max(0, bounds.left),
      top = Math.max(0, bounds.top);
    const right = Math.min(window.innerWidth, bounds.right),
      bottom = Math.min(window.innerHeight, bounds.bottom);
    if (right <= left || bottom <= top) return [];
    const a = rf.screenToFlowPosition({ x: left, y: top });
    const b = rf.screenToFlowPosition({ x: right, y: bottom });
    return rects().filter(
      (r) => r.x < b.x && r.x + r.width > a.x && r.y < b.y && r.y + r.height > a.y,
    );
  };
  const startGroupDrag = (event: DragPointer, node: Node, dragNodes: Node[]) => {
    if (!node) return;
    dragging.current = true;
    dragSession.current = {
      pointer: eventPosition(event),
      positions: new Map([...dragNodes, node].map((n) => [n.id, { ...n.position }])),
      locks: {},
    };
  };
  const updateGroupDrag = (event: DragPointer, node: Node, finish = false) => {
    const session = dragSession.current;
    if (!session || !node) return;
    // Derive raw motion from the pointer origin, never from a previously snapped node.
    const pointerNow = eventPosition(event),
      origin = session.positions.get(node.id)!;
    const raw = {
      x: origin.x + pointerNow.x - session.pointer.x,
      y: origin.y + pointerNow.y - session.pointer.y,
    };
    const others = alignmentRects().filter((r) => !session.positions.has(r.id));
    const candidateKey = others
      .map((r) => r.id)
      .sort()
      .join('|');
    if (session.candidateKey !== candidateKey) session.locks = {};
    session.candidateKey = candidateKey;
    const rect = {
      id: node.id,
      ...raw,
      width: node.measured?.width || GROUP_WIDTH,
      height: node.measured?.height || 150,
    };
    const magnetic = magneticSnap(rect, others, rf.getZoom(), session.locks, event.altKey);
    session.locks = magnetic.locks;
    const position = finish
      ? snapRect({ ...rect, ...magnetic.position }, others, rf.getZoom(), event.altKey).position
      : magnetic.position;
    setGuides(finish ? [] : magnetic.guides);
    let dx = position.x - origin.x,
      dy = position.y - origin.y;
    // Restrict a multi-selection by the intersection of all members' allowed motion.
    let minX = -Infinity,
      maxX = Infinity,
      minY = -Infinity,
      maxY = Infinity;
    for (const [id, p] of session.positions) {
      const r = w.regions?.find((r) => r.groupIds.includes(id));
      const n = rf.getNode(id);
      if (!r || !n) continue;
      minX = Math.max(minX, r.position.x + 20 - p.x);
      maxX = Math.min(maxX, r.position.x + r.width - (n.measured?.width ?? GROUP_WIDTH) - 20 - p.x);
      minY = Math.max(minY, r.position.y + 104 - p.y);
      maxY = Math.min(maxY, r.position.y + r.height - (n.measured?.height ?? 150) - 20 - p.y);
    }
    dx = Math.max(minX, Math.min(dx, maxX));
    dy = Math.max(minY, Math.min(dy, maxY));
    const positions = new Map(
      [...session.positions].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]),
    );
    setNodes((ns) =>
      ns.map((n) => (positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n)),
    );
    if (finish) {
      dragging.current = false;
      dragSession.current = null;
      commit(
        (d) => {
          d.groups.forEach((g) => {
            const p = positions.get(g.id);
            if (p) {
              g.position = p;
              if (!d.regions?.some((r) => r.groupIds.includes(g.id))) {
                const n = rf.getNode(g.id);
                const r = d.regions?.find(
                  (r) =>
                    p.x >= r.position.x + 20 &&
                    p.y >= r.position.y + 104 &&
                    p.x + (n?.measured?.width ?? GROUP_WIDTH) <= r.position.x + r.width - 20 &&
                    p.y + (n?.measured?.height ?? 150) <= r.position.y + r.height - 20,
                );
                r?.groupIds.push(g.id);
              }
            }
          });
        },
        true,
        true,
      );
    }
  };
  useEffect(() => {
    const now = new Set(w.groups.filter((g) => isDone(g, w)).map((g) => g.id)),
      fresh = new Set([...now].filter((id) => !previousDone.current.has(id)));
    previousDone.current = now;
    if (fresh.size) {
      setLeaving(fresh);
      notify('整个任务组已完成 · 可撤销');
      const t = setTimeout(() => setLeaving(new Set()), 220);
      return () => clearTimeout(t);
    }
  }, [w.groups, w.tasks]);
  useEffect(() => {
    if (dragging.current) return;
    setNodes((old) => [
      ...(w.regions ?? []).map((r): Node => ({
        id: r.id,
        type: 'region',
        position: r.position,
        width: r.width,
        height: r.height,
        data: {
          edit: () => setRegionMenu(r.id),
          resizeActive: (active: boolean) => {
            dragging.current = active;
          },
        },
        zIndex: -10,
        draggable: false,
        selectable: false,
        connectable: false,
      })),
      ...w.groups
        .filter((g) => !isDone(g, w) || leaving.has(g.id))
        .map((g) => {
          const previous = old.find((n) => n.id === g.id);
          return {
            ...previous,
            id: g.id,
            type: 'group',
            position: g.position,
            width: g.size?.width ?? GROUP_WIDTH,
            height: g.collapsed ? undefined : g.size?.height,
            data: {},
            dragHandle: '.group-header',
            draggable: !readonly,
            selectable: true,
          };
        }),
    ]);
  }, [w.groups, w.tasks, w.regions, readonly, leaving]);
  useEffect(() => {
    if (readonly || dragging.current || !w.regions?.length) return;
    // React Flow reconciles persisted positions on the next render. Do not expand
    // a newly arranged/restored region around the previous render's node positions.
    if (
      nodes.some((n) => {
        if (n.type !== 'group') return false;
        const g = w.groups.find((g) => g.id === n.id);
        return !g || g.position.x !== n.position.x || g.position.y !== n.position.y;
      })
    )
      return;
    const bounds = nodes
      .filter((n) => n.type === 'group' && n.measured?.width && n.measured?.height)
      .map((n) => ({
        id: n.id,
        ...n.position,
        width: n.measured!.width!,
        height: n.measured!.height!,
      }));
    const grown = structuredClone(w.regions);
    grown.forEach((r) => expandRegion(r, bounds));
    if (JSON.stringify(grown) !== JSON.stringify(w.regions))
      commit(
        (d) => {
          d.regions = grown;
        },
        false,
        true,
      );
  }, [nodes, w.groups, w.regions, readonly]);
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive) updateInternals(rf.getNodes().map((n) => n.id));
    });
    return () => {
      alive = false;
    };
  }, []);
  const newPosition = () => {
    const bounds = wrapper.current?.getBoundingClientRect();
    return freePosition(
      rf.screenToFlowPosition({
        x:
          (bounds?.left || 0) +
          Math.max(GROUP_WIDTH / 2, (bounds?.width || 600) / 2) -
          GROUP_WIDTH / 2,
        y: (bounds?.top || 0) + 120,
      }),
      rects(),
    );
  };
  const edges: Edge[] = w.links
    .filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target))
    .map((e) => ({
      ...e,
      type: 'relationship',
      markerEnd: 'todo-arrow',
      data: { edit: () => setEdgeDialog(e.id) },
    }));
  const selected = nodes.filter((n) => n.type === 'group' && n.selected).map((n) => n.id);
  const connect = (c: Connection) => {
    if (validConnection(w, c.source, c.target)) {
      commit(
        (d) => {
          d.links.push({
            id: uid(),
            source: c.source,
            target: c.target,
            sourceHandle: (c.sourceHandle || 'right') as Side,
            targetHandle: (c.targetHandle || 'left') as Side,
            label: '',
          });
        },
        true,
        true,
      );
    } else notify('不能连接自身或重复创建相同方向的关系');
  };
  const completed = w.groups
    .filter((g) => isDone(g, w))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const hits = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLocaleLowerCase();
    return w.groups.flatMap((g) =>
      g.taskIds
        .filter((id) =>
          [g.name, w.tasks[id].title, w.tasks[id].details].some((s) =>
            s.toLocaleLowerCase().includes(q),
          ),
        )
        .map((id) => ({ id, g })),
    );
  }, [query, w]);
  const focusTask = (id: string, g: Group) => {
    setArchive(isDone(g, w));
    setQuery('');
    if (!isDone(g, w)) {
      commit((d) => {
        const a = d.groups.find((x) => x.id === g.id)!;
        a.collapsed = false;
        a.hideCompleted = false;
      }, false);
      setTimeout(() => {
        void rf.setCenter(g.position.x + (g.size?.width ?? GROUP_WIDTH) / 2, g.position.y + 100, {
          zoom: BOARD_ZOOM_BASE,
          duration: 180,
        });
      }, 40);
    }
    openTask(id);
  };
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    setDragTask(null);
    setBlankDrop(false);
    if (readonly) return;
    const over = String(e.over?.id || '');
    if (over.startsWith('group:')) commit((d) => moveTask(d, id, over.slice(6)), true, true);
    else if (w.tasks[over] && over !== id) {
      const target = w.groups.find((g) => g.taskIds.includes(over))!;
      commit((d) => moveTask(d, id, target.id, target.taskIds.indexOf(over)), true, true);
    } else if (over === 'canvas-blank' && pointer.current) {
      const pos = rf.screenToFlowPosition(pointer.current);
      commit(
        (d) => {
          const newId = uid();
          d.groups.push({
            id: newId,
            name: d.tasks[id].title,
            autoName: false,
            finalized: false,
            taskIds: [],
            position: freePosition(pos, rects()),
            collapsed: false,
            hideCompleted: false,
          });
          moveTask(d, id, newId);
        },
        true,
        true,
      );
    }
  };
  const allEmpty = w.groups.length === 0;
  return (
    <BoardContext.Provider
      value={{
        openTask,
        menu: setMenu,
        zoom,
        readonly,
        alignmentRects,
        resizeActive: (active) => {
          dragging.current = active;
        },
        resizePreview: (rect, guides) => {
          resizePreview.current = rect;
          setGuides(guides);
        },
      }}
    >
      <div className="todo-page">
        <div className="page-heading todo-heading">
          <div className="todo-heading-copy">
            <div className="eyebrow">A LITTLE PROGRESS, EVERY DAY</div>
            <h1>
              待办事项
              <span className="heading-dot" />
            </h1>
            <p>把想做的事，放在看得见的地方。</p>
          </div>
          <LongTermGoals />
          <div className="segmented status-tabs">
            <button className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>
              未完成 <span>{w.groups.length - completed.length}</span>
            </button>
            <button className={archive ? 'active' : ''} onClick={() => setArchive(true)}>
              已完成 <span>{completed.length}</span>
            </button>
          </div>
        </div>
        <div className="board-toolbar">
          <button className="button primary" disabled={readonly} onClick={() => setNewGroup(true)}>
            <Plus size={17} />
            新建待办
          </button>
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label="搜索任务"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务、组或正文"
            />
            {query && (
              <IconButton label="清除搜索" onClick={() => setQuery('')}>
                <X size={14} />
              </IconButton>
            )}
            {query && (
              <div className="search-results">
                {hits.length ? (
                  hits.slice(0, 100).map((h) => (
                    <button key={h.id} onClick={() => focusTask(h.id, h.g)}>
                      <span>{w.tasks[h.id].title}</span>
                      <small>
                        {h.g.name} · {isDone(h.g, w) ? '已完成' : '未完成'}
                      </small>
                    </button>
                  ))
                ) : (
                  <p>没有找到相关任务</p>
                )}
                {hits.length > 100 && <small>显示前 100 项，请继续缩小搜索范围</small>}
              </div>
            )}
          </div>
          <div className="toolbar-spacer" />
          {!archive && (
            <>
              <button
                className={'button ghost ' + (drawingRegion ? 'active' : '')}
                disabled={readonly}
                aria-pressed={drawingRegion}
                onClick={() => setDrawingRegion(!drawingRegion)}
              >
                <Scan size={16} />
                框选区域
              </button>
              <button
                className="button ghost"
                disabled={readonly || !nodes.length}
                onClick={() => {
                  commit(
                    (d) =>
                      arrangeRegions(
                        d,
                        rects(),
                        (wrapper.current?.clientWidth || 1000) / rf.getZoom() - 96,
                      ),
                    true,
                    true,
                  );
                  setTimeout(
                    () =>
                      void rf.fitView({
                        padding: 0.15,
                        minZoom: BOARD_MIN_ZOOM,
                        maxZoom: BOARD_ZOOM_BASE,
                        duration: 180,
                      }),
                    50,
                  );
                }}
              >
                <LayoutGrid size={16} />
                整理布局
              </button>
              {selected.length === 2 && (
                <IconButton
                  label="交换选中组位置"
                  disabled={readonly}
                  onClick={() =>
                    commit(
                      (d) => {
                        const a = d.groups.find((g) => g.id === selected[0])!,
                          b = d.groups.find((g) => g.id === selected[1])!;
                        const p = { ...a.position };
                        const an = rf.getNode(a.id),
                          bn = rf.getNode(b.id);
                        a.position = constrainToRegion(
                          d,
                          a.id,
                          b.position,
                          an?.measured?.width ?? GROUP_WIDTH,
                          an?.measured?.height ?? 150,
                        );
                        b.position = constrainToRegion(
                          d,
                          b.id,
                          p,
                          bn?.measured?.width ?? GROUP_WIDTH,
                          bn?.measured?.height ?? 150,
                        );
                      },
                      true,
                      true,
                    )
                  }
                >
                  <ArrowLeftRight />
                </IconButton>
              )}
            </>
          )}
          <div className="toolbar-divider" />
          <IconButton label="撤销" disabled={!canUndo || readonly} onClick={undo}>
            <Undo2 />
          </IconButton>
          <IconButton label="重做" disabled={!canRedo || readonly} onClick={redo}>
            <Redo2 />
          </IconButton>
        </div>
        <div ref={wrapper} className="workspace-stage">
          <div
            className={'canvas-shell ' + (archive ? 'concealed' : '')}
            ref={dropCanvas}
            onPointerMoveCapture={(e) => {
              pointer.current = { x: e.clientX, y: e.clientY };
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={(args) => {
                if (args.pointerCoordinates) {
                  const all = pointerWithin(args);
                  return all.sort(
                    (a, b) =>
                      (String(a.id) === 'canvas-blank'
                        ? 2
                        : String(a.id).startsWith('group:')
                          ? 1
                          : 0) -
                      (String(b.id) === 'canvas-blank'
                        ? 2
                        : String(b.id).startsWith('group:')
                          ? 1
                          : 0),
                  );
                }
                return closestCenter(args);
              }}
              onDragStart={(e) => setDragTask(String(e.active.id))}
              onDragOver={(e) => setBlankDrop(e.over?.id === 'canvas-blank')}
              onDragEnd={onDragEnd}
              onDragCancel={() => {
                setDragTask(null);
                setBlankDrop(false);
              }}
            >
              <CanvasDrop />
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultViewport={initialViewport.current}
                minZoom={BOARD_MIN_ZOOM}
                maxZoom={BOARD_MAX_ZOOM}
                onlyRenderVisibleElements
                panOnDrag={[2]}
                onPaneContextMenu={(e) => e.preventDefault()}
                panActivationKeyCode="Space"
                panOnScroll
                zoomOnScroll={false}
                zoomActivationKeyCode="Control"
                selectionOnDrag
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
                deleteKeyCode={null}
                connectionMode={ConnectionMode.Loose}
                connectionRadius={28}
                connectionLineStyle={{
                  stroke: 'var(--edge)',
                  strokeWidth: 2.2,
                  strokeLinecap: 'round',
                }}
                nodesConnectable={!readonly}
                edgesReconnectable={!readonly}
                onConnect={connect}
                onReconnect={(old, c) => {
                  if (validConnection(w, c.source, c.target, old.id))
                    commit(
                      (d) => {
                        const e = d.links.find((e) => e.id === old.id)!;
                        Object.assign(e, c);
                      },
                      true,
                      true,
                    );
                  else notify('不能连接自身或重复关系');
                }}
                onEdgeClick={(_, edge) => setEdgeDialog(edge.id)}
                onNodesChange={(changes) => {
                  const snapped = resizePreview.current;
                  const adjusted = snapped
                    ? changes.map((c) => {
                        if (!('id' in c) || c.id !== snapped.id) return c;
                        if (c.type === 'dimensions')
                          return {
                            ...c,
                            dimensions: { width: snapped.width, height: snapped.height },
                            setAttributes: true as const,
                          };
                        if (c.type === 'position')
                          return { ...c, position: { x: snapped.x, y: snapped.y } };
                        return c;
                      })
                    : changes;
                  setNodes((ns) => {
                    const next = applyNodeChanges(adjusted, ns);
                    return snapped
                      ? next.map((n) =>
                          n.id === snapped.id
                            ? { ...n, position: { x: snapped.x, y: snapped.y } }
                            : n,
                        )
                      : next;
                  });
                  if (
                    changes.some(
                      (c) =>
                        c.type === 'dimensions' && c.id === snapped?.id && c.resizing === false,
                    )
                  )
                    resizePreview.current = null;
                }}
                onNodeDragStart={startGroupDrag}
                onNodeDrag={(event, node) => updateGroupDrag(event, node)}
                onNodeDragStop={(event, node) => updateGroupDrag(event, node, true)}
                onSelectionDragStart={(event, nodes) => {
                  if (nodes[0]) startGroupDrag(event, nodes[0], nodes);
                }}
                onSelectionDrag={(event, nodes) => {
                  if (nodes[0]) updateGroupDrag(event, nodes[0]);
                }}
                onSelectionDragStop={(event, nodes) => {
                  if (nodes[0]) updateGroupDrag(event, nodes[0], true);
                }}
                onMove={(_, v) => setZoom(v.zoom)}
                onMoveEnd={(_, v) => {
                  if (!readonly)
                    commit(
                      (d) => {
                        d.viewport = v;
                      },
                      false,
                      true,
                    );
                }}
              >
                <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                  <defs>
                    <marker
                      id="todo-arrow"
                      markerUnits="userSpaceOnUse"
                      markerWidth="12"
                      markerHeight="12"
                      viewBox="0 0 12 12"
                      refX="10"
                      refY="6"
                      orient="auto"
                    >
                      <path
                        d="M2,2 L10,6 L2,10"
                        fill="none"
                        stroke="var(--edge)"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </marker>
                  </defs>
                </svg>
                <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--dot)" />
                <Controls
                  position="bottom-right"
                  showInteractive={false}
                  fitViewOptions={{ minZoom: BOARD_MIN_ZOOM, maxZoom: BOARD_ZOOM_BASE }}
                >
                  <ControlButton
                    title="恢复 100%"
                    aria-label="恢复100%缩放"
                    onClick={() => void rf.zoomTo(BOARD_ZOOM_BASE)}
                  >
                    {boardZoomPercent(zoom)}%
                  </ControlButton>
                </Controls>
                <ViewportPortal>
                  <svg className="alignment-guides">
                    {guides.map((g, i) => (
                      <g key={i}>
                        {g.axis === 'x' ? (
                          <line x1={g.value} x2={g.value} y1={g.from} y2={g.to} />
                        ) : (
                          <line y1={g.value} y2={g.value} x1={g.from} x2={g.to} />
                        )}
                        {(g.kind === 'space' || g.label) && (
                          <text
                            style={g.label ? { fontSize: 12 / zoom } : undefined}
                            x={g.axis === 'x' ? g.value : g.from}
                            y={g.axis === 'y' ? g.value : g.from}
                          >
                            {g.label ?? '24'}
                          </text>
                        )}
                      </g>
                    ))}
                  </svg>
                </ViewportPortal>
              </ReactFlow>
              <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
                {dragTask && w.tasks[dragTask] && (
                  <div className="drag-overlay-card">
                    <GripVertical size={16} />
                    {w.tasks[dragTask].title}
                  </div>
                )}
              </DragOverlay>
              {dragTask && blankDrop && (
                <div className="blank-drop-hint">
                  <CornerDownRight size={18} />
                  松开以移至新组
                </div>
              )}
            </DndContext>
            {drawingRegion && !readonly && (
              <RegionDrawing
                onCancel={() => setDrawingRegion(false)}
                onCreate={(box, color) => {
                  const id = uid();
                  const existing = new Set(w.regions?.flatMap((r) => r.groupIds));
                  const inside = rects().filter(
                    (r) =>
                      !existing.has(r.id) &&
                      r.x + r.width / 2 >= box.x &&
                      r.x + r.width / 2 <= box.x + box.width &&
                      r.y + r.height / 2 >= box.y &&
                      r.y + r.height / 2 <= box.y + box.height,
                  );
                  commit(
                    (d) => {
                      const region = {
                        id,
                        name: '区域 ' + ((d.regions?.length ?? 0) + 1),
                        color,
                        position: { x: box.x, y: box.y },
                        width: box.width,
                        height: box.height,
                        groupIds: inside.map((r) => r.id),
                      };
                      expandRegion(region, inside);
                      (d.regions ??= []).push(region);
                    },
                    true,
                    true,
                  );
                  setDrawingRegion(false);
                  setRegionMenu(id);
                }}
              />
            )}
            {!nodes.length && (
              <Empty
                icon={<FolderOpen />}
                heading={allEmpty ? '给想法一个起点' : '这一页，已经轻了下来'}
                action={
                  <button
                    className="button primary"
                    disabled={readonly}
                    onClick={() => setNewGroup(true)}
                  >
                    <Plus size={17} />
                    添加第一件事
                  </button>
                }
              >
                {allEmpty
                  ? '创建一件待办，再把相关的事放在一起。'
                  : '所有任务组都已完成。新的计划，随时可以开始。'}
              </Empty>
            )}
            <div className="canvas-hint">
              <MousePointer2 size={13} />
              右键拖动平移画布 · 拖动组标题移动 · Alt 取消吸附 · Ctrl 滚轮缩放
            </div>
          </div>
          {archive && (
            <div className="archive-view">
              {completed.length ? (
                <>
                  <div className="archive-summary">
                    <CheckCheck size={18} />
                    <span>每一步，都算数。</span>
                    <small>{completed.length} 个已完成任务组</small>
                  </div>
                  {completed.slice(0, limit).map((g) => (
                    <ArchiveGroup key={g.id} g={g} openTask={openTask} menu={() => setMenu(g.id)} />
                  ))}
                  {limit < completed.length && (
                    <button
                      className="button secondary load-more"
                      onClick={() => setLimit(limit + 30)}
                    >
                      继续加载
                    </button>
                  )}
                </>
              ) : (
                <Empty icon={<CheckCheck />} heading="完成的事，会留在这里">
                  组内任务全部勾选后，点击“完成本组”，它就会来到这里。
                </Empty>
              )}
            </div>
          )}
        </div>
      </div>
      {newGroup && (
        <TextDialog
          title="新建待办"
          label="这次，想完成什么？"
          onClose={() => setNewGroup(false)}
          onSubmit={(s) => {
            const p = newPosition();
            commit(
              (d) => {
                addGroup(d, s, p);
              },
              true,
              true,
            );
            setArchive(false);
          }}
        />
      )}
      {regionMenu && <RegionSettings id={regionMenu} onClose={() => setRegionMenu(null)} />}
      {menu && <GroupMenu id={menu} onClose={() => setMenu(null)} />}
      {edgeDialog && <EdgeDialog id={edgeDialog} onClose={() => setEdgeDialog(null)} />}
    </BoardContext.Provider>
  );
}
function CanvasDrop() {
  const { setNodeRef } = useDroppable({ id: 'canvas-blank', data: { kind: 'blank' } });
  return <div ref={setNodeRef} className="canvas-drop-surface" />;
}
function ArchiveGroup({
  g,
  openTask,
  menu,
}: {
  g: Group;
  openTask: (id: string) => void;
  menu: () => void;
}) {
  const { w, commit, readonly } = useWorkspace(),
    [expanded, setExpanded] = useState(false),
    [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  return (
    <section className="archive-group">
      <header>
        <button className="archive-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span>{g.name}</span>
        </button>
        <span className="archive-meta">
          {g.taskIds.length} 项 ·{' '}
          {g.completedAt ? new Date(g.completedAt).toLocaleString('zh-CN') : '完成时间未知'}
        </span>
        <IconButton
          label={'添加到已完成组：' + g.name}
          buttonRef={addButton}
          disabled={readonly}
          onClick={() => {
            setExpanded(true);
            setAdding(!adding);
          }}
        >
          <Plus />
        </IconButton>
        <IconButton label={'设置组：' + g.name} onClick={menu}>
          <MoreHorizontal />
        </IconButton>
      </header>
      {expanded && (
        <div className="archive-members">
          {g.taskIds.map((id) => (
            <div className="archive-task" key={id}>
              <button
                className="task-check"
                aria-label={'恢复任务：' + w.tasks[id].title}
                disabled={readonly}
                onClick={() => commit((d) => toggleTask(d, id), true, true)}
              >
                <span>
                  <Check size={13} />
                </span>
              </button>
              <button onClick={() => openTask(id)}>{w.tasks[id].title}</button>
              <small>
                {w.tasks[id].completedAt
                  ? new Date(w.tasks[id].completedAt!).toLocaleString('zh-CN')
                  : '完成时间未知'}
              </small>
            </div>
          ))}
          <InlineAdd
            triggerRef={addButton}
            open={adding}
            onClose={() => setAdding(false)}
            onAdd={(s) =>
              commit(
                (d) => {
                  addTask(d, g.id, s);
                },
                true,
                true,
              )
            }
          />
          {w.links
            .filter((e) => e.source === g.id || e.target === g.id)
            .map((e) => (
              <p className="relation-summary" key={e.id}>
                <Link2 size={14} />
                {w.groups.find((a) => a.id === e.source)?.name} →{' '}
                {w.groups.find((a) => a.id === e.target)?.name}
                {e.label && ' · ' + e.label}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
function GroupMenu({ id, onClose }: { id: string; onClose: () => void }) {
  const rf = useReactFlow();
  const { w, commit, readonly } = useWorkspace(),
    g = w.groups.find((g) => g.id === id),
    [name, setName] = useState(g?.name || ''),
    [target, setTarget] = useState(''),
    [label, setLabel] = useState('');
  const initialWidth = g?.size?.width ?? GROUP_WIDTH;
  const initialHeight = g?.size?.height ?? Math.max(100, rf.getNode(id)?.measured?.height ?? 100);
  const [sizeWidth, setSizeWidth] = useState(String(initialWidth));
  const [sizeHeight, setSizeHeight] = useState(String(initialHeight));
  if (!g) return null;
  return (
    <Modal title="任务组设置" onClose={onClose}>
      <label className="field">
        组名
        <input
          value={name}
          disabled={readonly}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== g.name)
              commit(
                (d) => {
                  const a = d.groups.find((g) => g.id === id)!;
                  a.name = name.trim();
                  a.autoName = false;
                },
                true,
                true,
              );
          }}
        />
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          disabled={readonly}
          checked={g.collapsed}
          onChange={(e) =>
            commit(
              (d) => {
                d.groups.find((g) => g.id === id)!.collapsed = e.target.checked;
              },
              false,
              true,
            )
          }
        />
        折叠这个组
      </label>
      <div className="settings-section">
        <h3>框体尺寸</h3>
        <p className="muted">选中组后拖动边缘或四角。收起时仅调整宽度，展开后恢复设定高度。</p>
        <div className="group-size-fields">
          <label className="field">
            宽度
            <input
              aria-label="任务组宽度"
              type="number"
              min={240}
              step="any"
              value={sizeWidth}
              disabled={readonly}
              onChange={(e) => setSizeWidth(e.target.value)}
              onBlur={() => {
                const width = Number(sizeWidth);
                if (sizeWidth.trim() && Number.isFinite(width) && width >= 240)
                  commit(
                    (d) => {
                      d.groups.find((a) => a.id === id)!.size = {
                        width,
                        ...(g.size?.height !== undefined ? { height: g.size.height } : {}),
                      };
                    },
                    true,
                    true,
                  );
                else setSizeWidth(String(g.size?.width ?? GROUP_WIDTH));
              }}
            />
          </label>
          <label className="field">
            高度（展开时）
            <input
              aria-label="任务组高度"
              type="number"
              min={100}
              step="any"
              value={sizeHeight}
              placeholder="自动适应内容"
              disabled={readonly}
              onChange={(e) => setSizeHeight(e.target.value)}
              onBlur={() => {
                const height = Number(sizeHeight);
                if (sizeHeight.trim() && Number.isFinite(height) && height >= 100)
                  commit(
                    (d) => {
                      d.groups.find((a) => a.id === id)!.size = {
                        width: g.size?.width ?? GROUP_WIDTH,
                        height,
                      };
                    },
                    true,
                    true,
                  );
                else setSizeHeight(String(g.size?.height ?? initialHeight));
              }}
            />
          </label>
        </div>
        <button
          className="button secondary"
          disabled={readonly}
          onClick={() => {
            commit(
              (d) => {
                delete d.groups.find((a) => a.id === id)!.size;
              },
              true,
              true,
            );
            setSizeWidth(String(GROUP_WIDTH));
            setSizeHeight('');
          }}
        >
          恢复自动尺寸
        </button>
      </div>
      <div className="settings-section">
        <h3>
          <ArrowUpRight size={17} />
          连接到另一个组
        </h3>
        <label className="field">
          目标组
          <select
            aria-label="连接目标组"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={readonly}
          >
            <option value="">选择任务组</option>
            {w.groups
              .filter((a) => validConnection(w, id, a.id))
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                  {isDone(a, w) ? '（已完成）' : ''}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          关系说明（可选）
          <input
            value={label}
            disabled={readonly}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例如：提供结果给"
          />
        </label>
        <button
          className="button secondary"
          disabled={!target || readonly}
          onClick={() => {
            commit(
              (d) => {
                d.links.push({
                  id: uid(),
                  source: id,
                  target,
                  sourceHandle: 'right',
                  targetHandle: 'left',
                  label,
                });
              },
              true,
              true,
            );
            setTarget('');
            setLabel('');
          }}
        >
          <Link2 size={16} />
          添加关系
        </button>
      </div>
      <footer>
        <button
          className="button danger"
          disabled={readonly}
          onClick={() => {
            commit((d) => removeGroup(d, id), true, true);
            onClose();
          }}
        >
          <Trash2 size={16} />
          删除组
        </button>
        <button className="button primary" onClick={onClose}>
          完成
        </button>
      </footer>
    </Modal>
  );
}
function EdgeDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { w, commit, readonly, notify } = useWorkspace(),
    edge = w.links.find((e) => e.id === id),
    [draft, setDraft] = useState(edge);
  if (!edge || !draft) return null;
  return (
    <Modal title="组间关系" onClose={onClose}>
      <p className="muted">箭头只表达关系，不限制任务完成。</p>
      {(['source', 'target'] as const).map((k) => (
        <label className="field" key={k}>
          {k === 'source' ? '起点组' : '终点组'}
          <select
            value={draft[k]}
            disabled={readonly}
            onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
          >
            {w.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className="field-row">
        {(['sourceHandle', 'targetHandle'] as const).map((k) => (
          <label className="field" key={k}>
            {k === 'sourceHandle' ? '起点连接侧' : '终点连接侧'}
            <select
              value={draft[k]}
              disabled={readonly}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value as Side })}
            >
              {sides.map((s, i) => (
                <option value={s} key={s}>
                  {['上', '右', '下', '左'][i]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="field">
        关系说明
        <input
          aria-label="关系说明"
          disabled={readonly}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
      </label>
      <footer>
        <button
          className="button danger"
          disabled={readonly}
          onClick={() => {
            commit(
              (d) => {
                d.links = d.links.filter((e) => e.id !== id);
              },
              true,
              true,
            );
            onClose();
          }}
        >
          删除关系
        </button>
        <button
          className="button primary"
          disabled={readonly}
          onClick={() => {
            if (!validConnection(w, draft.source, draft.target, id)) {
              notify('不能连接自身或重复关系');
              return;
            }
            commit(
              (d) => {
                d.links[d.links.findIndex((e) => e.id === id)] = draft;
              },
              true,
              true,
            );
            onClose();
          }}
        >
          保存
        </button>
      </footer>
    </Modal>
  );
}
export function TodoBoard({ openTask }: { openTask: (id: string) => void }) {
  return (
    <ReactFlowProvider>
      <BoardCanvas openTask={openTask} />
    </ReactFlowProvider>
  );
}
