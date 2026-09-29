import { describe, expect, it } from 'vitest';
import {
  addCar,
  advance,
  allies,
  attackOrder,
  billCanRun,
  build,
  cancelTask,
  count,
  depart,
  deposit,
  draft,
  forceEat,
  forceFacility,
  initialState,
  movePawn,
  spawnRaid,
  take,
  trade,
} from '../src/sim/game';
import { findPath } from '../src/sim/navigation';
import { deserialize, serialize } from '../src/save/storage';
const run = (s: ReturnType<typeof initialState>, secs: number) => {
  for (let n = 0; n < Math.round(secs * 20); n++) advance(s, 0.05);
};
describe('生存与工作', () => {
  it('六人自动生存和生产，库存始终非负', () => {
    const s = initialState();
    run(s, 420);
    expect(s.pawns.filter((p) => !p.enemy && !p.dead)).toHaveLength(6);
    expect(s.stats.meals).toBeGreaterThan(0);
    expect(s.flags.ate).toBe(true);
    expect(s.stacks.every((q) => q.qty >= -1e-9)).toBe(true);
  });
  it('最后一份食物不能被两人同时预约', () => {
    const s = initialState();
    s.stacks = s.stacks.filter((q) => q.item !== 'meal');
    deposit(s, 'meal', 1);
    expect(forceEat(s, s.pawns[0].id)).toBeNull();
    expect(forceEat(s, s.pawns[1].id)).toBeTruthy();
  });
  it('搬运原料中断后保留总量', () => {
    const s = initialState();
    const p = s.pawns[0];
    const f = s.facilities.find((f) => f.kind === 'stove')!;
    expect(forceFacility(s, p.id, f.id)).toBeNull();
    for (const q of s.pawns.slice(1)) q.drafted = true;
    const before = count(s, 'raw');
    run(s, 12);
    const total = count(s, 'raw') + s.stats.meals;
    cancelTask(s, p);
    expect(count(s, 'raw') + s.stats.meals).toBeCloseTo(total);
    expect(count(s, 'raw') + s.stats.meals).toBeCloseTo(before);
  });
  it('征召取消工作并释放预约', () => {
    const s = initialState();
    forceEat(s, s.pawns[0].id);
    draft(s, [s.pawns[0].id], true);
    expect(s.pawns[0].task).toBeNull();
    run(s, 2);
    expect(s.pawns[0].drafted).toBe(true);
    expect(s.pawns[0].task).toBeNull();
  });
  it('生产清单库存数量计入在制品', () => {
    const s = initialState();
    const f = s.facilities.find((f) => f.kind === 'stove')!;
    f.bills[0].target = 11;
    expect(forceFacility(s, s.pawns[0].id, f.id)).toBeNull();
    expect(billCanRun(s, f.bills[0])).toBe(false);
  });
  it('侧视家具沿地板建造且保留横向通行', () => {
    const s = initialState();
    expect(build(s, 'heater', { x: 20, y: 2, layer: 'inside' })).toBeTruthy();
    expect(build(s, 'heater', { x: 18, y: 2, layer: 'inside' })).toBeNull();
    run(s, 90);
    expect(s.facilities.find((f) => f.x === 18 && f.y === 2)?.built).toBe(true);
  });
});
describe('导航与战斗', () => {
  it('友方可跨车厢上车顶，敌人必须破门', () => {
    const s = initialState();
    const from = { x: 18, y: 2, layer: 'roof' as const },
      to = { x: 5, y: 2, layer: 'inside' as const };
    expect(findPath(s, from, to, false)).not.toBeNull();
    expect(findPath(s, from, to, true)).toBeNull();
    s.facilities.find((f) => f.kind === 'hatch')!.hp = 0;
    expect(findPath(s, from, to, true)).not.toBeNull();
  });
  it('迎面移动不会永久堵塞', () => {
    const s = initialState();
    const [a, b] = s.pawns;
    a.x = 4;
    b.x = 8;
    a.y = b.y = 2;
    draft(s, [a.id, b.id], true);
    movePawn(s, a, { x: 8, y: 2, layer: 'inside' });
    movePawn(s, b, { x: 4, y: 2, layer: 'inside' });
    run(s, 5);
    expect(a.x).toBe(8);
    expect(b.x).toBe(4);
  });
  it('无人防守时敌人先破门再进入车内', () => {
    const s = initialState();
    for (const p of s.pawns) p.priorities.repair = 0;
    spawnRaid(s, 1);
    run(s, 30);
    expect(s.logs.some((l) => l.text.includes('舱门被攻破'))).toBe(true);
    expect(s.pawns.some((p) => p.enemy && p.layer === 'inside')).toBe(true);
  });
  it('部署的守卫可在车顶击退敌人', () => {
    const s = initialState();
    for (const [i, p] of allies(s).entries()) {
      p.x = 15 + i;
      p.y = 2;
      p.layer = 'roof';
      p.weapon = 'rifle';
      p.drafted = true;
    }
    spawnRaid(s, 3);
    run(s, 22);
    expect(s.raidActive).toBe(false);
    expect(s.stats.kills).toBe(3);
    expect(s.stats.battles).toBe(1);
  });
  it('指定攻击不会伤害另一层人物', () => {
    const s = initialState();
    spawnRaid(s, 1);
    const p = s.pawns[0];
    draft(s, [p.id], true);
    const e = s.pawns.find((q) => q.enemy)!;
    p.x = e.x;
    p.y = e.y;
    attackOrder(s, p.id, e.id);
    run(s, 0.5);
    expect(e.hp).toBe(58);
  });
});
describe('旅程、交易与存档', () => {
  it('无燃料不能出发，重复到站不重复领补给', () => {
    const s = initialState();
    expect(depart(s, 'farm')).toBeNull();
    s.journey!.raided = true;
    run(s, 191);
    expect(s.node).toBe('farm');
    const before = s.credits;
    expect(depart(s, 'depot')).toBeNull();
    s.journey!.raided = true;
    run(s, 191);
    expect(s.credits).toBe(before);
    s.journey = null;
    for (const q of s.stacks) if (q.item === 'fuel') q.qty = 0;
    expect(depart(s, 'coal')).toBeTruthy();
  });
  it('交易和扩张需要付出资源', () => {
    const s = initialState(),
      c = s.credits;
    expect(trade(s, 'fuel', 10)).toBeNull();
    expect(s.credits).toBe(c - 10);
    s.node = 'yard';
    const before = count(s, 'parts');
    expect(addCar(s)).toBeNull();
    expect(s.cars).toHaveLength(4);
    expect(count(s, 'parts')).toBe(before - 4);
    expect(addCar(s)).toBeTruthy();
  });
  it('存档包含运行中的工作、预约和物资', () => {
    const s = initialState();
    run(s, 12);
    const copy = deserialize(serialize(s));
    expect(copy.pawns).toEqual(s.pawns);
    expect(copy.stacks).toEqual(s.stacks);
    expect(copy.speed).toBe(0);
    run(s, 30);
    run(copy, 30);
    expect(copy.pawns).toEqual(s.pawns);
    expect(copy.stacks).toEqual(s.stacks);
  });
  it('损坏存档给出错误', () => {
    expect(() => deserialize('{}')).toThrow();
    expect(() => deserialize('{bad')).toThrow();
  });
  it('无法消费已被预约的物资', () => {
    const s = initialState();
    s.stacks = s.stacks.filter((q) => q.item !== 'meal');
    deposit(s, 'meal', 1);
    forceEat(s, s.pawns[0].id);
    expect(take(s, 'meal', 1)).toBe(false);
  });
});
