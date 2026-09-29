import { EDGES, FACILITY, NODES, SAVE_VERSION, WORKS } from '../sim/content';
import type { GameState } from '../sim/types';
import { initialState } from '../sim/game';
import { migrateToSideView } from './migrate';
import { LANE_Y } from '../sim/navigation';
const NAME = 'wandering-line-v1';
interface StoredSave {
  format: 'wandering-line-save';
  savedAt: number;
  data: string;
}
const writes = new Map<string, Promise<void>>();
let lastStamp = 0;
async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    let settled = false;
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('saves')) r.result.createObjectStore('saves');
    };
    r.onsuccess = () => {
      if (settled) {
        r.result.close();
        return;
      }
      settled = true;
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => {
      settled = true;
      reject(r.error);
    };
    r.onblocked = () => {
      settled = true;
      reject(new Error('存档数据库被占用'));
    };
  });
}
export function serialize(s: GameState): string {
  return JSON.stringify({ ...s, effects: [] });
}
export function deserialize(raw: string): GameState {
  if (raw.length > 5_000_000) throw new Error('存档超过大小限制');
  const s = JSON.parse(raw) as GameState;
  if (!s || (s.version !== 1 && s.version !== SAVE_VERSION)) throw new Error('不支持此存档版本');
  for (const k of ['pawns', 'cars', 'facilities', 'stacks', 'logs', 'visited'] as const)
    if (!Array.isArray(s[k])) throw new Error('存档结构不完整');
  if (
    !Number.isFinite(s.time) ||
    s.time < 0 ||
    !Number.isInteger(s.nextId) ||
    !s.stats ||
    typeof s.stats !== 'object' ||
    Array.isArray(s.stats) ||
    !s.flags ||
    typeof s.flags !== 'object' ||
    Array.isArray(s.flags) ||
    s.pawns.length > 500 ||
    s.facilities.length > 2000 ||
    s.stacks.length > 5000 ||
    s.logs.length > 1000
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
    s.cars.length > 16 ||
    !validNumber(s.nextId, 1, Number.MAX_SAFE_INTEGER) ||
    !validNumber(s.weather, 0, 1) ||
    !validNumber(s.temperature, -100, 100) ||
    !validNumber(s.raidNumber) ||
    !Number.isInteger(s.raidNumber) ||
    typeof s.raidActive !== 'boolean' ||
    s.visited.some((id) => !NODES.some((n) => n.id === id)) ||
    Object.values(s.flags).some((value) => typeof value !== 'boolean')
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
      !validNumber(s.journey.elapsed, 0, s.journey.duration) ||
      !validNumber(s.journey.fuelCost) ||
      typeof s.journey.raided !== 'boolean' ||
      !EDGES.some(
        (edge) =>
          (edge.from === s.journey!.from && edge.to === s.journey!.to) ||
          (edge.to === s.journey!.from && edge.from === s.journey!.to),
      ))
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
    if (
      !['rifle', 'tool'].includes(p.weapon) ||
      ![-1, 1].includes(p.facing) ||
      [p.drafted, p.enemy, p.dead].some((v) => typeof v !== 'boolean') ||
      !validNumber(p.cooldown) ||
      !validNumber(p.walked) ||
      !validNumber(p.rethink, -1e9) ||
      !validNumber(p.hitAt, -1e9) ||
      !validNumber(p.lastX, -1000, 1000) ||
      !validNumber(p.lastY, -20, 20)
    )
      throw new Error('人物动作数据无效');
    for (const w of WORKS)
      if (
        !validNumber(p.priorities[w], 0, 4) ||
        !Number.isInteger(p.priorities[w]) ||
        !validNumber(p.skills[w], 0, 100)
      )
        throw new Error('工作数据无效');
    if (p.task) {
      const t = p.task;
      if (
        !validId(t.id) ||
        ids.has(t.id) ||
        typeof t.forced !== 'boolean' ||
        !validNumber(t.blocked) ||
        [t.stationId, t.targetId, t.billId].some((id) => id !== undefined && !validId(id)) ||
        (t.recipe !== undefined && !['meal', 'parts'].includes(t.recipe)) ||
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
      ids.add(t.id);
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
      ids.has(f.id) ||
      !Object.hasOwn(FACILITY, f.kind) ||
      !validPoint(f) ||
      !validNumber(f.hp, 0, f.maxHp) ||
      !validNumber(f.maxHp, 1) ||
      !validNumber(f.buildProgress, 0, 1) ||
      ![0, 1].includes(f.rotation) ||
      typeof f.built !== 'boolean' ||
      typeof f.enabled !== 'boolean' ||
      !Array.isArray(f.bills) ||
      f.bills.length > 100
    )
      throw new Error('设施数据无效');
    ids.add(f.id);
    for (const b of f.bills) {
      if (
        !validId(b.id) ||
        ids.has(b.id) ||
        typeof b.enabled !== 'boolean' ||
        !['meal', 'parts'].includes(b.recipe) ||
        !['stock', 'times', 'forever'].includes(b.mode) ||
        !validNumber(b.target, 1, 999) ||
        !validNumber(b.remaining, 0, 999)
      )
        throw new Error('制作清单无效');
      ids.add(b.id);
    }
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
  for (const q of s.stacks) {
    if (
      !validId(q.id) ||
      ids.has(q.id) ||
      !validPoint(q) ||
      typeof q.stored !== 'boolean' ||
      !['meal', 'raw', 'metal', 'parts', 'fuel', 'medicine'].includes(q.item) ||
      !Number.isFinite(q.qty) ||
      q.qty < 0
    )
      throw new Error('物资数据无效');
    ids.add(q.id);
  }
  const base = initialState();
  if (
    s.version === SAVE_VERSION &&
    [
      ...s.pawns,
      ...s.facilities,
      ...s.stacks,
      ...s.pawns.flatMap((p) => (p.task ? [p.task.target, ...p.task.path] : [])),
    ].some((p) => p.y !== LANE_Y)
  )
    throw new Error('侧视楼层坐标无效');
  migrateToSideView(s);
  s.stats = { ...base.stats, ...s.stats };
  s.effects = [];
  s.speed = 0;
  s.lastSpeed = [1, 2, 3].includes(s.lastSpeed) ? s.lastSpeed : 1;
  return s;
}
function storedSave(value: unknown): StoredSave | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || !('format' in parsed))
      return { format: 'wandering-line-save', savedAt: 0, data: value };
    value = parsed;
  }
  const record = value as StoredSave;
  if (
    record.format !== 'wandering-line-save' ||
    !Number.isSafeInteger(record.savedAt) ||
    record.savedAt < 0 ||
    typeof record.data !== 'string'
  )
    throw new Error('存档封装损坏');
  return record;
}

