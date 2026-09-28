import { expect, it } from 'vitest';
import {
  addCar,
  advance,
  allies,
  availableRoutes,
  count,
  depart,
  draft,
  initialState,
  movePawn,
  trade,
} from '../src/sim/game';

function completeRoute(route: string[], attach = false) {
  const s = initialState();
  let routeIndex = 0;
  let lastRaid = 0;
  let battling = false;
  expect(depart(s, route[routeIndex++])).toBeNull();
  for (let i = 0; i < 40000 && s.status === 'playing'; i++) {
    if (s.raidActive && s.raidNumber !== lastRaid) {
      lastRaid = s.raidNumber;
      battling = true;
      const ps = allies(s);
      draft(
        s,
        ps.map((p) => p.id),
        true,
      );
      for (const [j, p] of ps.entries()) movePawn(s, p, { x: 16 + j, y: 1, layer: 'roof' });
    }
    if (battling && !s.raidActive) {
      draft(
        s,
        allies(s).map((p) => p.id),
        false,
      );
      for (const p of allies(s)) movePawn(s, p, { x: 15, y: 1, layer: 'inside' });
      battling = false;
    }
    if (!s.journey && !s.raidActive && routeIndex < route.length) {
      if (attach && s.node === 'yard' && !s.flags.extraCar) expect(addCar(s)).toBeNull();
      const target = route[routeIndex];
      const edge = availableRoutes(s).find((e) => e.destination === target)!;
      while (count(s, 'fuel') < edge.fuel * (1 + (s.cars.length - 3) * 0.12) + 3 && s.credits >= 10)
        expect(trade(s, 'fuel', 10)).toBeNull();
      const err = depart(s, target);
      if (!err) routeIndex++;
    }
    advance(s, 0.05);
  }
  return s;
}
it('使用真实初始资源和武器，南线能完整抵达终点', () => {
  const s = completeRoute(['farm', 'market', 'pass', 'haven']);
  expect(
    s.status,
    JSON.stringify({
      logs: s.logs,
      pawns: s.pawns
        .filter((p) => !p.enemy)
        .map((p) => ({
          name: p.name,
          hp: p.hp,
          hunger: p.hunger,
          energy: p.energy,
          x: p.x,
          y: p.y,
          layer: p.layer,
          status: p.status,
        })),
      time: s.time,
    }),
  ).toBe('won');
  expect(s.stats.battles).toBeGreaterThanOrEqual(2);
  expect(s.stats.meals).toBeGreaterThan(0);
  expect(s.stacks.every((q) => q.qty >= -1e-8)).toBe(true);
});
it('北线可以修复挂接车厢，并在封线前抵达终点', () => {
  const s = completeRoute(['coal', 'yard', 'pass', 'haven'], true);
  expect(s.status, JSON.stringify({ time: s.time, logs: s.logs })).toBe('won');
  expect(s.cars).toHaveLength(4);
  expect(s.flags.extraCar).toBe(true);
});
