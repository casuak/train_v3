import { cancelTask, log, uid } from '../sim/game';
import { footprint, LANE_Y } from '../sim/navigation';
import type { Facility, GameState } from '../sim/types';

/** Move a v1 overhead layout into horizontal slots without deleting owned items. */
export function migrateToSideView(s: GameState): void {
  if (s.version !== 1) return;
  for (const p of s.pawns) {
    cancelTask(s, p); // Return carried items before discarding obsolete grid paths.
    p.y = p.lastY = LANE_Y;
    p.status = p.drafted ? '征召 · 等待命令' : '等待重新安排工作';
  }
  const placed: Facility[] = [];
  for (const f of s.facilities) {
    const width = footprint(f).w;
    const oldCar = Math.max(
      0,
      s.cars.findIndex((c) => f.x >= c.x && f.x < c.x + c.width),
    );
    const slots = () =>
      s.cars
        .flatMap((c, index) =>
          Array.from({ length: c.width - width + 1 }, (_, offset) => ({
            x: c.x + offset,
            score: Math.abs(index - oldCar) * 100 + Math.abs(c.x + offset - f.x),
          })),
        )
        .sort((a, b) => a.score - b.score);
    const free = (x: number) =>
      !placed.some(
        (q) =>
          (q.layer === f.layer || q.kind === 'hatch' || f.kind === 'hatch') &&
          x < q.x + footprint(q).w &&
          x + width > q.x,
      );
    let slot = slots().find((p) => free(p.x));
    if (!slot) {
      if (s.cars.length >= 16)
        throw new Error('旧存档设施过多，无法转换为侧视布局；原存档未被修改');
      s.cars.push({
        id: uid(s, 'car'),
        name: '迁移扩展车厢',
        x: s.cars.length * 14,
        width: 12,
        height: 5,
      });
      slot = slots().find((p) => free(p.x))!;
    }
    f.x = slot.x;
    f.y = LANE_Y;
    // The old 90-degree rotation now becomes left/right facing.
    placed.push(f);
  }
  for (const stack of s.stacks) stack.y = LANE_Y;
  s.version = 2;
  log(s, '旅程已转换为横版侧视布局，设施重新排布，携带物资已保留。', 'info');
}
