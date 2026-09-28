import { FACILITY, NODES, SAVE_VERSION, WORKS } from '../sim/content';
import type { GameState } from '../sim/types';
import { initialState } from '../sim/game';
const NAME = 'wandering-line-v1';
async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('saves');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export function serialize(s: GameState): string {
  return JSON.stringify({ ...s, effects: [] });
}
export function deserialize(raw: string): GameState {
  if (raw.length > 5_000_000) throw new Error('存档超过大小限制');
  const s = JSON.parse(raw) as GameState;
  if (!s || s.version !== SAVE_VERSION) throw new Error('不支持此存档版本');
  for (const k of ['pawns', 'cars', 'facilities', 'stacks', 'logs', 'visited'] as const)
    if (!Array.isArray(s[k])) throw new Error('存档结构不完整');
  if (
    !Number.isFinite(s.time) ||
    s.time < 0 ||
    !Number.isInteger(s.nextId) ||
    !s.stats ||
    !s.flags ||
    s.pawns.length > 500 ||
    s.facilities.length > 2000
  )
    throw new Error('存档数据无效');
  if (!['playing', 'won', 'lost'].includes(s.status) || !s.cars.length)
    throw new Error('存档状态无效');
  const validNumber = (v: unknown, min = 0, max = 1e9) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const validId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
  const validPoint = (p: { x: number; y: number; layer: string }) =>
    p &&
    validNumber(p.x, -1000, 1000) &&
    validNumber(p.y, -20, 20) &&
    ['inside', 'roof'].includes(p.layer);
  if (
    !validNumber(s.seed, 0, 4294967295) ||
    !validNumber(s.credits) ||
    !validNumber(s.distance) ||
    !NODES.some((n) => n.id === s.node) ||
    s.cars.length > 16
  )
    throw new Error('旅程数据无效');
  for (const [i, c] of s.cars.entries())
    if (
      !validId(c.id) ||
      c.x !== i * 14 ||
      c.width !== 12 ||
      c.height !== 5 ||
      typeof c.name !== 'string' ||
      c.name.length > 80
    )
      throw new Error('车厢数据无效');
  if (
    s.journey &&
    (!NODES.some((n) => n.id === s.journey!.from) ||
      !NODES.some((n) => n.id === s.journey!.to) ||
      !validNumber(s.journey.duration, 0.1, 10000) ||
      !validNumber(s.journey.elapsed) ||
      !validNumber(s.journey.fuelCost))
  )
    throw new Error('线路数据无效');
  const ids = new Set<string>();
  for (const p of s.pawns) {
    if (
      !validId(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      p.name.length > 80 ||
      !validPoint(p) ||
      !validNumber(p.hp, 0, 100) ||
      !validNumber(p.hunger, 0, 100) ||
      !validNumber(p.energy, 0, 100) ||
      !p.priorities ||
      !p.skills ||
      typeof p.color !== 'string' ||
      !/^#[a-fA-F0-9]{6}$/.test(p.color) ||
      typeof p.role !== 'string' ||
      p.role.length > 80 ||
      typeof p.status !== 'string' ||
      p.status.length > 200
    )
      throw new Error('人物数据无效');
    ids.add(p.id);
    for (const w of WORKS)
      if (!validNumber(p.priorities[w], 0, 4) || !validNumber(p.skills[w], 0, 100))
        throw new Error('工作数据无效');
    if (p.task) {
      const t = p.task;
      if (
        !Array.isArray(t.cargo) ||
        !Array.isArray(t.path) ||
        !Array.isArray(t.reservations) ||
        !validPoint(t.target) ||
        !validNumber(t.progress) ||
        !validNumber(t.duration) ||
        t.path.length > 4000 ||
        t.path.some((q) => !validPoint(q)) ||
        !['collect', 'work', 'deliver'].includes(t.stage) ||
        ![
          'care',
          'cook',
          'craft',
          'build',
          'repair',
          'haul',
          'eat',
          'sleep',
          'move',
          'attack',
        ].includes(t.kind)
      )
        throw new Error('任务数据无效');
      for (const c of t.cargo)
        if (
          !['meal', 'raw', 'metal', 'parts', 'fuel', 'medicine'].includes(c.item) ||
          !validNumber(c.qty)
        )
          throw new Error('搬运数据无效');
      for (const r of t.reservations)
        if (!validId(r.stackId) || !validNumber(r.qty)) throw new Error('预约数据无效');
    }
  }
  for (const f of s.facilities) {
    if (
      !validId(f.id) ||
      !Object.hasOwn(FACILITY, f.kind) ||
      !validPoint(f) ||
      !validNumber(f.hp) ||
      !validNumber(f.maxHp, 1) ||
      !Array.isArray(f.bills) ||
      f.bills.length > 100
    )
      throw new Error('设施数据无效');
    for (const b of f.bills)
      if (
        !validId(b.id) ||
        !['meal', 'parts'].includes(b.recipe) ||
        !['stock', 'times', 'forever'].includes(b.mode) ||
        !validNumber(b.target, 1, 999) ||
        !validNumber(b.remaining, 0, 999)
      )
        throw new Error('制作清单无效');
  }
  for (const l of s.logs)
    if (
      typeof l.text !== 'string' ||
      l.text.length > 4000 ||
      !validNumber(l.time) ||
      !['info', 'good', 'warn', 'danger'].includes(l.tone)
    )
      throw new Error('日志数据无效');
  for (const v of Object.values(s.stats)) if (!validNumber(v)) throw new Error('统计数据无效');
  for (const q of s.stacks)
    if (
      !['meal', 'raw', 'metal', 'parts', 'fuel', 'medicine'].includes(q.item) ||
      !Number.isFinite(q.qty) ||
      q.qty < 0
    )
      throw new Error('物资数据无效');
  const base = initialState();
  s.stats = { ...base.stats, ...s.stats };
  s.effects = [];
  s.speed = 0;
  s.lastSpeed = [1, 2, 3].includes(s.lastSpeed) ? s.lastSpeed : 1;
  return s;
}
export async function saveGame(s: GameState, slot = 'manual'): Promise<void> {
  const raw = serialize(s);
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction('saves', 'readwrite');
      t.objectStore('saves').put(raw, slot);
      t.oncomplete = () => {
        d.close();
        resolve();
      };
      t.onerror = () => {
        d.close();
        reject(t.error);
      };
    });
  } catch {
    localStorage.setItem(`${NAME}-${slot}`, raw);
  }
}
export async function loadGame(slot = 'manual'): Promise<GameState | null> {
  let raw: string | undefined;
  try {
    const d = await db();
    raw = await new Promise<string | undefined>((resolve, reject) => {
      const t = d.transaction('saves', 'readonly');
      const r = t.objectStore('saves').get(slot);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    d.close();
  } catch {}
  raw ??= localStorage.getItem(`${NAME}-${slot}`) ?? undefined;
  return raw ? deserialize(raw) : null;
}
export function exportGame(s: GameState) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serialize(s)], { type: 'application/json' }));
  a.download = '逐温线-旅程存档.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
