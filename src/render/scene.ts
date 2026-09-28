import * as THREE from 'three';
import { assets } from '../assets';
import { FACILITY } from '../sim/content';
import { footprint } from '../sim/navigation';
import type { Facility, GameState, Layer, Pawn, Point } from '../sim/types';

type Rig = {
  root: THREE.Group;
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
  private mats = new Map<string, THREE.MeshBasicMaterial>();
  private labelMaterials = new Map<string, THREE.SpriteMaterial>();
  private rigs = new Map<string, Rig>();
  private wheels: THREE.Object3D[] = [];
  private stamp = '';
  private width = 1;
  private height = 1;
  private target = new THREE.Vector2(22, -3);
  private zoom = 1;
  layer: Layer = 'inside';
  selected: string[] = [];
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
      '列车游戏场景：左键选择，右键行动，滚轮缩放',
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
      t.repeat.set(0.25 - 0.008, 0.25 - 0.008);
      t.offset.set((tile % 4) / 4 + 0.004, (3 - Math.floor(tile / 4)) / 4 + 0.004);
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
    this.stamp = '';
    this.selected = [];
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
    this.target.set((this.state().cars.length * 14 + 2) / 2, -3);
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
    this.target.set(p.x, p.y);
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
    return { x: v.x, y: -v.y, layer: this.layer };
  }
  screenAt(p: Point) {
    const v = new THREE.Vector3(p.x, -p.y, 0).project(this.camera),
      r = this.container.getBoundingClientRect();
    return { x: ((v.x + 1) * this.width) / 2 + r.left, y: ((1 - v.y) * this.height) / 2 + r.top };
  }
  pick(x: number, y: number): Pick {
    const p = this.worldAt(x, y),
      s = this.state();
    const pawn = [...s.pawns]
      .reverse()
      .find(
        (q) =>
          !q.dead &&
          q.layer === this.layer &&
          Math.abs(q.x - p.x) < 0.5 &&
          Math.abs(q.y - 0.55 - p.y) < 0.85,
      );
    if (pawn) return { kind: 'pawn', id: pawn.id, point: p };
    const f = [...s.facilities].reverse().find((f) => {
      const d = footprint(f);
      return (
        (f.layer === this.layer || f.kind === 'hatch') &&
        p.x > f.x - 0.5 &&
        p.x < f.x + d.w - 0.5 &&
        p.y > f.y - 0.65 &&
        p.y < f.y + d.h - 0.25
      );
    });
    if (f) return { kind: 'facility', id: f.id, point: p };
    if (Math.abs(p.x - (s.cars.length * 14 + 1.5)) < 3.5 && p.y > -1 && p.y < 5.5) {
      const engine = s.facilities.find((f) => f.kind === 'engine');
      if (engine) return { kind: 'facility', id: engine.id, point: p };
    }
    return { kind: 'ground', point: { x: Math.round(p.x), y: Math.round(p.y), layer: this.layer } };
  }
  private rebuild(s: GameState) {
    this.staticGroup.clear();
    this.rails.clear();
    this.grid.clear();
    this.wheels = [];
    const end = s.cars.length * 14 + 7;
    for (let x = -45; x < end + 50; x += 1.2)
      this.rect(this.rails, x, 2.5, 0.28, 6.8, '#514d42', -5, 0.75);
    for (const y of [-0.25, 5.25]) {
      this.rect(this.rails, end / 2, y, end + 150, 0.17, '#242c2e', -4);
      this.rect(this.rails, end / 2, y - 0.03, end + 150, 0.045, '#96a09c', -3);
    }
    for (let ci = 0; ci < s.cars.length; ci++) {
      const car = s.cars[ci],
        x = car.x,
        w = car.width;
      this.rect(this.staticGroup, x + w / 2 - 0.5, 3, w + 0.5, 6, '#152225', -0.5);
      this.rect(this.staticGroup, x + w / 2 - 0.5, 2, w + 0.5, 5.4, '#4c655f', 0);
      for (let xx = 0; xx < w; xx++)
        for (let yy = 0; yy < 5; yy++) {
          this.sprite(
            this.staticGroup,
            this.layer === 'roof' ? 13 : 12,
            x + xx,
            yy,
            1.05,
            1.05,
            0.1,
            this.layer === 'roof' ? '#a0b3ad' : '#b8ab8f',
          );
          this.rect(this.grid, x + xx - 0.5, yy, 0.013, 1, '#e4d4a7', 0.8, 0.25);
          this.rect(this.grid, x + xx, yy - 0.5, 1, 0.013, '#e4d4a7', 0.8, 0.25);
        }
      this.rect(this.staticGroup, x + w / 2 - 0.5, -0.6, w + 0.3, 0.28, '#273e3e', 1.5);
      this.rect(this.staticGroup, x + w / 2 - 0.5, 4.7, w + 0.4, 0.3, '#9ba494', 1.5);
      this.rect(this.staticGroup, x - 0.63, 2, 0.27, 5.5, '#34504b', 1.5);
      this.rect(this.staticGroup, x + w - 0.37, 2, 0.27, 5.5, '#34504b', 1.5);
      for (const xx of [2, 8]) {
        this.rect(this.staticGroup, x + xx, 5.15, 3, 0.62, '#345653', 1);
        this.rect(this.staticGroup, x + xx, 5.09, 2.6, 0.24, '#91a498', 1.1);
      }
      for (const xx of [1.6, 9.4]) {
        const wheel = new THREE.Bone();
        wheel.position.set(x + xx, -5.62, 1.4);
        this.sprite(wheel, 6, 0, 0, 1.15, 1.15, 0);
        this.wheels.push(wheel);
        this.staticGroup.add(wheel);
      }
      for (let xx = 0; xx < w; xx += 2.1)
        this.rect(this.staticGroup, x + xx, 5.08, 0.08, 0.12, '#b9aa78', 1.2);
      if (ci < s.cars.length - 1) {
        this.rect(this.staticGroup, x + w + 0.5, 2, 2.8, 1.15, '#303939', 0.5);
        for (let xx = 0; xx < 5; xx++)
          this.rect(this.staticGroup, x + w - 0.25 + xx * 0.36, 2, 0.1, 1.2, '#9ca18d', 0.6);
      }
      this.text(
        this.staticGroup,
        `${String(ci + 1).padStart(2, '0')}  ${car.name}`,
        x + w / 2 - 0.5,
        -1.4,
        '#efe5cd',
        0.48,
      );
    }
    const engineX = s.cars.length * 14 + 1.5;
    this.sprite(this.staticGroup, 14, engineX, 2.2, 7.5, 6.6, 2);
    this.text(this.staticGroup, '巡游者号 · 02', engineX, -1.6, '#ddc38c', 0.5);
    this.rect(this.staticGroup, s.cars.length * 14 - 2, 2, 2.6, 1, '#333e3c', 0);
    for (const f of s.facilities) {
      if (f.layer !== this.layer && f.kind !== 'hatch') continue;
      this.drawFacility(f);
    }
  }
  private drawFacility(f: Facility) {
    const d = footprint(f),
      cx = f.x + (d.w - 1) / 2,
      cy = f.y + (d.h - 1) / 2,
      opacity = f.built ? 1 : 0.4;
    if (f.kind === 'hatch') {
      this.rect(this.staticGroup, cx, cy, 0.95, 0.95, '#d5bb78', 0.7);
      this.rect(this.staticGroup, cx, cy, 0.76, 0.78, f.hp > 0 ? '#273d3d' : '#091515', 0.8);
      for (let y = -0.25; y <= 0.26; y += 0.18)
        this.rect(this.staticGroup, cx, cy + y, 0.58, 0.05, '#acaa89', 0.9);
      return;
    }
    if (f.kind === 'engine') {
      this.rect(this.staticGroup, cx, cy, 0.95, 0.9, '#3c544b', 0.7);
      this.text(this.staticGroup, '动力', cx, cy, '#d6c495', 0.3);
      return;
    }
    const h = f.kind === 'bed' ? 1.55 : f.kind === 'storage' ? 1.25 : 1.65;
    const spr = this.sprite(
      this.staticGroup,
      FACILITY[f.kind].tile,
      cx,
      cy - 0.2,
      d.w + 0.12,
      h,
      1.3 + cy * 0.025,
      '#ffffff',
      opacity,
    );
    if (f.rotation % 2) spr.rotation.z = Math.PI / 2;
    if (!f.built) {
      this.rect(this.staticGroup, cx, cy, 0.9, 0.05, '#aee1d0', 2);
      this.text(this.staticGroup, '待建', cx, cy - 0.7, '#aee1d0', 0.28);
    }
  }
  private makeRig(p: Pawn, s: GameState): Rig {
    const root = new THREE.Group();
    this.units.add(root);
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
    root.add(hips);
    const bone = (parent: THREE.Object3D, x: number, y: number) => {
      const b = new THREE.Bone();
      b.position.set(x, y, 0.015);
      parent.add(b);
      return b;
    };
    const tint = p.enemy ? '#d7a296' : '#ffffff';
    const leftLeg = bone(hips, -0.115, -0.04),
      rightLeg = bone(hips, 0.115, -0.04);
    this.sprite(leftLeg, 4, 0, 0.17, 0.23, 0.48, 0.01, tint);
    this.sprite(rightLeg, 5, 0, 0.17, 0.23, 0.48, 0.02, tint);
    const torso = bone(hips, 0, 0.23);
    this.sprite(torso, 1, 0, -0.08, 0.52, 0.62, 0.04, tint);
    const leftArm = bone(torso, -0.24, 0.24),
      rightArm = bone(torso, 0.24, 0.24);
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
      stamp = `${this.layer}:${s.cars.length}:${s.facilities.map((f) => `${f.id}:${f.built}:${f.rotation}:${f.hp <= 0}`).join(',')}`;
    if (stamp !== this.stamp) {
      this.rebuild(s);
      this.stamp = stamp;
    }
    this.grid.visible = this.gridVisible;
    for (const wheel of this.wheels) wheel.rotation.z = -s.distance * 2.8;
    this.rails.position.x = -((s.distance * 2) % 1.2);
    for (const p of s.pawns) {
      let rig = this.rigs.get(p.id);
      if (!rig) {
        rig = this.makeRig(p, s);
        this.rigs.set(p.id, rig);
      }
      rig.root.visible = p.layer === this.layer;
      if (!rig.root.visible) continue;
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
      rig.root.position.set(p.x, -p.y, 3 + p.y * 0.07);
      rig.root.scale.set(p.facing, 1, 1);
      rig.root.rotation.z = p.dead
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
        rig.root.scale.multiplyScalar(0.9);
      }
    }
    for (const [id, rig] of this.rigs)
      if (!s.pawns.some((p) => p.id === id)) {
        this.disposeRig(rig);
        this.rigs.delete(id);
      }
    this.effectGroup.clear();
    for (const e of s.effects) {
      if (e.layer !== this.layer) continue;
      if (e.kind === 'shot') {
        const dx = e.tx - e.x,
          dy = e.ty - e.y;
        const beam = this.rect(
          this.effectGroup,
          (e.x + e.tx) / 2,
          (e.y + e.ty) / 2 - 0.6,
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
          e.ty - 0.8,
          e.kind === 'heal' ? '#92d4ba' : '#efb48b',
          0.48,
        );
    }
    if (this.selected.length === 1) {
      const p = s.pawns.find((p) => p.id === this.selected[0]);
      if (p?.task?.path.length) {
        for (const n of p.task.path)
          if (n.layer === this.layer)
            this.rect(this.effectGroup, n.x, n.y, 0.09, 0.09, '#d5c69c', 2, 0.6);
      }
    }
    this.selectionGhost.clear();
    if (this.buildKind && this.hoverPoint) {
      const d = FACILITY[this.buildKind as keyof typeof FACILITY];
      if (d) {
        const width = this.buildRotation % 2 ? d.h : d.w;
        const height = this.buildRotation % 2 ? d.w : d.h;
        const ghost = this.sprite(
          this.selectionGhost,
          d.tile,
          Math.round(this.hoverPoint.x) + (width - 1) / 2,
          Math.round(this.hoverPoint.y) + (height - 1) / 2 - 0.2,
          d.w,
          1.5,
          7,
          '#b9eddb',
          0.55,
        );
        ghost.rotation.z = this.buildRotation % 2 ? Math.PI / 2 : 0;
      }
    }
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
