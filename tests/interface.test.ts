// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as storage from '../src/save/storage';
import { GameUI } from '../src/ui/interface';
import { TrainScene, type Pick } from '../src/render/scene';
import { initialState, spawnRaid } from '../src/sim/game';
import type { Point } from '../src/sim/types';
vi.mock('../src/ui/audio', () => ({
  Sound: class {
    enabled = true;
    unlock() {}
    play() {}
  },
}));
let s = initialState(),
  ui: GameUI,
  canvas: HTMLCanvasElement,
  scene: TrainScene;
let picked: Pick = { kind: 'ground', point: { x: 18, y: 2, layer: 'inside' } };
let world: Point = { x: 18, y: 2, layer: 'inside' };
function click(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  expect(el, selector).not.toBeNull();
  el!.click();
}
function canvasClick(button = 0) {
  canvas.dispatchEvent(
    new MouseEvent('pointerdown', { button, clientX: 500, clientY: 350, bubbles: true }),
  );
  canvas.dispatchEvent(
    new MouseEvent('pointerup', { button, clientX: 500, clientY: 350, bubbles: true }),
  );
}
beforeAll(() => {
  document.body.innerHTML = '<div id="app"><main id="game-stage"></main></div>';
  const stage = document.getElementById('game-stage')!;
  canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {};
  stage.appendChild(canvas);
  scene = {
    container: stage,
    renderer: { domElement: canvas },
    layer: 'inside',
    selected: [],
    buildKind: null,
    gridVisible: false,
    hoverPoint: null,
    fit: vi.fn(),
    zoomAt: vi.fn(),
    pan: vi.fn(),
    focus: vi.fn(),
    worldAt: () => world,
    navigationAt: () => world,
    screenAt: (p: Point) => ({ x: p.x * 20, y: p.y * 20 }),
    pick: () => picked,
  } as unknown as TrainScene;
  ui = new GameUI(
    document.getElementById('app')!,
    () => s,
    scene,
    (x) => {
      s = x;
    },
    () => {
      s = initialState();
    },
  );
});
beforeEach(() => {
  s = initialState();
  ui.selected = [];
  ui.facility = null;
  ui.buildKind = null;
  scene.layer = 'inside';
  ui.closeModal();
  ui.refresh();
});
afterEach(() => vi.restoreAllMocks());
describe('PC 鼠标与快捷键交互', () => {
  it('右下角恰好四个倍速按钮，并能暂停恢复上一倍速', () => {
    expect(document.querySelectorAll('#speed-buttons button')).toHaveLength(4);
    click('[data-action="speed"][data-speed="2"]');
    expect(s.speed).toBe(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(s.speed).toBe(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(s.speed).toBe(2);
  });
  it('选择人物后右键设施可以强制工作', () => {
    click(`#crew [data-id="${s.pawns[0].id}"]`);
    const f = s.facilities.find((f) => f.kind === 'stove')!;
    picked = { kind: 'facility', id: f.id, point: f };
    canvasClick(2);
    expect(document.getElementById('context-menu')!.hidden).toBe(false);
    click('[data-action="force-work"]');
    expect(s.pawns[0].task?.forced).toBe(true);
    expect(s.pawns[0].task?.stationId).toBe(f.id);
    expect(document.getElementById('context-menu')!.hidden).toBe(true);
  });
  it('未选人右键工作台能设置制作清单', () => {
    const f = s.facilities.find((f) => f.kind === 'bench')!;
    picked = { kind: 'facility', id: f.id, point: f };
    canvasClick(2);
    click('#context-menu [data-action="production"]');
    expect(ui.modal).toBe('production');
    click('[data-action="bill-mode"]');
    expect(f.bills[0].mode).toBe('times');
    const input = document.querySelector<HTMLInputElement>('[data-bill-id]')!;
    input.value = '8';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.bills[0].remaining).toBe(8);
  });
  it('输入框中的空格不影响游戏暂停状态', () => {
    const f = s.facilities.find((f) => f.kind === 'stove')!;
    ui.modalFacility = f.id;
    ui.open('production');
    s.speed = 2;
    const input = document.querySelector<HTMLInputElement>('[data-bill-id]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    expect(s.speed).toBe(2);
  });
  it('工作优先级点击后改变调度数据', () => {
    click('[data-action="work"]');
    const p = s.pawns[1];
    expect(p.priorities.cook).toBe(1);
    click(`[data-action="priority"][data-id="${p.id}"][data-work="cook"]`);
    expect(p.priorities.cook).toBe(2);
  });
  it('建造卡片和场景点击产生真实蓝图', () => {
    click('[data-action="build"]');
    click('[data-action="build-kind"][data-kind="heater"]');
    expect(ui.modal).toBe('');
    world = { x: 18, y: 2, layer: 'inside' };
    picked = { kind: 'ground', point: world };
    canvasClick();
    expect(
      s.facilities.some((f) => f.kind === 'heater' && f.x === 18 && f.y === 2 && !f.built),
    ).toBe(true);
  });
  it('铁路地图的出发按钮进入旅行并恢复 1 倍速', () => {
    ui.mapNode = 'farm';
    click('[data-action="map"]');
    click('[data-action="depart"][data-id="farm"]');
    expect(s.journey?.to).toBe('farm');
    expect(s.speed).toBe(1);
    expect(ui.modal).toBe('');
  });
  it('部署车顶按钮下达征召与跨层移动命令', () => {
    spawnRaid(s, 3);
    ui.refresh();
    click('[data-action="defend"]');
    expect(s.pawns.filter((p) => !p.enemy).every((p) => p.drafted)).toBe(true);
    expect(scene.layer).toBe('roof');
    expect(s.pawns.filter((p) => !p.enemy).every((p) => p.task?.target.layer === 'roof')).toBe(
      true,
    );
    expect(s.speed).toBe(0);
  });
  it('选中征召人物后右键敌人生成攻击命令', () => {
    spawnRaid(s, 1);
    click(`#crew [data-id="${s.pawns[0].id}"]`);
    click('[data-action="draft"]');
    const enemy = s.pawns.find((p) => p.enemy)!;
    picked = { kind: 'pawn', id: enemy.id, point: enemy };
    canvasClick(2);
    click('[data-action="attack"]');
    expect(s.pawns[0].task?.kind).toBe('attack');
    expect(s.pawns[0].task?.targetId).toBe(enemy.id);
  });
  it('暂停时可以切换车顶和车内', () => {
    click('[data-action="layer-roof"]');
    expect(scene.layer).toBe('roof');
    expect(document.body.dataset.gameLayer).toBe('roof');
    click('[data-action="layer-inside"]');
    expect(scene.layer).toBe('inside');
    expect(s.speed).toBe(0);
  });
  it('长按暂停键只切换一次，浏览器组合快捷键不征召人物', () => {
    click(`[data-action="speed"][data-speed="1"]`);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true }));
    expect(s.speed).toBe(0);
    click(`#crew [data-id="${s.pawns[0].id}"]`);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', ctrlKey: true }));
    expect(s.pawns[0].drafted).toBe(false);
  });
  it('人物状态刷新时保留按钮和键盘焦点', () => {
    click(`#crew [data-id="${s.pawns[0].id}"]`);
    const draftButton = document.querySelector<HTMLButtonElement>(
      '#inspect [data-action="draft"]',
    )!;
    draftButton.focus();
    s.pawns[0].hunger -= 1;
    ui.refresh();
    expect(draftButton.isConnected).toBe(true);
    expect(document.activeElement).toBe(draftButton);
    draftButton.click();
    expect(s.pawns[0].drafted).toBe(true);
  });
  it('打开新局后清除旧局蓝图、楼层与旋转状态', () => {
    ui.buildKind = 'barricade';
    ui.rotation = 1;
    scene.layer = 'roof';
    ui.open('new-confirm');
    click('[data-action="new"]');
    expect(ui.buildKind).toBeNull();
    expect(ui.rotation).toBe(0);
    expect(scene.layer).toBe('inside');
    expect(scene.buildKind).toBeNull();
  });
  it('指针操作取消后不继续平移，窗口失焦自动暂停', () => {
    vi.mocked(scene.pan).mockClear();
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 2, clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new MouseEvent('pointercancel', { button: 2 }));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 450, clientY: 350 }));
    expect(scene.pan).not.toHaveBeenCalled();
    click('[data-action="speed"][data-speed="3"]');
    window.dispatchEvent(new Event('blur'));
    expect(s.speed).toBe(0);
  });
  it('读取存档会清空蓝图与选中状态，并回到车内暂停', async () => {
    const saved = initialState();
    saved.credits = 80;
    vi.spyOn(storage, 'loadGame').mockResolvedValue(saved);
    ui.selected = [s.pawns[0].id];
    ui.buildKind = 'barricade';
    scene.layer = 'roof';
    click('[data-action="menu"]');
    click('[data-action="continue"]');
    await vi.waitFor(() => expect(s.credits).toBe(80));
    expect(ui.buildKind).toBeNull();
    expect(ui.selected).toEqual([]);
    expect(scene.layer).toBe('inside');
    expect(s.speed).toBe(0);
  });
  it('导入存档后退出初次引导并清除旧局建造状态', async () => {
    const saved = initialState();
    saved.credits = 77;
    ui.buildKind = 'heater';
    const input = document.getElementById('import-save') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => storage.serialize(saved) }],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(s.credits).toBe(77));
    expect(ui.buildKind).toBeNull();
    click('[data-action="help"]');
    expect(document.querySelector('#modal-root [data-action="return-welcome"]')).toBeNull();
  });
  it('导入损坏文件不会替换当前旅程', async () => {
    const before = s;
    const input = document.getElementById('import-save') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: async () => '{}' }],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.getElementById('toast')!.textContent).toContain('不支持'),
    );
    expect(s).toBe(before);
  });
  it('菜单和新局确认期间快捷键不会恢复模拟', () => {
    click('[data-action="speed"][data-speed="3"]');
    click('[data-action="menu"]');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(s.speed).toBe(0);
    click('[data-action="new-confirm"]');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' }));
    expect(s.speed).toBe(0);
    click('#modal-root [data-action="close"]');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    expect(s.speed).toBe(3);
  });
});

it('切换作业层后，舷梯命令仍依据所选人物的实际楼层', () => {
  click(`#crew [data-id="${s.pawns[0].id}"]`);
  click('[data-action="layer-roof"]');
  expect(document.querySelector('#inspect [data-action="to-roof"]')!.textContent).toBe('前往车顶');
  click('#inspect [data-action="to-roof"]');
  expect(s.pawns[0].task?.target.layer).toBe('roof');
});
