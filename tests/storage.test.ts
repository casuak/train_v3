// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { advance, initialState } from '../src/sim/game';
import { deserialize, loadGame, saveGame, serialize } from '../src/save/storage';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('IndexedDB 手动与自动存档独立保存和恢复', async () => {
  const s = initialState();
  advance(s, 0.05);
  await saveGame(s, 'manual-test');
  s.credits += 25;
  await saveGame(s, 'auto-test');
  const a = await loadGame('manual-test'),
    b = await loadGame('auto-test');
  expect(a?.credits).toBe(45);
  expect(b?.credits).toBe(70);
  expect(a?.pawns).toEqual(s.pawns);
  expect(a?.speed).toBe(0);
});
it('导入拒绝越界车厢尺寸和非法标识，保留当前存档', () => {
  const s = initialState();
  s.cars[0].width = 100000;
  expect(() => deserialize(serialize(s))).toThrow();
  const b = initialState();
  b.pawns[0].color = '" onmouseover="alert(1)';
  expect(() => deserialize(serialize(b))).toThrow();
});
it('IndexedDB 恢复可用后读取更新的备用存档', async () => {
  const s = initialState();
  await saveGame(s, 'fallback-recovery');
  vi.stubGlobal('indexedDB', {
    open: () => {
      throw new Error('Unavailable');
    },
  });
  s.credits = 123;
  await saveGame(s, 'fallback-recovery');
  vi.unstubAllGlobals();
  expect((await loadGame('fallback-recovery'))?.credits).toBe(123);
  s.credits = 145;
  await saveGame(s, 'fallback-recovery');
  expect((await loadGame('fallback-recovery'))?.credits).toBe(145);
});
it('导入拒绝缺失坐标或标识的物资', () => {
  const s = initialState();
  const invalid = JSON.parse(serialize(s));
  delete invalid.stacks[0].x;
  delete invalid.stacks[0].id;
  expect(() => deserialize(JSON.stringify(invalid))).toThrow();
});

it.each(['IndexedDB', 'localStorage'])('兼容 v0.1.0 的 %s 存档', async (backend) => {
  const s = initialState();
  s.version = 1;
  const slot = `legacy-${backend}`,
    raw = serialize(s);
  s.credits = 0;
  if (backend === 'localStorage') localStorage.setItem(`wandering-line-v1-${slot}`, raw);
  else
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('wandering-line-v1', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('saves');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const d = open.result,
          t = d.transaction('saves', 'readwrite');
        t.objectStore('saves').put(raw, slot);
        t.oncomplete = () => {
          d.close();
          resolve();
        };
        t.onerror = () => {
          d.close();
          reject(t.error);
        };
      };
    });
  expect((await loadGame(slot))?.credits).toBe(45);
  expect(deserialize(raw).version).toBe(2);
});

it('连续保存按请求顺序完成，读档等待最新保存，快照不受后续修改影响', async () => {
  const s = initialState();
  const first = saveGame(s, 'queued');
  s.credits = 99;
  const second = saveGame(s, 'queued');
  s.credits = 0;
  expect((await loadGame('queued'))?.credits).toBe(99);
  await Promise.all([first, second]);
});

it('写入事务中断后使用备用存储，不悬挂保存请求', async () => {
  const original = IDBDatabase.prototype.transaction;
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    ...args
  ) {
    const t = original.apply(this, args);
    if (t.mode === 'readwrite') queueMicrotask(() => t.abort());
    return t;
  });
  const s = initialState();
  s.credits = 222;
  await saveGame(s, 'aborted');
  expect((await loadGame('aborted'))?.credits).toBe(222);
});

it('两种存储都拒绝写入时明确报告失败', async () => {
  vi.stubGlobal('indexedDB', {
    open: () => {
      throw new Error('Unavailable');
    },
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded');
  });
  await expect(saveGame(initialState(), 'failure')).rejects.toThrow('Quota exceeded');
});
