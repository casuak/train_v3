export type Layer = 'inside' | 'roof';
export type Item = 'meal' | 'raw' | 'metal' | 'parts' | 'fuel' | 'medicine';
export type Work = 'cook' | 'craft' | 'build' | 'repair' | 'haul' | 'care';
export type FacilityKind =
  'bed' | 'stove' | 'bench' | 'storage' | 'heater' | 'hatch' | 'engine' | 'barricade';
export interface Point {
  x: number;
  y: number;
  layer: Layer;
}
export interface Car {
  id: string;
  name: string;
  x: number;
  width: number;
  height: number;
}
export interface Bill {
  id: string;
  recipe: 'meal' | 'parts';
  mode: 'times' | 'stock' | 'forever';
  target: number;
  remaining: number;
  enabled: boolean;
}
export interface Facility extends Point {
  id: string;
  kind: FacilityKind;
  hp: number;
  maxHp: number;
  built: boolean;
  buildProgress: number;
  bills: Bill[];
  rotation: number;
  enabled: boolean;
}
export interface Stack extends Point {
  id: string;
  item: Item;
  qty: number;
  stored: boolean;
}
export interface Reservation {
  stackId: string;
  qty: number;
}
export interface Cargo {
  item: Item;
  qty: number;
}
export type TaskKind = Work | 'eat' | 'sleep' | 'move' | 'attack';
export interface Task {
  id: string;
  kind: TaskKind;
  target: Point;
  stationId?: string;
  targetId?: string;
  billId?: string;
  recipe?: 'meal' | 'parts';
  stage: 'collect' | 'work' | 'deliver';
  progress: number;
  duration: number;
  path: Point[];
  reservations: Reservation[];
  cargo: Cargo[];
  forced: boolean;
  blocked: number;
}
export interface Pawn extends Point {
  id: string;
  name: string;
  role: string;
  color: string;
  hp: number;
  hunger: number;
  energy: number;
  drafted: boolean;
  enemy: boolean;
  dead: boolean;
  weapon: 'rifle' | 'tool';
  priorities: Record<Work, number>;
  skills: Record<Work, number>;
  task: Task | null;
  status: string;
  cooldown: number;
  rethink: number;
  facing: number;
  walked: number;
  hitAt: number;
  lastX: number;
  lastY: number;
}
export interface Journey {
  from: string;
  to: string;
  elapsed: number;
  duration: number;
  fuelCost: number;
  raided: boolean;
}
export interface LogEntry {
  id: number;
  time: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'danger';
}
export interface Effect {
  id: number;
  kind: 'shot' | 'hit' | 'heal';
  x: number;
  y: number;
  tx: number;
  ty: number;
  layer: Layer;
  until: number;
}
export interface Stats {
  meals: number;
  parts: number;
  builds: number;
  kills: number;
  battles: number;
  trades: number;
  arrivals: number;
  distance: number;
}
export interface GameState {
  version: 1 | 2;
  seed: number;
  nextId: number;
  time: number;
  speed: 0 | 1 | 2 | 3;
  lastSpeed: 1 | 2 | 3;
  cars: Car[];
  pawns: Pawn[];
  facilities: Facility[];
  stacks: Stack[];
  journey: Journey | null;
  node: string;
  visited: string[];
  credits: number;
  logs: LogEntry[];
  effects: Effect[];
  stats: Stats;
  flags: Record<string, boolean>;
  raidActive: boolean;
  raidNumber: number;
  weather: number;
  temperature: number;
  status: 'playing' | 'won' | 'lost';
  distance: number;
}
export interface RouteNode {
  id: string;
  name: string;
  tag: string;
  x: number;
  y: number;
  temp: number;
  description: string;
  reward: Partial<Record<Item, number>>;
  credits?: number;
}
export interface RouteEdge {
  from: string;
  to: string;
  duration: number;
  fuel: number;
  risk: number;
  cold?: boolean;
}
