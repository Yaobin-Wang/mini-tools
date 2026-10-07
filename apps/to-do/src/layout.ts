import type { Point, Side } from './model';
export const GROUP_WIDTH = 296;
export const LAYOUT_GAP = 64;
export type Rect = Point & { id: string; width: number; height: number };
export type Guide = {
  axis: 'x' | 'y';
  value: number;
  from: number;
  to: number;
  kind: 'align' | 'space';
  label?: string;
};
export type ResizeEdges = { left: boolean; right: boolean; top: boolean; bottom: boolean };
export type ResizeLocks = Partial<Record<'width' | 'height', { size: number; guide: Guide }>>;
/** Resize magnets use raw geometry, preserving the opposite edge and screen-space hysteresis. */
export function magneticResize(
  start: Rect,
  raw: Rect,
  edges: ResizeEdges,
  others: Rect[],
  zoom: number,
  locks: ResizeLocks,
  disabled = false,
  minHeight = 100,
) {
  const rect = { ...raw },
    next: ResizeLocks = {},
    guides: Guide[] = [];
  if (disabled) return { rect, locks: next, guides };
  for (const axis of ['width', 'height'] as const) {
    const horizontal = axis === 'width';
    const leading = horizontal ? edges.left : edges.top;
    if (!(leading || (horizontal ? edges.right : edges.bottom))) continue;
    const min = horizontal ? 240 : minHeight;
    const fixed = horizontal
      ? leading
        ? start.x + start.width
        : start.x
      : leading
        ? start.y + start.height
        : start.y;
    const candidates: { size: number; guide: Guide }[] = [];
    for (const other of others) {
      const positions = horizontal
        ? [other.x, other.x + other.width]
        : [other.y, other.y + other.height];
      for (const edge of positions)
        candidates.push({
          size: leading ? fixed - edge : edge - fixed,
          guide: {
            axis: horizontal ? 'x' : 'y',
            value: edge,
            from: horizontal ? Math.min(raw.y, other.y) - 12 : Math.min(raw.x, other.x) - 12,
            to: horizontal
              ? Math.max(raw.y + raw.height, other.y + other.height) + 12
              : Math.max(raw.x + raw.width, other.x + other.width) + 12,
            kind: 'align',
          },
        });
      candidates.push({
        size: other[axis],
        guide: {
          axis: horizontal ? 'y' : 'x',
          value: horizontal ? other.y - 12 : other.x - 12,
          from: horizontal ? other.x : other.y,
          to: horizontal ? other.x + other.width : other.y + other.height,
          kind: 'align',
          label: horizontal ? '等宽' : '等高',
        },
      });
    }
    const held = locks[axis];
    const match = held
      ? Math.abs(raw[axis] - held.size) * zoom <= 12
        ? held
        : undefined
      : candidates
          .filter((c) => c.size >= min && Math.abs(raw[axis] - c.size) * zoom <= 6)
          .sort((a, b) => Math.abs(raw[axis] - a.size) - Math.abs(raw[axis] - b.size))[0];
    if (!match) continue;
    next[axis] = match;
    rect[axis] = match.size;
    if (leading) rect[horizontal ? 'x' : 'y'] = fixed - match.size;
    guides.push(match.guide);
  }
  return { rect, locks: next, guides };
}
export type MagnetLocks = Partial<Record<'x' | 'y', { value: number; guide: Guide }>>;
/** Hysteresis: acquire at 6 screen pixels, release at 12. Never quantize free movement. */
export function magneticSnap(
  moving: Rect,
  others: Rect[],
  zoom: number,
  locks: MagnetLocks,
  disabled = false,
) {
  const position = { x: moving.x, y: moving.y },
    next: MagnetLocks = {},
    guides: Guide[] = [];
  if (disabled) return { position, locks: next, guides };
  const candidate = snapRect(moving, others, zoom);
  for (const axis of ['x', 'y'] as const) {
    const held = locks[axis];
    if (held) {
      if (Math.abs(moving[axis] - held.value) * zoom <= 12) {
        next[axis] = held;
        position[axis] = held.value;
        guides.push(held.guide);
      }
      // Do not immediately latch another nearby guide on the release frame.
      continue;
    }
    const guide = candidate.guides.find((g) => g.axis === axis);
    if (guide) {
      next[axis] = { value: candidate.position[axis], guide };
      position[axis] = candidate.position[axis];
      guides.push(guide);
    }
  }
  return { position, locks: next, guides };
}
export function snapRect(
  moving: Rect,
  others: Rect[],
  zoom: number,
  disabled = false,
): { position: Point; guides: Guide[] } {
  if (disabled) return { position: { x: moving.x, y: moving.y }, guides: [] };
  const threshold = 6 / zoom,
    guides: Guide[] = [];
  let bestX = threshold + 0.001,
    bestY = threshold + 0.001,
    dx = 0,
    dy = 0;
  for (const o of others) {
    for (const mx of [moving.x, moving.x + moving.width / 2, moving.x + moving.width])
      for (const ox of [o.x, o.x + o.width / 2, o.x + o.width]) {
        const d = ox - mx;
        if (Math.abs(d) < bestX) {
          bestX = Math.abs(d);
          dx = d;
          guides[0] = {
            axis: 'x',
            value: ox,
            from: Math.min(moving.y, o.y) - 12,
            to: Math.max(moving.y + moving.height, o.y + o.height) + 12,
            kind: 'align',
          };
        }
      }
    for (const my of [moving.y, moving.y + moving.height / 2, moving.y + moving.height])
      for (const oy of [o.y, o.y + o.height / 2, o.y + o.height]) {
        const d = oy - my;
        if (Math.abs(d) < bestY) {
          bestY = Math.abs(d);
          dy = d;
          guides[1] = {
            axis: 'y',
            value: oy,
            from: Math.min(moving.x, o.x) - 12,
            to: Math.max(moving.x + moving.width, o.x + o.width) + 12,
            kind: 'align',
          };
        }
      }
    for (const x of [o.x + o.width + 24, o.x - moving.width - 24]) {
      const d = x - moving.x;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        dx = d;
        guides[0] = {
          axis: 'x',
          value: x,
          from: Math.min(moving.y, o.y),
          to: Math.max(moving.y + moving.height, o.y + o.height),
          kind: 'space',
        };
      }
    }
    for (const y of [o.y + o.height + 24, o.y - moving.height - 24]) {
      const d = y - moving.y;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        dy = d;
        guides[1] = {
          axis: 'y',
          value: y,
          from: Math.min(moving.x, o.x),
          to: Math.max(moving.x + moving.width, o.x + o.width),
          kind: 'space',
        };
      }
    }
  }
  return {
    position: {
      x: bestX <= threshold ? moving.x + dx : Math.round(moving.x / 16) * 16,
      y: bestY <= threshold ? moving.y + dy : Math.round(moving.y / 16) * 16,
    },
    guides: guides.filter(Boolean),
  };
}
export function arrange(rects: Rect[], availableWidth: number) {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x),
    width = Math.max(GROUP_WIDTH, ...rects.map((r) => r.width)),
    columns = Math.max(1, Math.floor((availableWidth + LAYOUT_GAP) / (width + LAYOUT_GAP))),
    positions: Record<string, Point> = {};
  let y = 0;
  for (let i = 0; i < sorted.length; i += columns) {
    const row = sorted.slice(i, i + columns);
    row.forEach((r, j) => (positions[r.id] = { x: j * (width + LAYOUT_GAP), y }));
    y += Math.max(...row.map((r) => r.height)) + LAYOUT_GAP;
  }
  return positions;
}
export function freePosition(origin: Point, rects: Rect[], height = 150): Point {
  const fits = (p: Point) =>
    !rects.some(
      (r) =>
        p.x < r.x + r.width + LAYOUT_GAP &&
        p.x + GROUP_WIDTH + LAYOUT_GAP > r.x &&
        p.y < r.y + r.height + LAYOUT_GAP &&
        p.y + height + LAYOUT_GAP > r.y,
    );
  if (fits(origin)) return origin;
  for (let ring = 1; ring < 80; ring++)
    for (let x = -ring; x <= ring; x++)
      for (const y of [-ring, ring]) {
        const p = {
          x: origin.x + x * (GROUP_WIDTH + LAYOUT_GAP),
          y: origin.y + y * (height + LAYOUT_GAP),
        };
        if (fits(p)) return p;
      }
  return { x: origin.x, y: Math.max(0, ...rects.map((r) => r.y + r.height)) + LAYOUT_GAP };
}
const extend = (p: Point, side: Side, n: number): Point => ({
  x: p.x + (side === 'right' ? n : side === 'left' ? -n : 0),
  y: p.y + (side === 'bottom' ? n : side === 'top' ? -n : 0),
});
export function segmentBlocked(a: Point, b: Point, rs: Rect[]) {
  return rs.some((r) =>
    a.x === b.x
      ? a.x > r.x &&
        a.x < r.x + r.width &&
        Math.max(a.y, b.y) > r.y &&
        Math.min(a.y, b.y) < r.y + r.height
      : a.y > r.y &&
        a.y < r.y + r.height &&
        Math.max(a.x, b.x) > r.x &&
        Math.min(a.x, b.x) < r.x + r.width,
  );
}
function length(points: Point[]) {
  return points
    .slice(1)
    .reduce((sum, p, i) => sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0);
}
export function route(source: Point, target: Point, ss: Side, ts: Side, rects: Rect[]): Point[] {
  // Facing ports in a narrow corridor need shorter stubs and clearance.
  // Fixed 18px stubs can otherwise begin inside the opposite group.
  const facingGap =
    ss === 'right' && ts === 'left'
      ? target.x - source.x
      : ss === 'left' && ts === 'right'
        ? source.x - target.x
        : ss === 'bottom' && ts === 'top'
          ? target.y - source.y
          : ss === 'top' && ts === 'bottom'
            ? source.y - target.y
            : Infinity;
  const corridor = facingGap > 0 ? facingGap : Infinity;
  const clearance = Math.min(8, corridor / 4);
  const stub = Math.min(18, corridor / 3);
  const a = extend(source, ss, stub),
    b = extend(target, ts, stub),
    obstacles = rects.map((r) => ({
      ...r,
      x: r.x - clearance,
      y: r.y - clearance,
      width: r.width + clearance * 2,
      height: r.height + clearance * 2,
    }));
  const xs = [(a.x + b.x) / 2, ...obstacles.flatMap((r) => [r.x - 8, r.x + r.width + 8])],
    ys = [(a.y + b.y) / 2, ...obstacles.flatMap((r) => [r.y - 8, r.y + r.height + 8])];
  const candidates: Point[][] = [
    [a, { x: b.x, y: a.y }, b],
    [a, { x: a.x, y: b.y }, b],
    ...xs.map((x) => [a, { x, y: a.y }, { x, y: b.y }, b]),
    ...ys.map((y) => [a, { x: a.x, y }, { x: b.x, y }, b]),
  ];
  const best = candidates
    .sort((p, q) => length(p) - length(q))
    .find((ps) => ps.slice(1).every((p, i) => !segmentBlocked(ps[i], p, obstacles)));
  if (best) return compress([source, ...best, target]);
  // Sparse orthogonal visibility grid for paths that need more than two bends.
  const xx = [
      ...new Set([a.x, b.x, ...obstacles.flatMap((r) => [r.x - 8, r.x + r.width + 8])]),
    ].sort((x, y) => x - y),
    yy = [...new Set([a.y, b.y, ...obstacles.flatMap((r) => [r.y - 8, r.y + r.height + 8])])].sort(
      (x, y) => x - y,
    );
  const start = xx.indexOf(a.x) + yy.indexOf(a.y) * xx.length,
    end = xx.indexOf(b.x) + yy.indexOf(b.y) * xx.length;
  const dist = new Map<number, number>([[start, 0]]),
    prev = new Map<number, number>(),
    open = new Set([start]),
    closed = new Set<number>();
  const point = (k: number) => ({ x: xx[k % xx.length], y: yy[Math.floor(k / xx.length)] });
  let budget = xx.length * yy.length;
  while (open.size && budget-- > 0) {
    let key = -1,
      score = Infinity;
    for (const k of open) {
      const p = point(k),
        s = dist.get(k)! + Math.abs(p.x - b.x) + Math.abs(p.y - b.y);
      if (s < score) {
        score = s;
        key = k;
      }
    }
    if (key === end) {
      const ps: Point[] = [];
      let k = end;
      while (k !== start) {
        ps.unshift(point(k));
        k = prev.get(k)!;
      }
      return compress([source, a, ...ps, target]);
    }
    open.delete(key);
    closed.add(key);
    const ix = key % xx.length,
      iy = Math.floor(key / xx.length),
      p = point(key);
    const ns = [
      ...(ix > 0 ? [key - 1] : []),
      ...(ix < xx.length - 1 ? [key + 1] : []),
      ...(iy > 0 ? [key - xx.length] : []),
      ...(iy < yy.length - 1 ? [key + xx.length] : []),
    ];
    for (const n of ns) {
      if (closed.has(n)) continue;
      const q = point(n);
      if (segmentBlocked(p, q, obstacles)) continue;
      const d = dist.get(key)! + Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (d < (dist.get(n) ?? Infinity)) {
        dist.set(n, d);
        prev.set(n, key);
        open.add(n);
      }
    }
  }
  // Overlapping user-positioned groups can enclose a port. Draw outside the scene in that case.
  const outer = Math.min(a.y, b.y, ...rects.map((r) => r.y)) - 48;
  return compress([source, a, { x: a.x, y: outer }, { x: b.x, y: outer }, b, target]);
}
function compress(ps: Point[]) {
  const result: Point[] = [];
  for (const p of ps) {
    if (result.length && result.at(-1)!.x === p.x && result.at(-1)!.y === p.y) continue;
    while (result.length > 1) {
      const a = result[result.length - 2],
        b = result[result.length - 1];
      if (
        (a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0)
      )
        result.pop();
      else break;
    }
    result.push(p);
  }
  return result;
}
export function roundedPath(ps: Point[], radius = 8) {
  if (!ps.length) return '';
  let d = 'M ' + ps[0].x + ' ' + ps[0].y;
  for (let i = 1; i < ps.length - 1; i++) {
    const a = ps[i - 1],
      b = ps[i],
      c = ps[i + 1],
      ab = Math.hypot(b.x - a.x, b.y - a.y),
      bc = Math.hypot(c.x - b.x, c.y - b.y),
      r = Math.min(radius, ab / 2, bc / 2);
    if (!ab || !bc) continue;
    const p = { x: b.x - ((b.x - a.x) / ab) * r, y: b.y - ((b.y - a.y) / ab) * r },
      q = { x: b.x + ((c.x - b.x) / bc) * r, y: b.y + ((c.y - b.y) / bc) * r };
    d += ' L ' + p.x + ' ' + p.y + ' Q ' + b.x + ' ' + b.y + ' ' + q.x + ' ' + q.y;
  }
  return d + ' L ' + ps.at(-1)!.x + ' ' + ps.at(-1)!.y;
}
