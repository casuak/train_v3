// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrainScene } from '../src/render/scene';
import { initialState } from '../src/sim/game';

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
