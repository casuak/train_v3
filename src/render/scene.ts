import * as THREE from 'three';
import { assets } from '../assets';
import { FACILITY } from '../sim/content';
import { footprint } from '../sim/navigation';
import { FLOOR_Y, lanePoint, layerAtHeight, sidePoint } from './side-view';
import { ATLAS_REGIONS, ATLAS_SIZE } from './atlas-regions';
import type { Facility, GameState, Layer, Pawn, Point } from '../sim/types';

const RAIL_TOP_Y = 3.2;
const TIE_SPACING = 1.2;
// Presentation distance shared by the rails and wheels (world units per km).
const TRAVEL_SCALE = 14;
type WheelRig = { bone: THREE.Bone; radius: number };

type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  visualY: number;
  lastTime: number;
  leftArm: THREE.Bone;
  rightArm: THREE.Bone;
  leftLeg: THREE.Bone;
  rightLeg: THREE.Bone;
  head: THREE.Bone;
  selection: THREE.Mesh;
  health: THREE.Mesh;
  name: THREE.Sprite;
  born: number;
};
export interface Pick {
  kind: 'pawn' | 'facility' | 'ground';
  id?: string;
  point: Point;
}
export class TrainScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-25, 25, 15, -15, 0.1, 300);
  private staticGroup = new THREE.Group();
  private units = new THREE.Group();
  private effectGroup = new THREE.Group();
  private grid = new THREE.Group();
  private selectionGhost = new THREE.Group();
  private rails = new THREE.Group();
  private atlas = new THREE.TextureLoader().load(assets.atlas);
  private plane = new THREE.PlaneGeometry(1, 1);
  private disc = new THREE.CircleGeometry(0.5, 64);
  private mats = new Map<string, THREE.MeshBasicMaterial>();
  private labelMaterials = new Map<string, THREE.SpriteMaterial>();
  private rigs = new Map<string, Rig>();
  private wheels: WheelRig[] = [];
  private coupling: { driver: THREE.Bone; crank: THREE.Bone } | null = null;
  private stamp = '';
  private width = 1;
  private height = 1;
  private target = new THREE.Vector2(23, -1.5);
  private zoom = 1;
  layer: Layer = 'inside';
  selected: string[] = [];
  selectedFacility: string | null = null;
  buildKind: string | null = null;
  buildRotation = 0;
  hoverPoint: Point | null = null;
  gridVisible = false;
  readonly ready: Promise<void>;
  constructor(
    readonly container: HTMLElement,
    private state: () => GameState,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute(
      'aria-label',
      '横版 2D 侧视列车：上层车顶，下层车厢；左键选择，右键行动，滚轮缩放',
    );
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.minFilter = THREE.LinearFilter;
    this.scene.add(
      this.rails,
      this.staticGroup,
      this.grid,
      this.units,
      this.effectGroup,
      this.selectionGhost,
    );
    this.camera.position.set(20, -2, 100);
    this.camera.lookAt(20, -2, 0);
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.fit();
    this.ready = new Promise((resolve) => {
      if (this.atlas.image) resolve();
      else {
        const t = setInterval(() => {
          if (this.atlas.image) {
            clearInterval(t);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(t);
          resolve();
        }, 12000);
      }
    });
  }
  private material(color: string, opacity = 1) {
    const key = `${color}:${opacity}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
      this.mats.set(key, m);
    }
    return m;
  }
  private spriteMat(tile: number, tint = '#ffffff', opacity = 1) {
    const key = `atlas-${tile}-${tint}-${opacity}`;
    let m = this.mats.get(key);
    if (!m) {
      const t = this.atlas.clone();
      t.needsUpdate = true;
      const [x, y, w, h] = ATLAS_REGIONS[tile];
      t.repeat.set(w / ATLAS_SIZE, h / ATLAS_SIZE);
      t.offset.set(x / ATLAS_SIZE, 1 - (y + h) / ATLAS_SIZE);
      m = new THREE.MeshBasicMaterial({
        map: t,
        color: tint,
        transparent: true,
        opacity,
        alphaTest: 0.03,
        depthWrite: false,
      });
      this.mats.set(key, m);
    }
    return m;
  }
  private rect(
    parent: THREE.Object3D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    z = 0,
    opacity = 1,
  ) {
    const o = new THREE.Mesh(this.plane, this.material(color, opacity));
    o.position.set(x, -y, z);
    o.scale.set(w, h, 1);
    parent.add(o);
    return o;
  }
  private sprite(
    parent: THREE.Object3D,
    tile: number,
    x: number,
    y: number,
    w: number,
    h: number,
    z = 1,
    tint = '#ffffff',
    opacity = 1,
  ) {
    const o = new THREE.Mesh(this.plane, this.spriteMat(tile, tint, opacity));
    o.position.set(x, -y, z);
    o.scale.set(w, h, 1);
    parent.add(o);
    return o;
  }
  private addWheel(x: number, radius: number, kind: 'carriage' | 'locomotive') {
    const bone = new THREE.Bone();
    bone.name = `${kind}-wheel`;
    bone.position.set(x, -(RAIL_TOP_Y - radius), 2.1);
    // A circular tire fixes the contact radius independently of transparent
    // padding in the generated art. Both meshes rotate about the axle center.
    const tire = new THREE.Mesh(this.disc, this.material('#423d32'));
    tire.name = 'wheel-tire';
    tire.scale.set(radius * 2, radius * 2, 1);
    bone.add(tire);
    const face = new THREE.Mesh(this.disc, this.spriteMat(6));
    face.name = 'wheel-face';
    face.scale.copy(tire.scale);
    face.position.z = 0.01;
    bone.add(face);
    const pin = new THREE.Mesh(this.disc, this.material('#edcd8c'));
    pin.name = 'crank-pin';
    pin.position.set(radius * 0.4, 0, 0.12);
    pin.scale.set(radius * 0.18, radius * 0.18, 1);
    bone.add(pin);
    this.wheels.push({ bone, radius });
    this.staticGroup.add(bone);
    return bone;
  }
  private drawLocomotive(center: number) {
    const scale = 7.8 / 394,
      left = center - 3.9,
      top = RAIL_TOP_Y - (1198 - 954) * scale;
    // Sample the existing artwork in three pieces, omitting the baked-in
    // wheels and rod. Preserve its original aspect ratio and rail baseline.
    this.rect(this.staticGroup, center - 0.7, 1.66, 6.1, 0.54, '#283b36', 1.9);
    for (const tile of [14, 16, 17]) {
      const [x, y, w, h] = ATLAS_REGIONS[tile];
      this.sprite(
        this.staticGroup,
        tile,
        left + (x - 610 + w / 2) * scale,
        top + (y - 954 + h / 2) * scale,
        w * scale,
        h * scale,
        2,
      );
    }
    const radius = 42 * scale;
    const wheels = [699, 784, 869].map((x) =>
      this.addWheel(left + (x - 610) * scale, radius, 'locomotive'),
    );
    // All three crank pins share a phase. Counter-rotate the rod's bone so
    // the rod stays horizontal while its ends follow the driving wheels.
    const crank = new THREE.Bone();
    crank.name = 'coupling-rod';
    crank.position.set(radius * 0.4, 0, 0.08);
    wheels[0].add(crank);
    const span = wheels[2].position.x - wheels[0].position.x;
    this.rect(crank, span / 2, 0, span, 0.13, '#343e38');
    this.rect(crank, span / 2, 0, span, 0.055, '#c3af80', 0.01);
    this.coupling = { driver: wheels[0], crank };
  }
  private text(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    color = '#eee6d1',
    scale = 0.4,
  ) {
    const cacheKey = `${text}:${color}`;
    let material = this.labelMaterials.get(cacheKey);
    if (!material) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      ctx.font = '500 27px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,22,26,.76)';
      const w = Math.min(500, ctx.measureText(text).width + 36);
      ctx.beginPath();
      ctx.roundRect(256 - w / 2, 3, w, 55, 10);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(text, 256, 39);
      const t = new THREE.CanvasTexture(c);
      material = new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false });
      this.labelMaterials.set(cacheKey, material);
    }
    const o = new THREE.Sprite(material);
    o.position.set(x, -y, 8);
    o.scale.set(scale * 8, scale, 1);
    parent.add(o);
    return o;
  }
  private resize() {
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height);
    this.updateCamera();
  }
  private updateCamera() {
    const w = 51 / this.zoom,
      h = (w * this.height) / this.width;
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.position.set(this.target.x, -this.target.y, 100);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }
  reset() {
    for (const rig of this.rigs.values()) this.disposeRig(rig);
    this.rigs.clear();
    for (const group of [
      this.staticGroup,
      this.units,
      this.effectGroup,
      this.grid,
      this.selectionGhost,
      this.rails,
    ])
      group.clear();
    for (const material of this.mats.values()) {
      material.map?.dispose();
      material.dispose();
    }
    for (const material of this.labelMaterials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.mats.clear();
    this.labelMaterials.clear();
    this.wheels = [];
    this.coupling = null;
    this.stamp = '';
    this.selected = [];
    this.selectedFacility = null;
    this.buildKind = null;
    this.buildRotation = 0;
    this.hoverPoint = null;
    this.gridVisible = false;
    this.layer = 'inside';
    this.fit();
  }
  private disposeRig(rig: Rig) {
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry !== this.plane) object.geometry.dispose();
    });
    this.units.remove(rig.root);
  }
  fit() {
    this.target.set((this.state().cars.length * 14 + 4) / 2, -1.5);
    this.zoom = Math.min(1, 3 / this.state().cars.length);
    this.updateCamera();
  }
  zoomAt(amount: number, x: number, y: number) {
    const before = this.worldAt(x, y);
    this.zoom = Math.max(0.55, Math.min(2.7, this.zoom * amount));
    this.updateCamera();
    const after = this.worldAt(x, y);
    this.target.x += before.x - after.x;
    this.target.y += before.y - after.y;
    this.updateCamera();
  }
  pan(dx: number, dy: number) {
    const units = 51 / this.zoom / this.width;
    this.target.x -= dx * units;
    this.target.y -= dy * units;
    this.target.x = Math.max(-5, Math.min(this.state().cars.length * 14 + 7, this.target.x));
    this.target.y = Math.max(-12, Math.min(16, this.target.y));
    this.updateCamera();
  }
  focus(p: Point) {
    this.target.set(p.x, FLOOR_Y[p.layer] - 0.8);
    this.zoom = 1.65;
    this.updateCamera();
  }
  worldAt(x: number, y: number): Point {
    const r = this.container.getBoundingClientRect(),
      v = new THREE.Vector3(
        ((x - r.left) / this.width) * 2 - 1,
        (-(y - r.top) / this.height) * 2 + 1,
        0,
      );
    v.unproject(this.camera);
    return { x: v.x, y: -v.y, layer: layerAtHeight(-v.y) };
  }
  navigationAt(x: number, y: number): Point {
    return lanePoint(this.worldAt(x, y));
  }
  screenAt(p: Point) {
    return this.screenPosition(sidePoint(p));
  }
  screenPosition(p: Point) {
    const v = new THREE.Vector3(p.x, -p.y, 0).project(this.camera),
      r = this.container.getBoundingClientRect();
    return { x: ((v.x + 1) * this.width) / 2 + r.left, y: ((1 - v.y) * this.height) / 2 + r.top };
  }
  pick(x: number, y: number): Pick {
    const visual = this.worldAt(x, y),
      p = lanePoint(visual),
      s = this.state();
    const pawn = [...s.pawns].reverse().find((q) => {
      const floor = this.rigs.get(q.id)?.visualY ?? FLOOR_Y[q.layer];
      return (
        !q.dead &&
        Math.abs(q.x - visual.x) < 0.42 &&
        visual.y >= floor - 1.6 &&
        visual.y <= floor + 0.12
      );
    });
    if (pawn) return { kind: 'pawn', id: pawn.id, point: { ...p, layer: pawn.layer } };
    const f = [...s.facilities].reverse().find((f) => {
      const d = footprint(f),
        floor = FLOOR_Y[f.layer];
      return (
        visual.x >= f.x - 0.5 &&
        visual.x <= f.x + d.w - 0.5 &&
        (f.kind === 'hatch'
          ? visual.y >= FLOOR_Y.roof - 0.18 && visual.y <= FLOOR_Y.inside
          : visual.y >= floor - this.facilityHeight(f) && visual.y <= floor + 0.12)
      );
    });
    if (f) return { kind: 'facility', id: f.id, point: p };
    if (Math.abs(visual.x - (s.cars.length * 14 + 1.7)) < 3.7 && visual.y > -2 && visual.y < 3.6) {
      const engine = s.facilities.find((f) => f.kind === 'engine');
      if (engine) return { kind: 'facility', id: engine.id, point: { ...p, layer: 'inside' } };
    }
    return { kind: 'ground', point: p };
  }
  private rebuild(s: GameState) {
    this.staticGroup.clear();
    this.rails.clear();
    this.grid.clear();
    this.wheels = [];
    this.coupling = null;
    const end = s.cars.length * 14 + 7;
    // A single rail silhouette below the wheels: no receding or overhead track.
    this.rect(this.rails, end / 2, 3.64, end + 160, 0.5, '#3a4946', -5);
    for (let x = -80; x < end + 90; x += TIE_SPACING)
      this.rect(this.rails, x, 3.49, 0.8, 0.2, '#635b4b', -4);
    this.rect(this.rails, end / 2, 3.28, end + 160, 0.15, '#1c3034', -3);
    this.rect(this.rails, end / 2, RAIL_TOP_Y + 0.065 / 2, end + 160, 0.065, '#acb3a1', -2).name =
      'rail-head';
    for (let ci = 0; ci < s.cars.length; ci++) {
      const car = s.cars[ci],
        x = car.x,
        w = car.width,
        center = x + (w - 1) / 2;
      this.rect(this.staticGroup, center, 0.17, w + 0.36, 3.88, '#192d30', -0.5);
      this.rect(
        this.staticGroup,
        center,
        0.2,
        w - 0.14,
        3.55,
        ci === 0 ? '#605443' : ci === 1 ? '#45594f' : '#3e514c',
        0,
      );
      // Back wall panels and level windows create a dollhouse cross section.
      for (let xx = 0; xx < w; xx++) {
        this.rect(this.staticGroup, x + xx, 0.45, 0.014, 2.9, '#af9d72', 0.12, 0.17);
        for (const layer of ['inside', 'roof'] as Layer[]) {
          const y = FLOOR_Y[layer];
          const square = this.rect(this.grid, x + xx, y + 0.06, 0.97, 0.16, '#e2c384', 6, 0.65);
          square.userData.layer = layer;
        }
      }
      for (const xx of [2.3, 5.6, 8.9]) {
        this.rect(this.staticGroup, x + xx, -0.67, 2.05, 1.28, '#1c3639', 0.2);
        this.rect(this.staticGroup, x + xx, -0.67, 1.84, 1.08, '#8ba4a0', 0.21);
        this.rect(this.staticGroup, x + xx, -0.48, 1.84, 0.68, '#6d8984', 0.22);
        this.rect(this.staticGroup, x + xx, -0.24, 1.84, 0.25, '#3b5d59', 0.23);
        this.rect(this.staticGroup, x + xx, -0.67, 0.06, 1.1, '#344943', 0.24);
        this.rect(this.staticGroup, x + xx, -0.1, 2.15, 0.1, '#b6a178', 0.25);
      }
      // Ceiling and floor are horizontal; there is no visible top plane.
      this.rect(this.staticGroup, center, FLOOR_Y.roof + 0.1, w + 0.5, 0.28, '#243d3d', 1.5);
      this.rect(this.staticGroup, center, FLOOR_Y.roof - 0.08, w + 0.35, 0.1, '#a3b1a1', 1.6);
      this.rect(this.staticGroup, center, 2.08, w + 0.5, 0.27, '#b39768', 1.5);
      this.rect(this.staticGroup, center, 2.4, w + 0.35, 0.43, '#284444', 1.5);
      this.rect(this.staticGroup, center, 2.3, w + 0.25, 0.06, '#799286', 1.6);
      for (const edge of [x - 0.58, x + w - 0.42])
        this.rect(this.staticGroup, edge, 0.11, 0.2, 4.03, '#29443f', 1.5);
      for (let xx = 0.5; xx < w; xx += 1.2) {
        this.rect(this.staticGroup, x + xx, 2.4, 0.055, 0.075, '#b5a274', 1.7);
      }
      for (const xx of [1.7, 9.3]) {
        this.rect(this.staticGroup, x + xx, 2.7, 2.05, 0.32, '#1f3234', 1.8);
        for (const axle of [-0.51, 0.51]) this.addWheel(x + xx + axle, 0.49, 'carriage');
      }
      for (const xx of [3.8, 8.1]) {
        this.rect(this.staticGroup, x + xx, -1.31, 1.15, 0.12, '#e6c987', 1);
        this.rect(this.staticGroup, x + xx, -1.05, 1.9, 0.4, '#f4ce86', 0.15, 0.045);
      }
      if (ci < s.cars.length - 1) {
        const join = x + w + 0.5;
        this.rect(this.staticGroup, join, 2.07, 2.3, 0.16, '#9e9d85', 1.4);
        this.rect(this.staticGroup, join, 2.5, 2.3, 0.17, '#283a39', 1.4);
        this.rect(this.staticGroup, join, FLOOR_Y.roof, 2.3, 0.1, '#627872', 1.4);
        for (const bar of [0.2, 1.1, 2.0])
          this.rect(this.staticGroup, x + w - 0.65 + bar, 1.46, 0.04, 1.15, '#788b7b', 1.3);
        this.rect(this.staticGroup, join, 0.86, 2.3, 0.06, '#9caa91', 1.3);
      }
      this.text(
        this.staticGroup,
        `${String(ci + 1).padStart(2, '0')}  ${car.name}`,
        center,
        4.15,
        '#ede2c6',
        0.42,
      );
    }
    const engineX = s.cars.length * 14 + 1.7;
    this.rect(this.staticGroup, s.cars.length * 14 - 1.1, 2.45, 3.2, 0.18, '#354540', 0.5);
    this.drawLocomotive(engineX);
    this.text(this.staticGroup, '巡游者号 · 向南', engineX, 4.15, '#dfc48c', 0.42);
    for (const f of s.facilities) this.drawFacility(f);
  }
  private facilityHeight(f: Facility) {
    return f.kind === 'hatch' ? 3.8 : f.kind === 'bed' ? 0.75 : f.kind === 'engine' ? 1.9 : 1.45;
  }
  private drawFacility(f: Facility) {
    const d = footprint(f),
      cx = f.x + (d.w - 1) / 2,
      floor = FLOOR_Y[f.layer],
      opacity = f.built ? 1 : 0.4;
    if (f.kind === 'hatch') {
      for (const offset of [-0.27, 0.27])
        this.rect(this.staticGroup, cx + offset, 0.13, 0.065, 3.74, '#b5a277', 2);
      for (let y = -1.5; y < 2; y += 0.32)
        this.rect(this.staticGroup, cx, y, 0.58, 0.055, '#c7b58a', 2.1);
      this.rect(
        this.staticGroup,
        cx,
        FLOOR_Y.roof - 0.04,
        0.9,
        0.16,
        f.hp > 0 ? '#d6b776' : '#814537',
        2.2,
      );
      return;
    }
    if (f.kind === 'engine') {
      this.rect(this.staticGroup, cx, 1.15, 0.85, 1.55, '#283f40', 1.8);
      this.rect(this.staticGroup, cx, 0.73, 0.54, 0.39, '#8da78e', 1.9);
      this.rect(this.staticGroup, cx, 1.18, 0.55, 0.06, '#d8bd81', 1.9);
      for (let y = 1.4; y < 1.9; y += 0.16)
        this.rect(this.staticGroup, cx, y, 0.53, 0.055, '#192f34', 1.9);
      return;
    }
    const height = this.facilityHeight(f);
    const spr = this.sprite(
      this.staticGroup,
      FACILITY[f.kind].tile,
      cx,
      floor - height / 2,
      d.w + 0.08,
      height,
      1.9,
      '#ffffff',
      opacity,
    );
    // R mirrors a side-view object, it never turns furniture onto its end.
    if (f.rotation % 2) spr.scale.x *= -1;
    if (!f.built) this.text(this.staticGroup, '待建', cx, floor - height - 0.2, '#bce6d2', 0.25);
  }
  private makeRig(p: Pawn, s: GameState): Rig {
    const root = new THREE.Group();
    this.units.add(root);
    const body = new THREE.Group();
    root.add(body);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 24),
      this.material('#081a1b', 0.4),
    );
    shadow.scale.y = 0.3;
    shadow.position.z = 0.05;
    root.add(shadow);
    const selection = new THREE.Mesh(
      new THREE.RingGeometry(0.37, 0.42, 32),
      this.material(p.enemy ? '#e89a79' : p.color),
    );
    selection.scale.y = 0.48;
    selection.position.z = 0.12;
    root.add(selection);
    const hips = new THREE.Bone();
    hips.position.set(0, 0.42, 0.2);
    body.add(hips);
    const bone = (parent: THREE.Object3D, x: number, y: number) => {
      const b = new THREE.Bone();
      b.position.set(x, y, 0.015);
      parent.add(b);
      return b;
    };
    const tint = p.enemy ? '#d7a296' : '#ffffff';
    const leftLeg = bone(hips, -0.04, -0.04),
      rightLeg = bone(hips, 0.04, -0.04);
    this.sprite(leftLeg, 4, 0, 0.17, 0.23, 0.48, 0.01, tint);
    this.sprite(rightLeg, 5, 0, 0.17, 0.23, 0.48, 0.02, tint);
    const torso = bone(hips, 0, 0.23);
    this.sprite(torso, 1, 0, -0.08, 0.38, 0.62, 0.04, tint);
    const leftArm = bone(torso, -0.04, 0.24),
      rightArm = bone(torso, 0.055, 0.24);
    this.sprite(leftArm, 2, 0, 0.2, 0.21, 0.49, 0.06, tint);
    this.sprite(rightArm, 3, 0, 0.2, 0.21, 0.49, 0.09, tint);
    const head = bone(torso, 0, 0.47);
    this.sprite(head, p.enemy ? 15 : 0, 0, -0.1, 0.49, 0.49, 0.12);
    if (p.weapon === 'rifle') {
      const weapon = bone(rightArm, 0.07, -0.28);
      this.rect(weapon, 0.22, 0, 0.65, 0.07, '#323a3a', 0.15);
      this.rect(weapon, 0.03, 0.025, 0.3, 0.12, '#896449', 0.16);
    }
    const health = this.rect(root, 0, -1.65, 0.7, 0.045, p.enemy ? '#d98878' : '#92c7a9', 1);
    const name = this.text(root, p.name, 0, -1.92, p.enemy ? '#e9a89c' : '#efe6cd', 0.28);
    return {
      root,
      body,
      visualY: FLOOR_Y[p.layer],
      lastTime: s.time,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      head,
      selection,
      health,
      name,
      born: s.time,
    };
  }
  render() {
    if (!this.atlas.image) return;
    const s = this.state(),
      stamp = `${s.cars.length}:${s.facilities.map((f) => `${f.id}:${f.built}:${f.rotation}:${f.hp <= 0}`).join(',')}`;
    if (stamp !== this.stamp) {
      this.rebuild(s);
      this.stamp = stamp;
    }
    this.grid.visible = this.gridVisible;
    for (const tile of this.grid.children) tile.visible = tile.userData.layer === this.layer;
    const travel = s.distance * TRAVEL_SCALE;
    for (const { bone, radius } of this.wheels) bone.rotation.z = -(travel / radius);
    if (this.coupling) this.coupling.crank.rotation.z = -this.coupling.driver.rotation.z;
    this.rails.position.x = -(travel % TIE_SPACING);
    for (const p of s.pawns) {
      let rig = this.rigs.get(p.id);
      if (!rig) {
        rig = this.makeRig(p, s);
        this.rigs.set(p.id, rig);
      }
      rig.root.visible = true;
      const dt = Math.max(0, s.time - rig.lastTime);
      rig.lastTime = s.time;
      const dy = FLOOR_Y[p.layer] - rig.visualY;
      rig.visualY += Math.sign(dy) * Math.min(Math.abs(dy), dt * 4.8);
      const walking =
          p.task?.path.length && Math.abs(p.x - p.lastX) + Math.abs(p.y - p.lastY) > 0.0001,
        phase = p.walked * 6;
      rig.leftLeg.rotation.z = walking ? Math.sin(phase) * 0.48 : 0;
      rig.rightLeg.rotation.z = walking ? -Math.sin(phase) * 0.48 : 0;
      const working =
        p.task?.stage === 'work' &&
        ['cook', 'craft', 'build', 'repair', 'care', 'eat'].includes(p.task.kind) &&
        !p.task.path.length;
      rig.leftArm.rotation.z = walking
        ? -Math.sin(phase) * 0.5
        : working
          ? -0.3 + Math.sin(s.time * 7) * 0.35
          : 0;
      rig.rightArm.rotation.z = walking
        ? Math.sin(phase) * 0.5
        : working
          ? 0.4 - Math.sin(s.time * 7) * 0.35
          : p.drafted
            ? -1.2
            : 0;
      rig.head.rotation.z = Math.sin(s.time * 1.2) * 0.025;
      rig.root.position.set(p.x, -rig.visualY, 4);
      rig.body.scale.set(p.facing, 1, 1);
      rig.body.rotation.z = p.dead
        ? 1.4
        : (p.task?.kind === 'sleep' && p.status.includes('休息')) || p.status === '睡眠中'
          ? 1.4
          : 0;
      if (p.enemy && s.speed > 0 && s.time - rig.born < 1)
        rig.root.position.y += Math.sin(((1 - (s.time - rig.born)) * Math.PI) / 2) * 2;
      rig.selection.visible = this.selected.includes(p.id);
      rig.health.visible = p.hp < 99 || p.drafted || p.enemy;
      rig.health.scale.x = 0.7 * Math.max(0.01, p.hp / 100);
      rig.name.visible = !p.dead && (this.zoom > 1.2 || this.selected.includes(p.id) || p.enemy);
      if (p.dead) {
        rig.health.visible = false;
        rig.name.visible = false;
        rig.body.scale.multiplyScalar(0.9);
      }
    }
    for (const [id, rig] of this.rigs)
      if (!s.pawns.some((p) => p.id === id)) {
        this.disposeRig(rig);
        this.rigs.delete(id);
      }
    this.effectGroup.clear();
    for (const e of s.effects) {
      const ey = FLOOR_Y[e.layer];
      if (e.kind === 'shot') {
        const dx = e.tx - e.x,
          dy = 0;
        const beam = this.rect(
          this.effectGroup,
          (e.x + e.tx) / 2,
          ey - 0.9,
          Math.hypot(dx, dy),
          0.038,
          '#ffe1a0',
          8,
          0.85,
        );
        beam.rotation.z = -Math.atan2(dy, dx);
      } else
        this.text(
          this.effectGroup,
          e.kind === 'heal' ? '+45' : '✦',
          e.tx,
          ey - 0.8,
          e.kind === 'heal' ? '#92d4ba' : '#efb48b',
          0.48,
        );
    }
    if (this.selected.length === 1) {
      const p = s.pawns.find((p) => p.id === this.selected[0]);
      if (p?.task?.path.length) {
        for (const n of p.task.path)
          this.rect(this.effectGroup, n.x, FLOOR_Y[n.layer] - 0.07, 0.12, 0.07, '#e6c58a', 5, 0.75);
      }
    }
    this.selectionGhost.clear();
    const selected = s.facilities.find((f) => f.id === this.selectedFacility);
    if (selected) {
      const w = footprint(selected).w;
      this.rect(
        this.selectionGhost,
        selected.x + (w - 1) / 2,
        FLOOR_Y[selected.layer] + 0.03,
        w,
        0.08,
        '#f3d18c',
        7,
      );
    }
    if (this.buildKind && this.hoverPoint) {
      const d = FACILITY[this.buildKind as keyof typeof FACILITY];
      if (d) {
        const layer = this.buildKind === 'barricade' ? 'roof' : 'inside';
        const height = this.buildKind === 'bed' ? 0.75 : 1.45;
        const ghost = this.sprite(
          this.selectionGhost,
          d.tile,
          Math.round(this.hoverPoint.x) + (d.w - 1) / 2,
          FLOOR_Y[layer] - height / 2,
          d.w,
          height,
          7,
          '#b9eddb',
          0.6,
        );
        if (this.buildRotation % 2) ghost.scale.x *= -1;
      }
    }
    const railScreen = this.screenPosition({ x: 0, y: 3.4, layer: 'inside' });
    const railY = railScreen.y - this.container.getBoundingClientRect().top;
    this.container.style.setProperty(
      '--terrain-y',
      `${railY - ((this.width + 360) / 1.5) * 0.735}px`,
    );
    this.container.style.setProperty('--terrain-shift', `${-((s.distance * 3) % 150)}px`);
    this.renderer.render(this.scene, this.camera);
  }
  getInfo() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
}
