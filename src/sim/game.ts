import { EDGES, FACILITY, ITEM, NODES, RECIPE, WORKS } from './content';
import {
  approach,
  cell,
  distance,
  facilityAt,
  findPath,
  footprint,
  lineOfSight,
  onTrain,
  walkable,
} from './navigation';
import type {
  Bill,
  Cargo,
  Facility,
  FacilityKind,
  GameState,
  Item,
  Layer,
  Pawn,
  Point,
  Task,
  TaskKind,
  Work,
} from './types';

export const uid = (s: GameState, prefix = 'id') => `${prefix}-${s.nextId++}`;
export function random(s: GameState): number {
  s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function log(
  s: GameState,
  text: string,
  tone: 'info' | 'good' | 'warn' | 'danger' = 'info',
) {
  s.logs.unshift({ id: s.nextId++, time: s.time, text, tone });
  s.logs.length = Math.min(s.logs.length, 80);
}
export function allies(s: GameState) {
  return s.pawns.filter((p) => !p.enemy && !p.dead);
}
export function enemies(s: GameState) {
  return s.pawns.filter((p) => p.enemy && !p.dead);
}
export function count(s: GameState, item: Item, includeCargo = true): number {
  const q = s.stacks.filter((x) => x.item === item).reduce((a, x) => a + x.qty, 0);
  return (
    q +
    (includeCargo
      ? s.pawns
          .flatMap((p) => p.task?.cargo ?? [])
          .filter((c) => c.item === item)
          .reduce((a, x) => a + x.qty, 0)
      : 0)
  );
}
export function reserved(s: GameState, id: string, except?: string): number {
  return s.pawns
    .filter((p) => p.id !== except)
    .flatMap((p) => p.task?.reservations ?? [])
    .filter((r) => r.stackId === id)
    .reduce((a, r) => a + r.qty, 0);
}
function available(s: GameState, item: Item): number {
  return s.stacks
    .filter((q) => q.item === item)
    .reduce((a, q) => a + Math.max(0, q.qty - reserved(s, q.id)), 0);
}
export function take(s: GameState, item: Item, qty: number): boolean {
  if (available(s, item) + 1e-7 < qty) return false;
  for (const stack of s.stacks.filter((q) => q.item === item)) {
    const n = Math.min(qty, Math.max(0, stack.qty - reserved(s, stack.id)));
    stack.qty -= n;
    qty -= n;
    if (qty < 1e-7) break;
  }
  return true;
}
export function deposit(s: GameState, item: Item, qty: number, p?: Point, stored = true) {
  if (qty <= 0) return;
  const point = p ??
    s.facilities.find((f) => f.kind === 'storage' && f.built && f.hp > 0) ?? {
      x: 1,
      y: 2,
      layer: 'inside' as Layer,
    };
  const at = cell(point),
    stack = s.stacks.find(
      (q) =>
        q.item === item &&
        q.x === at.x &&
        q.y === at.y &&
        q.layer === at.layer &&
        q.stored === stored,
    );
  if (stack) stack.qty += qty;
  else s.stacks.push({ id: uid(s, 'stock'), ...at, item, qty, stored });
}
export function makeFacility(
  s: GameState,
  kind: FacilityKind,
  x: number,
  y: number,
  built = true,
  layer: Layer = 'inside',
): Facility {
  const f: Facility = {
    id: uid(s, 'facility'),
    kind,
    x,
    y,
    layer,
    hp: built ? FACILITY[kind].hp : 1,
    maxHp: FACILITY[kind].hp,
    built,
    buildProgress: 0,
    bills: [],
    rotation: 0,
    enabled: true,
  };
  if (kind === 'stove' || kind === 'bench')
    f.bills.push({
      id: uid(s, 'bill'),
      recipe: kind === 'stove' ? 'meal' : 'parts',
      mode: 'stock',
      target: kind === 'stove' ? 14 : 10,
      remaining: 10,
      enabled: true,
    });
  s.facilities.push(f);
  return f;
}
export function initialState(): GameState {
  const s: GameState = {
    version: 1,
    seed: 73029,
    nextId: 1,
    time: 0,
    speed: 0,
    lastSpeed: 1,
    cars: [
      { id: 'car-0', name: '旅人居所', x: 0, width: 12, height: 5 },
      { id: 'car-1', name: '生活工坊', x: 14, width: 12, height: 5 },
      { id: 'car-2', name: '物资货舱', x: 28, width: 12, height: 5 },
    ],
    pawns: [],
    facilities: [],
    stacks: [],
    journey: null,
    node: 'depot',
    visited: ['depot'],
    credits: 45,
    logs: [],
    effects: [],
    stats: {
      meals: 0,
      parts: 0,
      builds: 0,
      kills: 0,
      battles: 0,
      trades: 0,
      arrivals: 0,
      distance: 0,
    },
    flags: {},
    raidActive: false,
    raidNumber: 0,
    weather: 0,
    temperature: 3,
    status: 'playing',
    distance: 0,
  };
  for (const x of [3, 6, 9]) {
    makeFacility(s, 'bed', x, 0);
    makeFacility(s, 'bed', x, 4);
  }
  makeFacility(s, 'storage', 10, 3);
  makeFacility(s, 'heater', 10, 0);
  makeFacility(s, 'hatch', 1, 0);
  makeFacility(s, 'stove', 16, 0);
  makeFacility(s, 'bench', 21, 0);
  makeFacility(s, 'storage', 17, 4);
  makeFacility(s, 'heater', 24, 4);
  makeFacility(s, 'hatch', 15, 0);
  makeFacility(s, 'storage', 30, 0);
  makeFacility(s, 'storage', 33, 4);
  makeFacility(s, 'storage', 36, 0);
  makeFacility(s, 'hatch', 29, 0);
  makeFacility(s, 'engine', 38, 4);
  const roles = ['列车长', '厨师', '机械师', '护卫', '医生', '建造师'];
  const names = ['林舟', '阿禾', '老宋', '陆隼', '苏叶', '乔安'];
  const colors = ['#d7af70', '#92bda8', '#a9afce', '#d59b81', '#c8b8d4', '#a9bd7f'];
  for (let i = 0; i < 6; i++) {
    const priorities: Record<Work, number> = {
      care: 3,
      cook: 3,
      craft: 3,
      build: 3,
      repair: 3,
      haul: 4,
    };
    const skills: Record<Work, number> = {
      care: 2,
      cook: 2,
      craft: 2,
      build: 2,
      repair: 2,
      haul: 4,
    };
    const best: Work[] = ['haul', 'cook', 'craft', 'repair', 'care', 'build'];
    priorities[best[i]] = 1;
    skills[best[i]] = 8;
    s.pawns.push({
      id: uid(s, 'pawn'),
      name: names[i],
      role: roles[i],
      color: colors[i],
      x: [4, 16, 22, 32, 7, 35][i],
      y: 2,
      layer: 'inside',
      hp: 100,
      hunger: [70, 54, 60, 48, 80, 65][i],
      energy: [80, 69, 52, 75, 40, 67][i],
      drafted: false,
      enemy: false,
      dead: false,
      weapon: i === 0 || i === 3 ? 'rifle' : 'tool',
      priorities,
      skills,
      task: null,
      status: '待命',
      cooldown: 0,
      rethink: i * 0.12,
      facing: 1,
      walked: 0,
      hitAt: -100,
      lastX: 0,
      lastY: 0,
    });
  }
  const initial: Record<Item, number> = {
    meal: 10,
    raw: 38,
    metal: 32,
    parts: 6,
    fuel: 58,
    medicine: 8,
  };
  for (const [i, qty] of Object.entries(initial))
    deposit(s, i as Item, qty, {
      x: i === 'raw' || i === 'meal' ? 17 : 30,
      y: i === 'raw' || i === 'meal' ? 4 : 0,
      layer: 'inside',
    });
  deposit(s, 'metal', 6, { x: 35, y: 3, layer: 'inside' }, false);
  log(s, '霜河的冬天正在接近。带领六位旅人，沿铁路向南寻找白桦避风港。', 'good');
  return s;
}

export function cancelTask(s: GameState, p: Pawn) {
  if (p.task) for (const c of p.task.cargo) deposit(s, c.item, c.qty, p, false);
  p.task = null;
  p.rethink = 0.25;
}
function setPath(s: GameState, p: Pawn, t: Task, target: Point): boolean {
  const a = approach(s, p, target, p.enemy);
  if (!a) return false;
  t.target = a.point;
  t.path = a.path;
  t.blocked = 0;
  return true;
}
function task(s: GameState, kind: TaskKind, duration: number, forced = false): Task {
  return {
    id: uid(s, 'task'),
    kind,
    target: { x: 0, y: 0, layer: 'inside' },
    stage: 'work',
    progress: 0,
    duration,
    path: [],
    reservations: [],
    cargo: [],
    forced,
    blocked: 0,
  };
}
function freeStation(s: GameState, id: string, p: Pawn): boolean {
  return !s.pawns.some((q) => q.id !== p.id && q.task?.stationId === id);
}
function materialTask(s: GameState, p: Pawn, t: Task, item: Item, qty: number): boolean {
  const stacks = s.stacks
    .filter((q) => q.item === item && q.qty - reserved(s, q.id) >= qty)
    .sort((a, b) => distance(p, a) - distance(p, b));
  for (const stack of stacks) {
    if (setPath(s, p, t, stack)) {
      t.reservations = [{ stackId: stack.id, qty }];
      t.stage = 'collect';
      p.task = t;
      return true;
    }
  }
  return false;
}
function commitCount(s: GameState, recipe: 'meal' | 'parts'): number {
  return (
    s.pawns.filter((p) => p.task?.recipe === recipe && p.task.stage !== 'deliver').length *
    RECIPE[recipe].outputQty
  );
}
export function billCanRun(s: GameState, b: Bill): boolean {
  return (
    b.enabled &&
    (b.mode === 'forever' ||
      (b.mode === 'times'
        ? b.remaining >
          s.pawns.filter((p) => p.task?.billId === b.id && p.task.stage !== 'deliver').length
        : count(s, RECIPE[b.recipe].output) + commitCount(s, b.recipe) < b.target))
  );
}
function stationTask(s: GameState, p: Pawn, f: Facility, forced = false): boolean {
  if (!freeStation(s, f.id, p) || !approach(s, p, f, p.enemy)) return false;
  if (!f.built) {
    const t = task(s, 'build', 12, forced);
    t.stationId = f.id;
    return materialTask(s, p, t, 'metal', FACILITY[f.kind].cost);
  }
  if (f.hp <= 0 && f.kind !== 'hatch') return false;
  if (f.kind === 'bed') {
    const t = task(s, 'sleep', 30, forced);
    t.stationId = f.id;
    if (setPath(s, p, t, f)) {
      p.task = t;
      return true;
    }
    return false;
  }
  if (f.kind === 'stove' || f.kind === 'bench') {
    const b = f.bills.find((b) => billCanRun(s, b));
    if (!b) return false;
    const r = RECIPE[b.recipe],
      t = task(s, b.recipe === 'meal' ? 'cook' : 'craft', r.duration, forced);
    t.stationId = f.id;
    t.billId = b.id;
    t.recipe = b.recipe;
    return materialTask(s, p, t, r.input, r.inputQty);
  }
  if (f.hp < f.maxHp) {
    const t = task(s, 'repair', 7, forced);
    t.stationId = f.id;
    return materialTask(s, p, t, 'parts', 1);
  }
  return false;
}
export function forceFacility(
  s: GameState,
  pid: string,
  fid: string,
  action?: 'repair' | 'sleep' | 'work',
): string | null {
  const p = s.pawns.find((q) => q.id === pid),
    f = s.facilities.find((q) => q.id === fid);
  if (!p || !f || p.dead || p.enemy) return '人物或设施不可用';
  if (p.drafted) return '先解除征召，再安排工作';
  cancelTask(s, p);
  if (action === 'repair') {
    if (f.hp >= f.maxHp) return '设施状态完好';
    const t = task(s, 'repair', 7, true);
    t.stationId = f.id;
    if (materialTask(s, p, t, 'parts', 1)) {
      p.status = '强制维修';
      return null;
    }
    return '需要可达的维修零件';
  }
  if (stationTask(s, p, f, true)) {
    p.status = '执行强制任务';
    return null;
  }
  return '无可用任务：检查材料、制作清单、通路或占用情况';
}
export function forceEat(s: GameState, pid: string): string | null {
  const p = s.pawns.find((q) => q.id === pid);
  if (!p || p.dead || p.drafted) return '请先选择未征召的旅人';
  cancelTask(s, p);
  return materialTask(s, p, task(s, 'eat', 3, true), 'meal', 1) ? null : '没有可达的口粮';
}
export function movePawn(s: GameState, p: Pawn, target: Point): boolean {
  const path = findPath(s, p, target, p.enemy);
  if (!path) return false;
  cancelTask(s, p);
  const t = task(s, 'move', 0, true);
  t.target = cell(target);
  t.path = path;
  p.task = t;
  return true;
}
export function draft(s: GameState, ids: string[], value: boolean) {
  for (const p of allies(s).filter((p) => ids.includes(p.id))) {
    cancelTask(s, p);
    p.drafted = value;
    p.status = value ? '征召 · 等待命令' : '恢复日常';
    p.rethink = 0;
  }
}
export function attackOrder(s: GameState, pid: string, targetId: string): boolean {
  const p = s.pawns.find((q) => q.id === pid),
    target = s.pawns.find((q) => q.id === targetId && !q.dead);
  if (!p || !p.drafted || !target || !target.enemy) return false;
  cancelTask(s, p);
  const t = task(s, 'attack', 0, true);
  t.targetId = targetId;
  t.target = cell(target);
  p.task = t;
  return true;
}

function chooseTask(s: GameState, p: Pawn) {
  if (p.hunger < 32 && materialTask(s, p, task(s, 'eat', 3), 'meal', 1)) {
    p.status = '寻找口粮';
    return;
  }
  if (p.energy < 27) {
    for (const f of s.facilities
      .filter((f) => f.kind === 'bed' && f.built && f.hp > 0)
      .sort((a, b) => distance(a, p) - distance(b, p)))
      if (stationTask(s, p, f)) {
        p.status = '前往休息';
        return;
      }
    const t = task(s, 'sleep', 50);
    t.target = cell(p);
    p.task = t;
    p.status = '就地休息';
    return;
  }
  if (p.hp < 55 && materialTask(s, p, task(s, 'care', 5), 'medicine', 1)) {
    p.status = '自我包扎';
    return;
  }
  const ws = [...WORKS]
    .filter((w) => p.priorities[w] > 0)
    .sort((a, b) => p.priorities[a] - p.priorities[b] || WORKS.indexOf(a) - WORKS.indexOf(b));
  for (const w of ws) {
    if (w === 'care') {
      const injured = allies(s)
        .filter(
          (q) =>
            q.hp < 75 && !s.pawns.some((r) => r.task?.targetId === q.id && r.task.kind === 'care'),
        )
        .sort((a, b) => a.hp - b.hp)[0];
      if (injured) {
        const t = task(s, 'care', 6);
        t.targetId = injured.id;
        if (materialTask(s, p, t, 'medicine', 1)) {
          p.status = '准备治疗';
          return;
        }
      }
    }
    const fs = s.facilities
      .filter(
        (f) =>
          freeStation(s, f.id, p) &&
          ((w === 'build' && !f.built) ||
            (w === 'repair' && f.built && f.hp < f.maxHp) ||
            (w === 'cook' && f.built && f.kind === 'stove') ||
            (w === 'craft' && f.built && f.kind === 'bench')),
      )
      .sort((a, b) => distance(a, p) - distance(b, p));
    for (const f of fs) {
      if (w === 'repair') {
        const t = task(s, 'repair', 7);
        t.stationId = f.id;
        if (materialTask(s, p, t, 'parts', 1)) {
          p.status = '准备维修';
          return;
        }
      } else if (stationTask(s, p, f)) {
        p.status = '领取工作';
        return;
      }
    }
    if (w === 'haul') {
      for (const q of s.stacks.filter((q) => !q.stored && q.qty > 0 && reserved(s, q.id) === 0)) {
        const t = task(s, 'haul', 1);
        t.targetId = q.id;
        if (setPath(s, p, t, q)) {
          t.reservations = [{ stackId: q.id, qty: q.qty }];
          t.stage = 'collect';
          p.task = t;
          p.status = '搬运物资';
          return;
        }
      }
    }
  }
  p.status = p.hunger < 32 ? '缺少口粮' : p.hp < 55 ? '需要药品' : '待命';
  p.rethink = 1.3;
}
function dropAtStorage(s: GameState, p: Pawn, t: Task): boolean {
  const fs = s.facilities
    .filter((f) => f.kind === 'storage' && f.built && f.hp > 0)
    .sort((a, b) => distance(a, p) - distance(b, p));
  for (const f of fs)
    if (setPath(s, p, t, f)) {
      t.targetId = f.id;
      t.stage = 'deliver';
      return true;
    }
  for (const c of t.cargo) deposit(s, c.item, c.qty, p, false);
  t.cargo = [];
  p.task = null;
  return false;
}
function movement(s: GameState, p: Pawn, t: Task, dt: number): boolean {
  if (!t.path.length) return true;
  const n = t.path[0];
  if (!walkable(s, n)) {
    if (!setPath(s, p, t, t.target)) {
      cancelTask(s, p);
      p.status = '通路被阻挡';
      return false;
    }
  }
  const target = t.path[0];
  if (!target) return true;
  if (target.layer !== p.layer) {
    const h = s.facilities.find(
      (f) => f.kind === 'hatch' && f.x === Math.round(p.x) && f.y === Math.round(p.y),
    );
    if (!h || (p.enemy && h.hp > 0)) {
      t.path = [];
      p.rethink = 0;
      return false;
    }
    p.layer = target.layer;
    p.x = target.x;
    p.y = target.y;
    t.path.shift();
    return false;
  }
  const blocker = s.pawns.find(
    (q) => !q.dead && q.id !== p.id && q.enemy !== p.enemy && distance(q, target) < 0.65,
  );
  if (blocker) {
    t.blocked += dt;
    if (t.blocked > 2) {
      p.rethink = 0;
    }
    return false;
  }
  const dx = target.x - p.x,
    dy = target.y - p.y,
    d = Math.hypot(dx, dy),
    speed = (p.enemy ? 1.35 : 2.15) * (p.hp < 30 ? 0.6 : 1) * (p.energy < 10 ? 0.65 : 1),
    step = Math.min(d, dt * speed);
  if (d < 0.02) {
    p.x = target.x;
    p.y = target.y;
    t.path.shift();
  } else {
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    p.facing = dx < -0.01 ? -1 : dx > 0.01 ? 1 : p.facing;
    p.walked += step;
  }
  return t.path.length === 0;
}
function completeWork(s: GameState, p: Pawn, t: Task) {
  const f = s.facilities.find((f) => f.id === t.stationId);
  if (t.recipe) {
    const r = RECIPE[t.recipe];
    t.cargo = [{ item: r.output, qty: r.outputQty }];
    s.stats[t.recipe === 'meal' ? 'meals' : 'parts'] += r.outputQty;
    const b = f?.bills.find((b) => b.id === t.billId);
    if (b && b.mode === 'times') {
      b.remaining = Math.max(0, b.remaining - 1);
      if (!b.remaining) b.enabled = false;
    }
    dropAtStorage(s, p, t);
    return;
  }
  if (t.kind === 'eat') {
    p.hunger = Math.min(100, p.hunger + 65);
    t.cargo = [];
    s.flags.ate = true;
  }
  if (t.kind === 'care') {
    const patient = s.pawns.find((q) => q.id === t.targetId && !q.dead) ?? p;
    patient.hp = Math.min(100, patient.hp + 45);
    t.cargo = [];
    s.effects.push({
      id: s.nextId++,
      kind: 'heal',
      x: patient.x,
      y: patient.y,
      tx: patient.x,
      ty: patient.y,
      layer: patient.layer,
      until: s.time + 1,
    });
  }
  if (t.kind === 'repair' && f) {
    f.hp = Math.min(f.maxHp, f.hp + 90);
    t.cargo = [];
    s.flags.repaired = true;
  }
  if (t.kind === 'build' && f) {
    f.built = true;
    f.hp = f.maxHp;
    f.buildProgress = 1;
    t.cargo = [];
    s.stats.builds++;
    log(s, `${p.name} 完成了${FACILITY[f.kind].name}。`, 'good');
  }
  p.task = null;
  p.rethink = 0.1;
}
function advanceTask(s: GameState, p: Pawn, dt: number) {
  const t = p.task;
  if (!t) return;
  if (t.stationId && !s.facilities.some((f) => f.id === t.stationId)) {
    cancelTask(s, p);
    return;
  }
  if (t.kind === 'attack') return;
  if (!movement(s, p, t, dt)) {
    p.status =
      t.stage === 'deliver'
        ? '搬运成品'
        : t.kind === 'move'
          ? p.drafted
            ? '战术移动'
            : '移动中'
          : '前往' +
            ({
              eat: '取餐',
              sleep: '床位',
              cook: '厨房',
              craft: '工作台',
              repair: '维修点',
              build: '施工点',
              haul: '物资',
              care: '治疗点',
            }[t.kind] ?? '目标');
    return;
  }
  if (!p.task) return;
  if (t.kind === 'move') {
    p.task = null;
    p.rethink = 0;
    return;
  }
  if (t.stage === 'collect') {
    for (const r of t.reservations) {
      const stack = s.stacks.find((q) => q.id === r.stackId);
      if (!stack || stack.qty + 1e-7 < r.qty) {
        cancelTask(s, p);
        return;
      }
    }
    for (const r of t.reservations) {
      const stack = s.stacks.find((q) => q.id === r.stackId)!;
      stack.qty -= r.qty;
      t.cargo.push({ item: stack.item, qty: r.qty });
    }
    t.reservations = [];
    if (t.kind === 'haul') {
      dropAtStorage(s, p, t);
      return;
    }
    t.stage = 'work';
    const f = s.facilities.find((f) => f.id === t.stationId),
      patient = s.pawns.find((q) => q.id === t.targetId);
    if ((f || patient) && !setPath(s, p, t, (f ?? patient)!)) {
      cancelTask(s, p);
    }
    return;
  }
  if (t.stage === 'deliver') {
    const store = s.facilities.find((f) => f.id === t.targetId && f.built && f.hp > 0);
    if (!store) {
      dropAtStorage(s, p, t);
      return;
    }
    for (const c of t.cargo) deposit(s, c.item, c.qty, store, true);
    t.cargo = [];
    p.task = null;
    p.rethink = 0.1;
    return;
  }
  if (t.kind === 'care' && t.targetId) {
    const patient = s.pawns.find((q) => q.id === t.targetId && !q.dead);
    if (!patient) {
      cancelTask(s, p);
      return;
    }
    if (distance(p, patient) > 1.5) {
      if (!setPath(s, p, t, patient)) cancelTask(s, p);
      return;
    }
  }
  if (t.kind === 'sleep') {
    p.energy = Math.min(100, p.energy + dt * (t.stationId ? 2.8 : 1.25));
    p.status = t.stationId ? '睡眠中' : '就地休息';
    if (p.energy >= 92) {
      p.task = null;
      s.flags.slept = true;
    }
    return;
  }
  const skill = p.skills[t.kind as Work] ?? 0;
  t.progress += dt * (1 + skill * 0.055);
  p.status =
    {
      eat: '正在进食',
      cook: '烹饪热食',
      craft: '制作零件',
      build: '建造中',
      repair: '维修中',
      haul: '搬运中',
      care: '包扎伤口',
    }[t.kind] ?? '工作中';
  const f = s.facilities.find((f) => f.id === t.stationId);
  if (f && !f.built) f.buildProgress = t.progress / t.duration;
  if (t.progress >= t.duration) completeWork(s, p, t);
}

function hurt(s: GameState, target: Pawn, damage: number) {
  target.hp = Math.max(0, target.hp - damage);
  target.hitAt = s.time;
  if (target.hp <= 0) {
    target.dead = true;
    cancelTask(s, target);
    target.status = '已阵亡';
    if (target.enemy) s.stats.kills++;
    else log(s, `${target.name} 在旅途中倒下了。`, 'danger');
  }
}
function shoot(s: GameState, p: Pawn, target: Pawn) {
  if (p.cooldown > 0) return;
  const cover = s.facilities.some(
    (f) => f.kind === 'barricade' && f.built && f.hp > 0 && distance(f, target) < 1.8,
  );
  const damage = (p.enemy ? 7 : p.weapon === 'rifle' ? 15 : 12) * (cover ? 0.65 : 1);
  hurt(s, target, damage);
  p.cooldown = p.weapon === 'rifle' ? 1.3 : 1.0;
  p.facing = target.x < p.x ? -1 : 1;
  s.effects.push({
    id: s.nextId++,
    kind: p.weapon === 'rifle' ? 'shot' : 'hit',
    x: p.x,
    y: p.y,
    tx: target.x,
    ty: target.y,
    layer: p.layer,
    until: s.time + 0.2,
  });
}
function attackMove(s: GameState, p: Pawn, target: Pawn, dt: number) {
  const range = p.weapon === 'rifle' ? 6 : 1.45;
  if (distance(p, target) <= range && lineOfSight(s, p, target)) {
    if (p.task && p.task.kind === 'move') p.task = null;
    p.status = '攻击 ' + target.name;
    shoot(s, p, target);
    return;
  }
  if (!p.task || p.task.kind !== 'attack') p.task = task(s, 'attack', 0);
  const t = p.task;
  if (p.rethink <= 0 || !t.path.length) {
    setPath(s, p, t, target);
    p.rethink = 0.6;
  }
  movement(s, p, t, dt);
  p.status = '接近目标';
}
function combatAI(s: GameState, p: Pawn, dt: number) {
  const ts = s.pawns
    .filter((q) => !q.dead && q.enemy !== p.enemy && q.layer === p.layer)
    .sort((a, b) => distance(a, p) - distance(b, p));
  const manual =
    p.task?.kind === 'attack'
      ? s.pawns.find((q) => q.id === p.task?.targetId && !q.dead)
      : undefined;
  if (manual) {
    attackMove(s, p, manual, dt);
    return;
  }
  const target = ts.find((t) => distance(t, p) < (p.enemy ? 15 : 7) && lineOfSight(s, p, t));
  if (p.enemy) {
    if (target) {
      attackMove(s, p, target, dt);
      return;
    }
    if (p.layer === 'roof') {
      const h = s.facilities
        .filter((f) => f.kind === 'hatch' && f.built)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (!h) return;
      const roof: Point = { x: h.x, y: h.y, layer: 'roof' };
      if (distance(p, roof) < 1.5) {
        p.status = h.hp > 0 ? '破坏舱门' : '侵入车厢';
        if (h.hp > 0) {
          if (p.cooldown <= 0) {
            h.hp = Math.max(0, h.hp - 18);
            p.cooldown = 1.2;
            if (!h.hp) log(s, '车顶舱门被攻破！敌人正在进入车厢。', 'danger');
          }
        } else {
          p.layer = 'inside';
          p.x = h.x;
          p.y = h.y;
          p.task = null;
          p.rethink = 0;
        }
        return;
      }
      if (!p.task || p.rethink <= 0) {
        const t = task(s, 'move', 0);
        if (setPath(s, p, t, roof)) p.task = t;
        p.rethink = 1;
      }
      if (p.task) movement(s, p, p.task, dt);
      p.status = '寻找舱门';
      return;
    }
    const far = ts[0];
    if (far) {
      attackMove(s, p, far, dt);
      return;
    }
    const engine = s.facilities.find((f) => f.kind === 'engine');
    if (engine) {
      if (distance(p, engine) < 1.5) {
        if (p.cooldown <= 0) {
          engine.hp = Math.max(0, engine.hp - 10);
          p.cooldown = 1.2;
        }
        p.status = '破坏动力';
      } else {
        if (!p.task || p.rethink <= 0) {
          const t = task(s, 'move', 0);
          setPath(s, p, t, engine);
          p.task = t;
          p.rethink = 1;
        }
        if (p.task) movement(s, p, p.task, dt);
      }
    }
    return;
  }
  if (p.task?.kind === 'move') {
    advanceTask(s, p, dt);
    if (target && p.weapon === 'rifle' && distance(p, target) <= 6) shoot(s, p, target);
    return;
  }
  if (target) {
    attackMove(s, p, target, dt);
  } else {
    if (p.task?.kind === 'attack') p.task = null;
    p.status = '征召 · 警戒';
  }
}
export function spawnRaid(s: GameState, size = 3) {
  if (s.raidActive || s.status !== 'playing') return;
  s.raidActive = true;
  s.raidNumber++;
  const car = s.cars[Math.min(1, s.cars.length - 1)];
  for (let i = 0; i < size; i++) {
    const p: Pawn = {
      id: uid(s, 'raider'),
      name: `劫掠者 ${i + 1}`,
      role: '登车敌人',
      color: '#d7846d',
      x: car.x + 4 + i * 2,
      y: 4,
      layer: 'roof',
      hp: 58,
      hunger: 100,
      energy: 100,
      drafted: true,
      enemy: true,
      dead: false,
      weapon: 'tool',
      priorities: { cook: 0, craft: 0, build: 0, repair: 0, haul: 0, care: 0 },
      skills: { cook: 0, craft: 0, build: 0, repair: 0, haul: 0, care: 0 },
      task: null,
      status: '跳上车顶',
      cooldown: 0,
      rethink: 1.2,
      facing: -1,
      walked: 0,
      hitAt: s.time,
      lastX: 0,
      lastY: 0,
    };
    s.pawns.push(p);
  }
  s.speed = 0;
  log(s, `${size} 名劫掠者跳上车顶！游戏已暂停，请征召旅人并部署防守。`, 'danger');
}
function finishRaid(s: GameState) {
  if (s.raidActive && !enemies(s).length) {
    s.raidActive = false;
    s.stats.battles++;
    deposit(s, 'metal', 5, { x: 18, y: 3, layer: 'roof' }, false);
    deposit(s, 'fuel', 6);
    s.credits += 12;
    log(s, '袭击已被击退。获得 6 燃煤、5 废钢和 12 票券。解除征召，让旅人休整。', 'good');
  }
}

export function availableRoutes(s: GameState) {
  return EDGES.filter((e) => e.from === s.node || e.to === s.node).map((e) => ({
    ...e,
    destination: e.from === s.node ? e.to : e.from,
  }));
}
export function depart(s: GameState, to: string): string | null {
  if (s.journey) return '列车正在行驶';
  if (s.raidActive) return '先处理登车敌人';
  const e = availableRoutes(s).find((e) => e.destination === to);
  if (!e) return '该车站没有直达线路';
  if (e.cold && s.time >= 1100) return '寒潮已经封锁这条山地线路';
  const factor = 1 + Math.max(0, s.cars.length - 3) * 0.12,
    need = e.fuel * factor;
  if (available(s, 'fuel') < need) return `燃煤不足，需要至少 ${Math.ceil(need)} 单位`;
  if ((s.facilities.find((f) => f.kind === 'engine')?.hp ?? 0) < 30)
    return '动力机组严重损坏，请先维修';
  s.journey = { from: s.node, to, elapsed: 0, duration: e.duration, fuelCost: need, raided: false };
  log(
    s,
    `列车驶向${NODES.find((n) => n.id === to)!.name}。预计 ${Math.round(e.duration / 60)} 分钟现实时间（1 倍速）。`,
  );
  s.flags.departed = true;
  return null;
}
function arrive(s: GameState) {
  const j = s.journey!;
  s.node = j.to;
  s.journey = null;
  s.stats.arrivals++;
  const n = NODES.find((n) => n.id === s.node)!;
  if (!s.visited.includes(n.id)) {
    s.visited.push(n.id);
    for (const [i, q] of Object.entries(n.reward)) deposit(s, i as Item, q!);
    s.credits += n.credits ?? 0;
    if (n.id === 'yard') log(s, '编组站发现一节遗弃货厢，可在站点面板中修复挂接。', 'good');
  }
  log(s, `抵达${n.name}。${n.description}`, 'good');
  s.speed = 0;
}
export function trade(s: GameState, item: Item, amount: number, buy = true): string | null {
  if (s.journey) return '请先在车站停靠';
  const price: Record<Item, number> = { fuel: 1, raw: 1, meal: 2, metal: 2, parts: 4, medicine: 5 };
  const total = price[item] * amount;
  if (buy) {
    if (s.credits < total) return '票券不足';
    s.credits -= total;
    deposit(s, item, amount);
  } else {
    if (!take(s, item, amount)) return '没有足够的未预约物资';
    s.credits += Math.floor(total * 0.6);
  }
  s.stats.trades++;
  log(s, `${buy ? '购入' : '售出'} ${amount} ${ITEM[item].name}。`, 'good');
  return null;
}
export function addCar(s: GameState): string | null {
  if (s.node !== 'yard' || s.journey) return '需要停靠旧编组站';
  if (s.flags.extraCar) return '这节车厢已经挂接';
  if (!take(s, 'parts', 4)) return '修复车厢需要 4 个零件';
  const x = s.cars.length * 14;
  s.cars.push({ id: uid(s, 'car'), name: '新生货厢', x, width: 12, height: 5 });
  makeFacility(s, 'hatch', x + 1, 0);
  makeFacility(s, 'storage', x + 9, 4);
  s.flags.extraCar = true;
  log(s, '新车厢挂接完成！空间扩大，旅行燃料消耗增加 12%。', 'good');
  return null;
}
export function build(s: GameState, kind: FacilityKind, p: Point, rotation = 0): string | null {
  const def = FACILITY[kind];
  if (!def.buildable) return '该设施不能建造';
  if (kind === 'barricade' && p.layer !== 'roof') return '掩体需要建在车顶';
  if (kind !== 'barricade' && p.layer !== 'inside') return '该设施需要建在车内';
  const w = rotation % 2 ? def.h : def.w,
    h = rotation % 2 ? def.w : def.h;
  for (let x = p.x; x < p.x + w; x++)
    for (let y = p.y; y < p.y + h; y++) {
      const q = { x, y, layer: p.layer };
      if (
        !onTrain(s, q) ||
        facilityAt(s, q) ||
        s.pawns.some((a) => !a.dead && distance(a, q) < 0.6)
      )
        return '位置被占用或超出车厢';
      if (y === 2) return '保留中央通道，避免阻断列车通行';
    }
  if (available(s, 'metal') < def.cost) return `需要 ${def.cost} 废钢`;
  const f = makeFacility(s, kind, p.x, p.y, false, p.layer);
  f.rotation = rotation;
  s.flags.blueprint = true;
  log(s, `已规划${def.name}，等待建造师取料施工。`);
  return null;
}
export function dismantle(s: GameState, id: string): string | null {
  const f = s.facilities.find((q) => q.id === id);
  if (!f || !FACILITY[f.kind].buildable) return '该设施不可拆除';
  for (const p of s.pawns) if (p.task?.stationId === id) cancelTask(s, p);
  if (f.built) deposit(s, 'metal', Math.floor(FACILITY[f.kind].cost * 0.5), f, false);
  s.facilities = s.facilities.filter((q) => q.id !== id);
  return null;
}
export function setSpeed(s: GameState, speed: 0 | 1 | 2 | 3) {
  s.speed = speed;
  if (speed) s.lastSpeed = speed;
}
export function togglePause(s: GameState) {
  setSpeed(s, s.speed ? 0 : s.lastSpeed);
}
export function temperature(s: GameState, layer: Layer): number {
  const heated =
    s.facilities.some((f) => f.kind === 'heater' && f.built && f.enabled && f.hp > 0) &&
    count(s, 'fuel') > 0.1;
  return s.temperature + (layer === 'inside' && heated ? 12 : 0);
}
export function advance(s: GameState, dt: number) {
  if (s.status !== 'playing') return;
  s.time += dt;
  s.effects = s.effects.filter((e) => e.until > s.time);
  const a = NODES.find((n) => n.id === (s.journey?.from ?? s.node))!,
    b = NODES.find((n) => n.id === (s.journey?.to ?? s.node))!,
    r = s.journey ? s.journey.elapsed / s.journey.duration : 0;
  s.weather = Math.max(0, Math.min(1, (s.time - 400) / 650));
  s.temperature = a.temp + (b.temp - a.temp) * r - s.weather * 8;
  if (s.time > 400 && !s.flags.coldWarning) {
    s.flags.coldWarning = true;
    log(s, '寒潮开始南下。车顶温度降低，北部山线将在第 3 日封锁。', 'warn');
  }
  const heater = s.facilities.filter(
    (f) => f.kind === 'heater' && f.built && f.enabled && f.hp > 0,
  ).length;
  if (s.temperature < 8 && heater) take(s, 'fuel', dt * 0.003 * heater);
  if (s.journey) {
    const j = s.journey,
      hp = s.facilities.find((f) => f.kind === 'engine')?.hp ?? 0;
    if (hp >= 30 && take(s, 'fuel', (dt * j.fuelCost) / j.duration)) {
      const step = dt * (hp < 100 ? 0.65 : 1);
      j.elapsed += step;
      s.distance += step * 0.12;
      s.stats.distance = s.distance;
      const e = EDGES.find(
        (e) => (e.from === j.from && e.to === j.to) || (e.from === j.to && e.to === j.from),
      )!;
      if (!j.raided && j.elapsed > j.duration * 0.52 && !s.raidActive) {
        j.raided = true;
        if (e.risk > 0.5 || s.stats.battles === 0) spawnRaid(s, e.risk > 0.8 ? 4 : 3);
      }
      if (j.elapsed >= j.duration) arrive(s);
    } else if (!s.flags.stranded) {
      s.flags.stranded = true;
      log(s, '列车停止前进：检查燃煤和动力机组。可使用应急搜集补充燃煤。', 'danger');
    }
  }
  for (const p of s.pawns) {
    if (p.dead) continue;
    p.lastX = p.x;
    p.lastY = p.y;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.rethink -= dt;
    if (!p.enemy) {
      p.hunger = Math.max(0, p.hunger - dt * 0.075);
      p.energy = Math.max(0, p.energy - dt * (p.drafted ? 0.065 : 0.045));
      if (!p.hunger) hurt(s, p, dt * 0.22);
      if (!p.energy) hurt(s, p, dt * 0.1);
      if (temperature(s, p.layer) < -5) hurt(s, p, dt * 0.055);
      if (p.dead) continue;
      if (
        !p.drafted &&
        p.task?.kind !== 'eat' &&
        p.task?.kind !== 'sleep' &&
        (p.hunger < 10 || p.energy < 8)
      )
        cancelTask(s, p);
    }
    if (p.enemy || p.drafted) {
      combatAI(s, p, dt);
      continue;
    }
    const threat = enemies(s).find((e) => distance(e, p) < 1.5);
    if (threat) {
      if (p.cooldown <= 0) {
        shoot(s, p, threat);
      }
      p.status = '遭到袭击 · 自卫';
      continue;
    }
    if (!p.task && p.rethink <= 0) chooseTask(s, p);
    if (p.task) advanceTask(s, p, dt);
  }
  finishRaid(s);
  if (!allies(s).length) {
    s.status = 'lost';
    s.speed = 0;
    log(s, '所有旅人都倒下了。这趟迁徙在此结束。', 'danger');
  } else if (s.node === 'haven' && !s.raidActive && !s.journey) {
    s.status = 'won';
    s.speed = 0;
    log(s, '抵达白桦避风港。你们带着彼此，穿过了这个冬天。', 'good');
  }
}
export function emergencyFuel(s: GameState): string | null {
  if (s.raidActive) return '战斗期间不能派出搜集队';
  if (count(s, 'fuel') > 8) return '燃料储备充足，无需应急搜集';
  const workers = allies(s).filter((p) => !p.drafted);
  if (!workers.length) return '需要至少一位未征召的旅人';
  if (s.flags.emergencyUsed) return '本次旅程的应急燃料已搜集';
  s.flags.emergencyUsed = true;
  for (const p of workers) {
    p.energy = Math.max(0, p.energy - 18);
    p.hunger = Math.max(0, p.hunger - 12);
  }
  deposit(s, 'fuel', 25);
  s.flags.stranded = false;
  log(s, '搜集队找到了 25 单位燃料，体力与口粮储备有所消耗。', 'warn');
  return null;
}
