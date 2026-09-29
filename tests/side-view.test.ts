import { expect, it } from 'vitest';
import {
  advance,
  count,
  draft,
  initialState,
  makeFacility,
  movePawn,
  spawnRaid,
  build,
} from '../src/sim/game';
import { findPath, footprint, neighbors, walkable } from '../src/sim/navigation';
import { deserialize, serialize } from '../src/save/storage';
import { FLOOR_Y, lanePoint, sidePoint } from '../src/render/side-view';

it('同一横坐标的车内和车顶投影到不同高度，点击分别返回正确层', () => {
  const inside = { x: 16, y: 2, layer: 'inside' as const };
  const roof = { ...inside, layer: 'roof' as const };
  expect(sidePoint(roof).y).toBeLessThan(sidePoint(inside).y - 3);
  expect(lanePoint({ ...roof, y: FLOOR_Y.roof - 0.5 })).toEqual(roof);
  expect(lanePoint({ ...inside, y: FLOOR_Y.inside - 0.5 })).toEqual(inside);
});

it('只在各层左右移动，经梯口上下，室内家具不阻挡走道', () => {
  const s = initialState();
  const path = findPath(s, s.pawns[0], { x: 39, y: 2, layer: 'roof' })!;
  expect(path.length).toBeGreaterThan(0);
  expect(path.every((p) => p.y === 2)).toBe(true);
  expect(
    walkable(
      s,
      s.facilities.find((f) => f.kind === 'stove')!,
    ),
  ).toBe(true);
  expect(neighbors(s, { x: 5, y: 2, layer: 'inside' }).map((p) => p.x)).toEqual([6, 4]);
  expect(findPath(s, s.pawns[0], { x: 5, y: 3, layer: 'inside' })).toBeNull();
  const p = s.pawns[0];
  draft(s, [p.id], true);
  movePawn(s, p, { x: 39, y: 2, layer: 'roof' });
  for (let i = 0; i < 600; i++) advance(s, 0.05);
  expect(p).toMatchObject({ x: 39, y: 2, layer: 'roof' });
});

it('左右翻转不改变占地，建造不能放在连接器上', () => {
  const s = initialState();
  expect(build(s, 'stove', { x: 18, y: 2, layer: 'inside' }, 1)).toBeNull();
  expect(footprint(s.facilities.at(-1)!)).toEqual({ w: 2, h: 1 });
  expect(build(s, 'bed', { x: 12, y: 2, layer: 'inside' })).toBeTruthy();
  expect(build(s, 'bed', { x: 8, y: 0, layer: 'inside' })).toBeTruthy();
});

it('无人防守的车顶掩体会被破坏，袭击不会永久卡在单通道', () => {
  const s = initialState();
  for (const p of s.pawns) p.priorities.repair = 0;
  const cover = makeFacility(s, 'barricade', 16, 2, true, 'roof');
  spawnRaid(s, 1);
  for (let i = 0; i < 1400; i++) advance(s, 0.05);
  expect(cover.hp).toBe(0);
  expect(s.pawns.some((p) => p.enemy && p.layer === 'inside')).toBe(true);
});

it('旧俯视存档转换保留人物、设施、物资和旅程，清理旧路径', () => {
  const s = initialState();
  s.version = 1;
  for (const [i, f] of s.facilities.entries()) f.y = i % 2 ? 0 : 4;
  // Two old rows could share an x slot.
  s.facilities[1].x = s.facilities[0].x;
  const p = s.pawns[0];
  p.y = 3;
  p.task = {
    id: 'old-task',
    kind: 'haul',
    stage: 'deliver',
    cargo: [{ item: 'metal', qty: 7 }],
    target: { x: 30, y: 4, layer: 'inside' },
    path: [{ x: 5, y: 4, layer: 'inside' }],
    reservations: [],
    forced: false,
    blocked: 0,
    progress: 0,
    duration: 2,
  };
  const before = count(s, 'metal');
  const migrated = deserialize(serialize(s));
  expect(migrated.version).toBe(2);
  expect(migrated.pawns).toHaveLength(s.pawns.length);
  expect(migrated.facilities.map((f) => f.id)).toEqual(s.facilities.map((f) => f.id));
  expect(count(migrated, 'metal')).toBe(before);
  expect(migrated.node).toBe(s.node);
  expect(migrated.pawns.every((p) => p.y === 2 && p.task === null)).toBe(true);
  expect(migrated.facilities.every((f) => f.y === 2)).toBe(true);
  for (const f of migrated.facilities)
    expect(
      migrated.facilities.some(
        (q) =>
          q.id !== f.id &&
          q.layer === f.layer &&
          q.x < f.x + footprint(f).w &&
          f.x < q.x + footprint(q).w,
      ),
    ).toBe(false);
  expect(() => deserialize(serialize(migrated))).not.toThrow();
});
