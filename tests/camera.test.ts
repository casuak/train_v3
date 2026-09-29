// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrainScene } from '../src/render/scene';
import { depart, initialState, setSpeed } from '../src/sim/game';
import { SimulationClock } from '../src/sim/clock';

// These tests exercise Three.js camera math, not a browser or a WebGL context.
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      setPixelRatio() {}
      setClearColor() {}
      setSize() {}
      render() {}
    },
  };
});

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
    },
  );
  vi.stubGlobal('devicePixelRatio', 1);
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
    () => new THREE.Texture({ width: 16, height: 16 } as HTMLImageElement),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    measureText: (value: string) => ({ width: value.length * 20 }),
    beginPath() {},
    roundRect() {},
    fill() {},
    fillText() {},
  })) as unknown as HTMLCanvasElement['getContext']);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function view(state = initialState()) {
  const container = document.createElement('div');
  Object.defineProperties(container, {
    clientWidth: { value: 1440 },
    clientHeight: { value: 900 },
  });
  container.getBoundingClientRect = () => new DOMRect(100, 40, 1440, 900);
  return new TrainScene(container, () => state);
}

function wheels(scene: TrainScene) {
  const result: THREE.Bone[] = [];
  scene.scene.traverse((object) => {
    if (object instanceof THREE.Bone && object.name.endsWith('-wheel')) result.push(object);
  });
  return result;
}

function frame(
  scene: TrainScene,
  clock: SimulationClock,
  state: ReturnType<typeof initialState>,
  seconds = 1,
) {
  for (let i = 0; i < 60 * seconds; i++) clock.frame(state, 1 / 60);
  scene.render();
  scene.scene.updateMatrixWorld(true);
}

it('车头和每节车厢的独立轮组在转动前后均接触轨面', () => {
  const state = initialState(),
    scene = view(state),
    clock = new SimulationClock();
  expect(depart(state, 'farm')).toBeNull();
  setSpeed(state, 1);
  for (const seconds of [0, 0.25, 0.5, 1]) {
    frame(scene, clock, state, seconds);
    const allWheels = wheels(scene);
    const engine = allWheels.filter((wheel) => wheel.name === 'locomotive-wheel');
    expect(engine).toHaveLength(3);
    for (let i = 1; i < engine.length; i++) {
      const previous = engine[i - 1],
        current = engine[i];
      const radii =
        (previous.getObjectByName('wheel-tire')!.scale.x +
          current.getObjectByName('wheel-tire')!.scale.x) /
        2;
      expect(radii).toBeLessThan(current.position.x - previous.position.x);
    }
    expect(allWheels.filter((wheel) => wheel.name === 'carriage-wheel')).toHaveLength(
      state.cars.length * 4,
    );
    const rail = scene.scene.getObjectByName('rail-head')!;
    const surface = new THREE.Box3().setFromObject(rail).max.y;
    for (const wheel of allWheels) {
      const tire = wheel.getObjectByName('wheel-tire') as THREE.Mesh;
      tire.geometry.computeBoundingSphere();
      const radius =
        tire.geometry.boundingSphere!.radius * tire.getWorldScale(new THREE.Vector3()).x;
      expect(tire.getWorldPosition(new THREE.Vector3()).y - radius).toBeCloseTo(surface, 6);
    }
  }
});

it('轮组与轨枕按相同距离滚动，机车连杆始终跟随三个曲柄销', () => {
  const state = initialState(),
    scene = view(state),
    clock = new SimulationClock();
  expect(depart(state, 'farm')).toBeNull();
  setSpeed(state, 1);
  frame(scene, clock, state, 0);
  const allWheels = wheels(scene);
  const initialAngles = allWheels.map((wheel) => wheel.rotation.z);
  // Less than one tie interval, so the repeating rail offset has not wrapped.
  frame(scene, clock, state, 0.25);
  const railDistance = -scene.scene.getObjectByName('rail-head')!.parent!.position.x;
  expect(railDistance).toBeGreaterThan(0.3);
  allWheels.forEach((wheel, i) => {
    const tire = wheel.getObjectByName('wheel-tire')!;
    expect((-(wheel.rotation.z - initialAngles[i]) * tire.scale.x) / 2).toBeCloseTo(
      railDistance,
      8,
    );
  });
  const engine = allWheels.filter((wheel) => wheel.name === 'locomotive-wheel');
  const rod = engine[0].getObjectByName('coupling-rod')!;
  for (const seconds of [0, 0.25, 0.5]) {
    frame(scene, clock, state, seconds);
    for (const wheel of engine) {
      const endpoint = rod.localToWorld(
        new THREE.Vector3(wheel.position.x - engine[0].position.x, 0, 0),
      );
      const pin = wheel.getObjectByName('crank-pin')!.getWorldPosition(new THREE.Vector3());
      expect(endpoint.x).toBeCloseTo(pin.x, 8);
      expect(endpoint.y).toBeCloseTo(pin.y, 8);
    }
  }
});

