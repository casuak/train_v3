import { LANE_Y } from '../sim/navigation';
import type { Layer, Point } from '../sim/types';

// Screen-space Y grows downward. The simulation stores a single lane per deck.
export const FLOOR_Y: Record<Layer, number> = { inside: 2, roof: -1.8 };
export const layerAtHeight = (y: number): Layer => (y <= FLOOR_Y.roof + 0.12 ? 'roof' : 'inside');
export const sidePoint = (p: Point): Point => ({ ...p, y: FLOOR_Y[p.layer] });
export const lanePoint = (p: Point): Point => ({
  x: Math.round(p.x),
  y: LANE_Y,
  layer: layerAtHeight(p.y),
});
