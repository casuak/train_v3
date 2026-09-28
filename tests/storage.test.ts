// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { advance, initialState } from '../src/sim/game';
import { deserialize, loadGame, saveGame, serialize } from '../src/save/storage';
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