async function writeSave(raw: string, slot: string) {
  const key = `${NAME}-${slot}`;
  try {
    lastStamp = Math.max(lastStamp, storedSave(localStorage.getItem(key))?.savedAt ?? 0);
  } catch {}
  const record: StoredSave = {
    format: 'wandering-line-save',
    savedAt: Math.max(Date.now(), lastStamp + 1),
    data: raw,
  };
  lastStamp = record.savedAt;
  try {
    const d = await db();
    try {
      await new Promise<void>((resolve, reject) => {
        const t = d.transaction('saves', 'readwrite');
        t.oncomplete = () => resolve();
        t.onerror = t.onabort = () => reject(t.error ?? new Error('存档写入中断'));
        t.objectStore('saves').put(record, slot);
      });
    } finally {
      d.close();
    }
    try {
      const fallback = storedSave(localStorage.getItem(key));
      if (!fallback || fallback.savedAt <= record.savedAt) localStorage.removeItem(key);
    } catch {}
  } catch {
    localStorage.setItem(key, JSON.stringify(record));
  }
}

export function saveGame(s: GameState, slot = 'manual'): Promise<void> {
  const raw = serialize(s);
  const pending = (writes.get(slot) ?? Promise.resolve())
    .catch(() => {})
    .then(() => writeSave(raw, slot));
  writes.set(slot, pending);
  const clear = () => {
    if (writes.get(slot) === pending) writes.delete(slot);
  };
  void pending.then(clear, clear);
  return pending;
}
export async function loadGame(slot = 'manual'): Promise<GameState | null> {
  await writes.get(slot)?.catch(() => {});
  const candidates: unknown[] = [];
  let readable = false;
  try {
    const d = await db();
    try {
      candidates.push(
        await new Promise<unknown>((resolve, reject) => {
          const t = d.transaction('saves', 'readonly');
          const r = t.objectStore('saves').get(slot);
          t.oncomplete = () => resolve(r.result);
          t.onerror = t.onabort = () => reject(t.error ?? new Error('存档读取中断'));
        }),
      );
      readable = true;
    } finally {
      d.close();
    }
  } catch {}
  try {
    candidates.push(localStorage.getItem(`${NAME}-${slot}`));
    readable = true;
  } catch {}
  if (!readable) throw new Error('浏览器存储不可用，请导入存档文件');
  const records = candidates.map(storedSave).filter((r): r is StoredSave => r !== null);
  records.sort((a, b) => b.savedAt - a.savedAt);
  if (!records.length) return null;
  lastStamp = Math.max(lastStamp, records[0].savedAt);
  return deserialize(records[0].data);
}
export function exportGame(s: GameState) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serialize(s)], { type: 'application/json' }));
  a.download = '逐温线-旅程存档.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