it('轮组跟随 1/2/3 倍速，暂停、停站和失去燃煤时停转', () => {
  const changes = ([1, 2, 3] as const).map((speed) => {
    const state = initialState(),
      scene = view(state),
      clock = new SimulationClock();
    setSpeed(state, speed);
    frame(scene, clock, state, 1);
    expect(wheels(scene).every((wheel) => wheel.rotation.z === 0)).toBe(true);
    expect(depart(state, 'farm')).toBeNull();
    frame(scene, clock, state, 1);
    const moving = wheels(scene).map((wheel) => wheel.rotation.z);
    expect(moving.every((angle) => Math.abs(angle) > 1)).toBe(true);
    setSpeed(state, 0);
    frame(scene, clock, state, 1);
    expect(wheels(scene).map((wheel) => wheel.rotation.z)).toEqual(moving);
    setSpeed(state, speed);
    state.stacks = state.stacks.filter((stack) => stack.item !== 'fuel');
    frame(scene, clock, state, 1);
    expect(wheels(scene).map((wheel) => wheel.rotation.z)).toEqual(moving);
    // A scene rebuild (load/new game) preserves wheel phase at the saved distance.
    scene.reset();
    scene.render();
    expect(wheels(scene).map((wheel) => wheel.rotation.z)).toEqual(moving);
    return moving;
  });
  changes[0].forEach((angle, i) => {
    expect(changes[1][i]).toBeCloseTo(angle * 2, 8);
    expect(changes[2][i]).toBeCloseTo(angle * 3, 8);
  });
});

it('聚焦后无需等待绘制帧就能准确拾取中心', () => {
  const scene = view();
  scene.focus({ x: 32, y: 2, layer: 'inside' });
  const point = scene.worldAt(820, 490);
  expect(point.x).toBeCloseTo(32);
  expect(point.y).toBeCloseTo(1.2);
});

it('同一绘制帧内连续平移和缩放仍保持鼠标锚点', () => {
  const scene = view();
  scene.pan(130, 40);
  const before = scene.worldAt(500, 350);
  scene.zoomAt(1.5, 500, 350);
  scene.zoomAt(1.2, 500, 350);
  const after = scene.worldAt(500, 350);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  expect(scene.screenPosition(before).x).toBeCloseTo(500);
  expect(scene.screenPosition(before).y).toBeCloseTo(350);
});

it('侧视拾取同时支持车内人物、车顶人物和工作台', () => {
  const s = initialState();
  const scene = view(s);
  const p = s.pawns[0];
  const roof = s.pawns[1];
  roof.x = p.x;
  roof.layer = 'roof';
  for (const q of [p, roof]) {
    const screen = scene.screenPosition({ ...q, y: q.layer === 'roof' ? -2.6 : 1.2 });
    expect(scene.pick(screen.x, screen.y)).toMatchObject({ kind: 'pawn', id: q.id });
  }
  const bench = s.facilities.find((f) => f.kind === 'bench')!;
  const target = scene.screenPosition({ ...bench, x: bench.x + 0.5, y: 1.2 });
  expect(scene.pick(target.x, target.y)).toMatchObject({ kind: 'facility', id: bench.id });
  const floor = scene.screenPosition({ x: 18, y: -2, layer: 'roof' });
  expect(scene.navigationAt(floor.x, floor.y)).toEqual({ x: 18, y: 2, layer: 'roof' });
});

it('读取另一份旅程后重建同 ID 人物，并释放旧人物几何资源', () => {
  const fillText = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    measureText: (value: string) => ({ width: value.length * 20 }),
    beginPath() {},
    roundRect() {},
    fill() {},
    fillText,
  })) as unknown as HTMLCanvasElement['getContext']);
  const state = initialState(),
    scene = view(state);
  scene.render();
  const disposed = vi.fn();
  scene.scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry.type === 'RingGeometry')
      object.geometry.addEventListener('dispose', disposed);
  });
  fillText.mockClear();
  state.pawns[0].name = '读档后的旅人';
  scene.reset();
  scene.render();
  expect(disposed).toHaveBeenCalledTimes(6);
  expect(fillText).toHaveBeenCalledWith('读档后的旅人', 256, 39);
});
