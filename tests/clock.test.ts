import { expect, it } from 'vitest';
import { SimulationClock } from '../src/sim/clock';
import { initialState, setSpeed } from '../src/sim/game';
it('1/2/3 倍速在相同模拟时间得到相同结果', () => {
  const states = ([1, 2, 3] as const).map((speed) => {
    const s = initialState(),
      c = new SimulationClock();
    setSpeed(s, speed);
    for (let i = 0; i < 720 / speed; i++) c.frame(s, 1 / 60);
    return s;
  });
  for (const s of states) {
    expect(s.time).toBeCloseTo(12, 8);
    expect(s.pawns).toEqual(states[0].pawns);
    expect(s.stacks).toEqual(states[0].stacks);
  }
});
it('暂停冻结需求、生产和时间，恢复不补算暂停时长', () => {
  const s = initialState(),
    c = new SimulationClock();
  setSpeed(s, 1);
  for (let i = 0; i < 60; i++) c.frame(s, 1 / 60);
  setSpeed(s, 0);
  const before = JSON.stringify(s);
  for (let i = 0; i < 600; i++) c.frame(s, 1 / 60);
  expect(JSON.stringify(s)).toBe(before);
  setSpeed(s, 1);
  c.frame(s, 0.05);
  expect(s.time).toBeCloseTo(1.05);
});
