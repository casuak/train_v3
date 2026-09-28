import { FACILITY } from './content';
import type { Facility, GameState, Point } from './types';
export const key = (p: Point) => `${p.layer}:${Math.round(p.x)},${Math.round(p.y)}`;
export const cell = (p: Point): Point => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
  layer: p.layer,
});
export const distance = (a: Point, b: Point) =>
  a.layer === b.layer ? Math.hypot(a.x - b.x, a.y - b.y) : 1000;
export function footprint(f: Facility): { w: number; h: number } {
  const c = FACILITY[f.kind];
  return f.rotation % 2 ? { w: c.h, h: c.w } : { w: c.w, h: c.h };
}
export function facilityAt(s: GameState, p: Point): Facility | undefined {
  return s.facilities.find((f) => {
    if (f.layer !== p.layer && !(f.kind === 'hatch' && p.layer === 'roof')) return false;
    const d = footprint(f);
    return p.x >= f.x && p.x < f.x + d.w && p.y >= f.y && p.y < f.y + d.h;
  });
}
export function onTrain(s: GameState, p: Point): boolean {
  if (s.cars.some((c) => p.x >= c.x && p.x < c.x + c.width && p.y >= 0 && p.y < c.height))
    return true;
  return (
    p.y === 2 &&
    s.cars.some((c, i) => i < s.cars.length - 1 && p.x >= c.x + c.width && p.x < s.cars[i + 1].x)
  );
}
export function walkable(s: GameState, p: Point): boolean {
  if (!onTrain(s, p)) return false;
  const f = facilityAt(s, p);
  return !f || !f.built || f.hp <= 0 || f.kind === 'hatch' || f.kind === 'storage';
}
export function neighbors(s: GameState, p: Point, enemy = false): Point[] {
  const r: Point[] = [
    { ...p, x: p.x + 1 },
    { ...p, x: p.x - 1 },
    { ...p, y: p.y + 1 },
    { ...p, y: p.y - 1 },
  ].filter((q) => walkable(s, q));
  const h = s.facilities.find((f) => f.kind === 'hatch' && f.x === p.x && f.y === p.y && f.built);
  if (h && (!enemy || h.hp <= 0)) {
    const q: Point = { ...p, layer: p.layer === 'inside' ? 'roof' : 'inside' };
    if (walkable(s, q)) r.push(q);
  }
  return r;
}
export function findPath(s: GameState, from: Point, to: Point, enemy = false): Point[] | null {
  const start = cell(from),
    target = cell(to);
  if (!walkable(s, target)) return null;
  const startKey = key(start),
    endKey = key(target);
  if (startKey === endKey) return [];
  const queue: Point[] = [start],
    prev = new Map<string, Point | null>([[startKey, null]]);
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const p = queue[i];
    for (const n of neighbors(s, p, enemy)) {
      const k = key(n);
      if (prev.has(k)) continue;
      prev.set(k, p);
      if (k === endKey) {
        const path: Point[] = [n];
        let v = p;
        while (key(v) !== startKey) {
          path.push(v);
          v = prev.get(key(v))!;
        }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}
export function approach(
  s: GameState,
  from: Point,
  target: Point,
  enemy = false,
): { point: Point; path: Point[] } | null {
  const candidates = [
    cell(target),
    ...[
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map(([x, y]) => ({
      x: Math.round(target.x) + x,
      y: Math.round(target.y) + y,
      layer: target.layer,
    })),
  ];
  let best: { point: Point; path: Point[] } | null = null;
  for (const p of candidates) {
    const path = findPath(s, from, p, enemy);
    if (path && (!best || path.length < best.path.length)) best = { point: p, path };
  }
  return best;
}
export function lineOfSight(s: GameState, a: Point, b: Point): boolean {
  if (a.layer !== b.layer) return false;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4);
  for (let i = 1; i < n; i++) {
    const p = cell({
      x: a.x + ((b.x - a.x) * i) / n,
      y: a.y + ((b.y - a.y) * i) / n,
      layer: a.layer,
    });
    const f = facilityAt(s, p);
    if (f?.built && f.hp > 0 && f.kind === 'barricade') return false;
  }
  return true;
}
