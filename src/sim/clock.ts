import { STEP } from './content';
import { advance } from './game';
import type { GameState } from './types';
export class SimulationClock {
  private accumulator = 0;
  reset() {
    this.accumulator = 0;
  }
  frame(state: GameState, realSeconds: number): number {
    if (!state.speed || state.status !== 'playing') {
      this.reset();
      return 0;
    }
    this.accumulator += Math.max(0, Math.min(realSeconds, 0.25)) * state.speed;
    let steps = 0;
    while (this.accumulator + 1e-9 >= STEP && state.speed && steps < 30) {
      advance(state, STEP);
      this.accumulator = Math.max(0, this.accumulator - STEP);
      steps++;
    }
    return steps;
  }
}
