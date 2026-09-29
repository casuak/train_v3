import { version } from '../../package.json';
import { FACILITY, ITEM, NODES, RECIPE, WORKS, WORK_NAME } from '../sim/content';
import {
  addCar,
  allies,
  attackOrder,
  availableRoutes,
  billCanRun,
  build,
  cancelTask,
  count,
  depart,
  dismantle,
  draft,
  emergencyFuel,
  enemies,
  forceEat,
  forceFacility,
  log,
  movePawn,
  setSpeed,
  temperature,
  togglePause,
  trade,
  uid,
} from '../sim/game';
import { findPath, LANE_Y } from '../sim/navigation';
import { deserialize, exportGame, loadGame, saveGame } from '../save/storage';
import type { FacilityKind, GameState, Item, Point, Work } from '../sim/types';
import { TrainScene, type Pick } from '../render/scene';
import { Sound } from './audio';
import { updateHTML } from './dom';
export const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const ico = (name: string) => {
  const paths: Record<string, string> = {
    train: 'M3 7h18v10H3z M6 3h12v4 M7 20h0 M17 20h0 M7 10h4v4H7z M15 10h3',
    people:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    hammer: 'm14 3 7 7-3 3-7-7z M12 10 3 19l2 2 9-9',
    map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
    box: 'm3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
    book: 'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h5',
    settings: 'M4 6h16 M4 12h16 M4 18h16 M9 3v6 M15 9v6 M8 15v6',
    arrow: 'M5 12h14 m-6-6 6 6-6 6',
    close: 'm6 6 12 12 M6 18 18 6',
    sun: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 m-3-9-2 2 M5 19l2-2 M3 3l2 2 m14 14 2 2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
    save: 'M4 3h13l4 4v14H3V3z M7 3v6h10V3 M7 21v-8h10v8',
    help: 'M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5 M12 17h0 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.train}"/></svg>`;
};
const button = (action: string, label: string | number, extra = '', cls = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
function timeLabel(s: GameState) {
  const total = Math.floor(s.time * 3 + 360),
    day = Math.floor(total / 1440) + 1,
    min = total % 1440;
  return {
    day,
    text: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
  };
}
export class GameUI {
  readonly sound = new Sound();
  selected: string[] = [];
  facility: string | null = null;
  modal = '';
  modalFacility = '';
  mapNode = 'farm';
  buildKind: FacilityKind | null = null;
  rotation = 0;
  private toastTimer = 0;
  private lastNode = '';
  private firstStart = true;
  private lastRaid = false;
  private dragging: {
    pointerId: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    button: number;
    moved: boolean;
  } | null = null;
  private el: (id: string) => HTMLElement;
  constructor(
    private root: HTMLElement,
    private getState: () => GameState,
    readonly scene: TrainScene,
    private replace: (s: GameState) => void,
    private newGame: () => void,
  ) {
    this.el = (id) => document.getElementById(id)!;
    root.insertAdjacentHTML(
      'beforeend',
      `
   <header class="topbar"><div class="brand">${ico('train')}<div><b>逐温线</b><span>THE WANDERING LINE</span></div><i>横版 2D · 侧视</i></div><div id="resources" class="resources"></div><div class="header-actions">${button('save', ico('save'), 'title="保存旅程" aria-label="保存旅程"', 'icon-button')}${button('help', ico('help'), 'title="操作指南" aria-label="操作指南"', 'icon-button')}${button('menu', ico('settings'), 'title="旅程菜单" aria-label="旅程菜单"', 'icon-button')}</div></header>
   <div id="crew" class="crewbar"></div>
   <aside id="journey-panel" class="journey-panel panel"></aside><aside id="weather" class="weather-panel panel"></aside>
   <div class="view-controls">${button('layer-inside', '车内作业', 'data-layer="inside"', 'layer active')}${button('layer-roof', '车顶防守', 'data-layer="roof"', 'layer')}<span class="separator"></span>${button('zoom-out', '−', 'aria-label="缩小"', 'zoom')}${button('fit', '全景', 'title="恢复全景"', 'zoom fit')}${button('zoom-in', '＋', 'aria-label="放大"', 'zoom')}</div>
   <div id="raid-alert"></div><div id="inspect" class="inspect-panel panel"></div><div id="recent-log" class="recent-log"></div>
   <div id="build-banner" class="build-banner"></div><div id="hint" class="scene-hint">左键选择 · 右键行动 · 滚轮缩放 · 中键拖动</div>
   <footer class="bottom-bar"><nav>${[
     ['train', '列车概况', 'overview'],
     ['people', '工作安排', 'work'],
     ['hammer', '建造', 'build'],
     ['map', '铁路地图', 'map'],
     ['box', '物资', 'inventory'],
     ['book', '日志', 'journal'],
   ]
     .map(([i, t, a]) =>
       button(a, `${ico(i)}<span>${t}</span>`, '', `nav-btn ${a === 'overview' ? 'active' : ''}`),
     )
     .join(
       '',
     )}</nav><div class="speed-area"><span id="clock"></span><div id="speed-buttons" class="speed-buttons">${button('speed', 'Ⅱ', 'data-speed="0" aria-label="暂停" title="暂停（空格）"')}${button('speed', '1×', 'data-speed="1" aria-label="1倍速"')}${button('speed', '2×', 'data-speed="2" aria-label="2倍速"')}${button('speed', '3×', 'data-speed="3" aria-label="3倍速"')}</div></div></footer>
   <div id="modal-root"></div><div id="context-menu" class="context-menu" hidden></div><div id="toast" class="toast" role="status"></div><div id="select-box" class="select-box" hidden></div><input id="import-save" type="file" accept=".json,application/json" hidden/><div class="small-screen-notice">请使用 PC 浏览器，窗口建议至少 1024 × 720。</div>
  `,
    );
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (b) {
        e.stopPropagation();
        this.sound.unlock();
        this.sound.play();
        void this.action(b.dataset.action!, b.dataset, e as MouseEvent);
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.billId) {
        const b = this.getState()
          .facilities.flatMap((f) => f.bills)
          .find((b) => b.id === t.dataset.billId);
        if (b) {
          b.target = Math.max(1, Math.min(999, Number(t.value) || 1));
          b.remaining = b.target;
          this.refreshModal();
        }
      }
    });
    this.el('import-save').addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      if (!f) return;
      try {
        this.restore(deserialize(await f.text()));
        this.toast('存档已导入，游戏处于暂停状态');
      } catch (err) {
        this.toast(String(err), true);
      }
      input.value = '';
    });
    this.bindCanvas();
    window.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.cancelDrag();
        setSpeed(this.getState(), 0);
        this.refresh();
      }
    });
    window.addEventListener('blur', () => {
      this.cancelDrag();
      this.hideContext();
      setSpeed(this.getState(), 0);
      this.refresh();
    });
    this.refresh();
    this.welcome();
  }
  private state() {
    return this.getState();
  }
  private resetSession(firstStart: boolean) {
    this.cancelDrag();
    this.hideContext();
    this.closeModal();
    this.selected = [];
    this.facility = null;
    this.buildKind = null;
    this.rotation = 0;
    this.modalFacility = '';
    this.mapNode = 'farm';
    this.lastRaid = false;
    this.lastNode = '';
    this.firstStart = firstStart;
    this.scene.hoverPoint = null;
    this.setLayer('inside');
  }
  private restore(saved: GameState) {
    this.resetSession(false);
    this.replace(saved);
    this.mapNode = saved.journey?.to ?? saved.node;
    this.refresh();
  }
  toast(text: string, error = false) {
    const el = this.el('toast');
    el.textContent = text;
    el.className = `toast show ${error ? 'error' : ''}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 3500);
  }
  private result(err: string | null, success: string) {
    this.toast(err ?? success, !!err);
    this.refresh();
  }
  welcome() {
    this.modal = 'welcome';
    this.el('modal-root').innerHTML =
      `<div class="modal-backdrop welcome-backdrop"><section class="welcome-card"><div class="eyebrow">A JOURNEY THROUGH THE CHANGING WORLD</div><div class="welcome-emblem">${ico('train')}</div><h1>逐温线</h1><p class="english-title">THE WANDERING LINE</p><div class="fine-rule"></div><p class="welcome-copy">世界正在变冷。<br/>带上六位旅人，一列火车，<br/>和寻找下一个春天的希望。</p><div class="welcome-features"><span>经营列车</span><i>✦</i><span>选择旅途</span><i>✦</i><span>守住车顶</span></div>${button('start', `开始迁徙 ${ico('arrow')}`, '', 'primary welcome-start')}<div class="welcome-secondary">${button('continue', '读取旅程存档')}${button('help', '游玩指南')}</div><p class="welcome-foot">横版 2D · PC 键鼠 · 空格暂停<br/>试玩版本 / v${version}</p></section></div>`;
  }
  refresh() {
    const s = this.state(),
      living = allies(s),
      t = timeLabel(s);
    this.scene.selected = this.selected;
    this.scene.selectedFacility = this.facility;
    this.scene.buildKind = this.buildKind;
    this.scene.buildRotation = this.rotation;
    this.scene.gridVisible = !!this.buildKind;
    updateHTML(
      this.el('resources'),
      (['meal', 'fuel', 'parts', 'metal'] as Item[])
        .map((i) =>
          button(
            'inventory',
            `<span class="resource-icon" style="color:${ITEM[i].color}">${ITEM[i].icon}</span><span><small>${ITEM[i].name}</small><b>${Math.floor(count(s, i))}</b></span>`,
            `title="查看${ITEM[i].name}和全部物资"`,
            'resource',
          ),
        )
        .join('') + `<div class="crew-count"><b>${living.length}</b><small>旅人</small></div>`,
    );
    updateHTML(
      this.el('crew'),
      s.pawns
        .filter((p) => !p.enemy)
        .map((p) =>
          button(
            'select',
            `<div class="portrait ${p.dead ? 'fallen' : ''}" style="--portrait-color:${p.color}"><span class="portrait-image"></span>${p.drafted ? '<i class="draft-mark">⚔</i>' : ''}<div class="portrait-health" style="width:${p.hp}%"></div></div><b>${esc(p.name)}</b><small>${p.dead ? '已阵亡' : esc(p.status)}</small>`,
            `data-id="${p.id}" aria-label="选择${esc(p.name)}" title="${esc(p.role)} · 饱食 ${Math.round(p.hunger)} · 精力 ${Math.round(p.energy)}"`,
            `crew-card ${this.selected.includes(p.id) ? 'selected' : ''} ${p.dead ? 'dead' : ''}`,
          ),
        )
        .join(''),
    );
    const j = s.journey,
      node = NODES.find((n) => n.id === s.node)!,
      dest = j ? NODES.find((n) => n.id === j.to)! : null,
      progress = j ? Math.min(100, (j.elapsed / j.duration) * 100) : 0;
    updateHTML(
      this.el('journey-panel'),
      `<div class="eyebrow">THE EXPEDITION</div><div class="journey-title"><h2>向暖而行</h2><span class="status-dot ${j ? 'moving' : ''}"></span></div><p class="muted">第 ${t.day} 日 · ${j ? '穿越铁路荒野' : '停靠整备'}</p><div class="journey-stops"><span>${esc(node.name)}</span><i>↓</i><strong>${dest ? esc(dest.name) : '下一站，由你决定'}</strong></div><div class="progress-track"><i style="width:${progress}%"></i></div><div class="journey-meta"><span>${j ? `${Math.max(0, Math.ceil((j.duration - j.elapsed) * 3))} 游戏分钟` : '可进行交易与补给'}</span><b>${j ? Math.round(progress) + '%' : '停靠中'}</b></div>${button('map', `${j ? '查看铁路地图' : '选择下一站'} ${ico('arrow')}`, '', 'route-button')}<div class="destination-note"><span>最终目的地</span><b>白桦避风港</b></div>`,
    );
    updateHTML(
      this.el('weather'),
      `<div class="eyebrow">${s.weather > 0.4 ? 'COLD FRONT APPROACHING' : 'AUTUMN / NORTHLAND'}</div><div class="temperature">${ico('sun')}<b>${Math.round(s.temperature)}<sup>°C</sup></b><span>${s.weather > 0.5 ? '寒潮' : '薄云'}</span></div><div class="weather-detail"><span>车内 ${Math.round(temperature(s, 'inside'))}°C</span><span>秋 · 第 ${t.day} 日</span></div><p>${s.time < 400 ? '寒潮预计第 2 日到达' : s.time < 1100 ? '北部山线将在第 3 日封锁' : '北部山线已封锁'}</p>`,
    );
    updateHTML(
      this.el('clock'),
      `<small>DAY ${String(t.day).padStart(2, '0')}</small><b>${t.text}</b>`,
    );
    this.el('speed-buttons')
      .querySelectorAll<HTMLButtonElement>('button')
      .forEach((b) => {
        const active = Number(b.dataset.speed) === s.speed;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    updateHTML(
      this.el('raid-alert'),
      s.raidActive
        ? `<div class="raid-alert"><div><b>登车警报</b><span>车顶 ${enemies(s).filter((p) => p.layer === 'roof').length} 人 · 车内 ${enemies(s).filter((p) => p.layer === 'inside').length} 人</span></div>${button('defend', '征召并部署车顶', '', 'danger-button')}${button('layer-roof', '查看车顶')}</div>`
        : '',
    );
    if (s.raidActive && !this.lastRaid) this.sound.play('alarm');
    this.lastRaid = s.raidActive;
    updateHTML(
      this.el('recent-log'),
      s.logs
        .slice(0, 3)
        .map((l) => `<div class="log-line ${l.tone}"><i></i><p>${esc(l.text)}</p></div>`)
        .join(''),
    );
    updateHTML(
      this.el('build-banner'),
      this.buildKind
        ? `<b>放置${FACILITY[this.buildKind].name}</b><span>沿地板放置 · R 翻转 · Esc 取消</span>${button('rotate', '左右翻转')}${button('cancel-build', '完成')}`
        : '',
    );
    this.el('build-banner').classList.toggle('show', !!this.buildKind);
    this.el('hint').textContent = this.buildKind
      ? '沿横向空位放置，室内家具不阻挡通行'
      : s.speed === 0
        ? '已暂停 · 可以安排工作、建造与战术命令 · 空格继续'
        : '左键选择 · 右键行动 · 滚轮缩放 · 中键拖动';
    this.renderInspector();
    document.body.dataset.gameSpeed = String(s.speed);
    document.body.dataset.gameStatus = s.status;
    document.body.dataset.gameLayer = this.scene.layer;
    this.el('app').setAttribute('data-game-time', String(Math.floor(s.time)));
    if (this.lastNode !== s.node) {
      this.lastNode = s.node;
      if (this.modal === 'map') this.refreshModal();
    }
    if (s.status !== 'playing' && this.modal !== 'end' && this.modal !== 'welcome')
      this.endScreen();
  }
  private renderInspector() {
    const s = this.state(),
      ps = s.pawns.filter((p) => this.selected.includes(p.id) && !p.dead),
      f = s.facilities.find((f) => f.id === this.facility),
      el = this.el('inspect');
    if (ps.length) {
      const p = ps[0],
        bars = (label: string, n: number, color: string) =>
          `<div class="stat-line"><span>${label}</span><div><i style="width:${Math.max(0, n)}%;background:${color}"></i></div><b>${Math.round(n)}</b></div>`;
      updateHTML(
        el,
        `<div class="eyebrow">${ps.length > 1 ? `${ps.length} 位旅人已选择` : 'TRAVELER'}</div><div class="inspect-title"><h2>${esc(p.name)}${ps.length > 1 ? ' 等' : ''}</h2><span>${p.enemy ? '敌对' : esc(p.role)}</span>${button('clear', ico('close'), 'aria-label="取消选择"', 'close-small')}</div>${ps.length === 1 ? bars('生命', p.hp, '#95bd9f') + bars('饱食', p.hunger, '#cfb278') + bars('精力', p.energy, '#96adbd') : ''}<p class="current-job">${esc(p.status)}${p.task?.forced ? ' · 强制指令' : ''}</p><div class="inspect-actions">${!p.enemy ? button('draft', `${ico('shield')} ${ps.every((p) => p.drafted) ? '解除征召' : '征召'} <kbd>R</kbd>`, '', 'primary') + button('to-roof', ps.every((p) => p.layer === 'roof') ? '返回车内' : '前往车顶') + button('eat', '进食') + button('rest', '休息') : ''}</div>`,
      );
      el.classList.add('visible');
      return;
    }
    if (f) {
      const def = FACILITY[f.kind];
      updateHTML(
        el,
        `<div class="eyebrow">${f.layer === 'roof' ? 'ROOFTOP' : 'TRAIN FACILITY'}</div><div class="inspect-title"><h2>${def.name}</h2>${button('clear', ico('close'), 'aria-label="取消选择"', 'close-small')}</div><p class="facility-description">${def.description}</p><div class="facility-condition"><span>${f.built ? '耐久' : '建造进度'}</span><b>${f.built ? `${Math.ceil(f.hp)} / ${f.maxHp}` : `${Math.round(f.buildProgress * 100)}%`}</b></div><div class="inspect-actions">${f.kind === 'stove' || f.kind === 'bench' ? button('production', '设置制作清单', `data-id="${f.id}"`, 'primary') : ''}${f.kind === 'heater' ? button('toggle-facility', f.enabled ? '关闭供暖' : '开启供暖', `data-id="${f.id}"`) : ''}${def.buildable ? button('dismantle', f.built ? '拆除设施' : '取消蓝图', `data-id="${f.id}"`) : ''}</div><small>选择旅人后右键设施，可安排强制工作。</small>`,
      );
      el.classList.add('visible');
      return;
    }
    el.classList.remove('visible');
    updateHTML(el, '');
  }
  private panel(title: string, subtitle: string, body: string, wide = false) {
    this.el('modal-root').innerHTML =
      `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}"><header class="modal-header"><div><div class="eyebrow">${subtitle}</div><h2>${title}</h2></div>${button('close', ico('close'), 'aria-label="关闭面板"', 'icon-button')}</header><div class="modal-body">${body}</div></section></div>`;
  }
  closeModal() {
    this.modal = '';
    this.el('modal-root').innerHTML = '';
  }
  open(name: string) {
    this.modal = name;
    this.refreshModal();
  }
  refreshModal() {
    const s = this.state();
    if (this.modal === 'work') {
      this.panel(
        '每个人，都有自己的位置',
        'WORK PRIORITIES',
        `<p class="modal-intro">点击数字切换：<b>1 最高</b> → 2 → 3 → 4 → — 禁用。同优先级从左向右处理；自动生活优先于普通工作。</p><table class="work-table"><thead><tr><th>旅人 / 专长</th>${WORKS.map((w) => `<th>${WORK_NAME[w]}</th>`).join('')}</tr></thead><tbody>${allies(
          s,
        )
          .map(
            (p) =>
              `<tr><td><b>${esc(p.name)}</b><small>${esc(p.role)}</small></td>${WORKS.map((w) => `<td>${button('priority', p.priorities[w] || '—', `data-id="${p.id}" data-work="${w}" aria-label="${esc(p.name)} ${WORK_NAME[w]} 优先级 ${p.priorities[w]}"`, `priority p${p.priorities[w]}`)}<small>技能 ${p.skills[w]}</small></td>`).join('')}</tr>`,
          )
          .join(
            '',
          )}</tbody></table><div class="notice">征召中的旅人接受战术指令，不会自动工作或离岗吃饭。解除征召后恢复日常安排。</div>`,
        true,
      );
      return;
    }
    if (this.modal === 'build') {
      this.panel(
        '给旅途留一个位置',
        'BUILD & ARRANGE',
        `<p class="modal-intro">选择设施后，沿车厢地板的空位放置。家具靠后墙布置，旅人从前方通过；车顶掩体会阻挡通行。</p><div class="build-grid">${Object.entries(
          FACILITY,
        )
          .filter(([, d]) => d.buildable)
          .map(([kind, d]) =>
            button(
              'build-kind',
              `<span class="asset-preview tile-${d.tile}"></span><b>${d.name}</b><p>${d.description}</p><small>◇ ${d.cost} 废钢 · ${kind === 'barricade' ? '车顶' : '车内'}</small>`,
              `data-kind="${kind}"`,
              'build-card',
            ),
          )
          .join('')}</div>`,
        true,
      );
      return;
    }
    if (this.modal === 'inventory') {
      this.panel(
        '旅途的底气',
        'STORES & SUPPLIES',
        `<p class="modal-intro">统计包括储柜、地面和搬运中的物资。生产与建造会预约材料，避免重复取用。</p><div class="inventory-grid">${Object.entries(
          ITEM,
        )
          .map(
            ([i, d]) =>
              `<div class="inventory-item"><span style="color:${d.color}">${d.icon}</span><b>${Math.floor(count(s, i as Item))}</b><small>${d.name}</small></div>`,
          )
          .join(
            '',
          )}</div><div class="inventory-summary"><span>交易票券</span><b>${s.credits}</b></div>${button('map', '打开地图 · 在车站补给', '', 'primary')}${count(s, 'fuel') <= 8 ? button('emergency', '派出应急搜集队（消耗精力）') : ''}`,
      );
      return;
    }
    if (this.modal === 'map') {
      this.renderMap();
      return;
    }
    if (this.modal === 'production') {
      const f = s.facilities.find((f) => f.id === this.modalFacility);
      if (!f) {
        this.closeModal();
        return;
      }
      this.panel(
        FACILITY[f.kind].name,
        'PRODUCTION ORDERS',
        `<p class="modal-intro">任务由工作优先级自动分配。也可选择旅人后右键该设施，强制执行。</p><div class="bill-list">${f.bills.map((b) => `<div class="bill"><div><b>${RECIPE[b.recipe].name}</b><small>${RECIPE[b.recipe].inputQty} ${ITEM[RECIPE[b.recipe].input].name} → ${RECIPE[b.recipe].outputQty} ${ITEM[RECIPE[b.recipe].output].name}</small></div>${button('bill-mode', { stock: '保持库存', times: '制作次数', forever: '持续制作' }[b.mode], `data-id="${b.id}"`)}${b.mode !== 'forever' ? `<label class="bill-quantity"><span>数量</span><input type="number" min="1" max="999" value="${b.mode === 'times' ? b.remaining : b.target}" data-bill-id="${b.id}" aria-label="${RECIPE[b.recipe].name}数量"/></label>` : ''}${button('bill-toggle', b.enabled ? '暂停' : '启用', `data-id="${b.id}"`)}${button('bill-delete', '×', `data-id="${b.id}" aria-label="删除制作任务"`)}</div>`).join('')}</div>${button('bill-add', '＋ 添加制作任务', `data-id="${f.id}"`, 'primary')}<div class="notice">${f.bills.some((b) => billCanRun(s, b)) ? '清单已开放，正在等待工人或材料。' : '当前目标已满足，或任务已暂停。'}</div>`,
      );
      return;
    }
    if (this.modal === 'journal') {
      this.panel(
        '车轮经过的地方',
        'EXPEDITION JOURNAL',
        `<div class="journal">${s.logs.map((l) => `<article class="journal-entry ${l.tone}"><span>第 ${Math.floor((l.time * 3 + 360) / 1440) + 1} 日</span><p>${esc(l.text)}</p></article>`).join('')}</div>`,
      );
      return;
    }
    if (this.modal === 'help') {
      this.panel(
        '一份给列车长的便笺',
        'HOW TO PLAY',
        `<div class="help-lead">你的目标：让旅人活着抵达 <b>白桦避风港</b>。</div><div class="help-steps"><article><b>01 / 安顿旅人</b><p>侧视剖面同时显示车内与车顶。旅人沿各层左右行走，经舷梯上下。小人自动找食物和床，工作安排控制分工。</p></article><article><b>02 / 安排生产</b><p>右键炉灶或工作台设置清单。选择小人后，右键设施可以强制工作。</p></article><article><b>03 / 守住列车</b><p>敌人先登车顶。点击“征召并部署车顶”，恢复时间执行；也可逐人征召，右键移动或攻击。战后解除征召。</p></article><article><b>04 / 继续迁徙</b><p>到站后在铁路地图选择下一站，领取补给或用票券交易。抵达白桦避风港获胜。</p></article></div><table class="shortcut-table"><tr><td>选择 / 框选</td><td>鼠标左键 / 拖拽空地</td></tr><tr><td>菜单 / 强制行动 / 战术移动</td><td>鼠标右键</td></tr><tr><td>平移 / 缩放</td><td>中键或右键拖拽 / 滚轮</td></tr><tr><td>暂停与恢复</td><td><kbd>空格</kbd> 或右下按钮</td></tr><tr><td>1× / 2× / 3×</td><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></td></tr><tr><td>征召 / 楼层 / 关闭</td><td><kbd>R</kbd> / <kbd>Tab</kbd> / <kbd>Esc</kbd></td></tr></table><p class="muted">仅面向 PC 网页端。页面切到后台会自动暂停。右下角四个按钮随时调节游戏速度。</p>${button(this.firstStart ? 'return-welcome' : 'close', this.firstStart ? '返回出发页面' : '回到旅途', '', 'primary')}`,
      );
      return;
    }
    if (this.modal === 'menu') {
      this.panel(
        '把旅途留在这里',
        'JOURNEY MENU',
        `<div class="menu-grid">${button('save', `${ico('save')} 保存旅程`)}${button('continue', '读取手动存档')}${button('load-auto', '读取自动存档')}${button('export', '导出存档文件')}${button('import', '导入存档文件')}${button('sound', this.sound.enabled ? '声音：开启' : '声音：关闭')}${button('help', '操作指南')}${button('new-confirm', '开始新的旅程')}</div><div class="notice">每 60 秒自动保存。存档保存在当前浏览器；导出文件可备份或换电脑继续。</div>`,
      );
      return;
    }
    if (this.modal === 'new-confirm') {
      this.panel(
        '开始另一段旅途？',
        'NEW EXPEDITION',
        `<p>当前未保存的进度会被替换。手动存档仍会保留。</p><div class="confirm-actions">${button('save', '先保存当前旅程')}${button('new', '开始新旅程', '', 'primary')}${button('close', '取消')}</div>`,
      );
      return;
    }
    if (this.modal === 'overview') {
      this.panel(
        '巡游者号',
        'TRAIN MANIFEST',
        `<div class="overview-grid"><div><small>旅人</small><b>${allies(s).length} / 6</b></div><div><small>车厢</small><b>${s.cars.length}</b></div><div><small>已行驶</small><b>${s.distance.toFixed(1)} km</b></div><div><small>动力状况</small><b>${Math.ceil(s.facilities.find((f) => f.kind === 'engine')!.hp / 2.5)}%</b></div></div><h3>列车长的手记</h3><div class="objectives">${[
          [s.flags.departed, '选择路线，驶离机务段'],
          [s.stats.meals > 0, '让厨房完成一批热食'],
          [s.stats.builds > 0, '为旅人添置一件设施'],
          [s.stats.battles > 0, '击退一次登车袭击'],
          [s.status === 'won', '带领旅人抵达白桦避风港'],
        ]
          .map(
            ([done, text]) =>
              `<div class="${done ? 'done' : ''}"><i>${done ? '✓' : '○'}</i><span>${text}</span></div>`,
          )
          .join(
            '',
          )}</div><div class="confirm-actions">${button('release-all', '解除所有旅人征召')}${button('map', '规划下一段旅途', '', 'primary')}</div>`,
      );
    }
  }
  private renderMap() {
    const s = this.state(),
      selected = NODES.find((n) => n.id === this.mapNode) ?? NODES[0],
      routes = availableRoutes(s),
      edge = routes.find((e) => e.destination === selected.id);
    const j = s.journey;
    const lines = [
      ['depot', 'coal'],
      ['depot', 'farm'],
      ['coal', 'yard'],
      ['farm', 'market'],
      ['yard', 'pass'],
      ['market', 'pass'],
      ['pass', 'haven'],
    ];
    const rail = lines
      .map(([a, b]) => {
        const p = NODES.find((n) => n.id === a)!,
          q = NODES.find((n) => n.id === b)!,
          active = j && ((j.from === a && j.to === b) || (j.to === a && j.from === b));
        return `<path d="M${p.x} ${p.y} C${(p.x + q.x) / 2} ${p.y},${(p.x + q.x) / 2} ${q.y},${q.x} ${q.y}" class="rail-link ${active ? 'travelled' : ''}"/>`;
      })
      .join('');
    let marker = '';
    if (j) {
      const a = NODES.find((n) => n.id === j.from)!,
        b = NODES.find((n) => n.id === j.to)!,
        r = j.elapsed / j.duration;
      marker = `<circle cx="${a.x + (b.x - a.x) * r}" cy="${a.y + (b.y - a.y) * r}" r="6" fill="#dfb671"/>`;
    }
    this.panel(
      '铁路以南，春天尚存',
      'THE RAILWAY ATLAS',
      `<div class="map-layout"><div class="map-paper"><div class="map-caption">北境铁路网 <span>第 ${timeLabel(s).day} 日 / ${s.weather > 0.5 ? '寒潮南下' : '秋末'}</span></div><svg class="railway-map" viewBox="0 0 880 350" role="img" aria-label="铁路路线图"><defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#738f85" opacity=".18"/></pattern></defs><rect width="880" height="350" fill="url(#dots)"/><path d="M120 0Q250 160 170 350 M430 0Q500 180 420 350" stroke="#6b8982" opacity=".1" fill="none" stroke-width="45"/><text x="340" y="32" class="region-label">寒 风 山 脊</text><text x="268" y="338" class="region-label">河 谷 平 原</text>${rail}${NODES.map((n) => `<g class="map-node ${n.id === s.node ? 'current' : ''} ${n.id === selected.id ? 'chosen' : ''}" data-action="map-node" data-id="${n.id}" role="button" tabindex="0" aria-label="${n.name}"><circle cx="${n.x}" cy="${n.y}" r="${n.id === s.node ? 13 : 9}"/><circle cx="${n.x}" cy="${n.y}" r="3" class="node-core"/><text x="${n.x}" y="${n.y + 29}">${n.name}</text><text x="${n.x}" y="${n.y + 45}" class="map-tag">${n.tag}</text></g>`).join('')}${marker}</svg><div class="map-legend"><span><i></i>当前位置</span><span>虚线为可用铁路</span><span>北部山线：${s.time >= 1100 ? '已封锁' : '寒潮前可通行'}</span></div><div class="node-list">${NODES.map((n) => button('map-node', n.name, `data-id="${n.id}"`, `node-button ${selected.id === n.id ? 'active' : ''}`)).join('')}</div></div><aside class="route-detail"><div class="eyebrow">${selected.id === s.node ? 'CURRENT STATION' : 'DESTINATION'}</div><h3>${selected.name}</h3><p>${selected.description}</p>${edge && !j ? `<dl><div><dt>旅行时间</dt><dd>${Math.ceil(edge.duration / 60)} 分钟 / 1×</dd></div><div><dt>燃煤需求</dt><dd>${Math.ceil(edge.fuel * (1 + (s.cars.length - 3) * 0.12))}</dd></div><div><dt>登车风险</dt><dd>${edge.risk > 0.7 ? '高' : edge.risk > 0.3 ? '中' : '低'}</dd></div><div><dt>当地温度</dt><dd>${selected.temp}°C</dd></div></dl>${button('depart', `驶向${selected.name}`, `data-id="${selected.id}"`, 'primary')}` : j ? `<div class="notice">正在驶向${NODES.find((n) => n.id === j.to)!.name}。到站后可选择下一条线路。</div>` : selected.id !== s.node ? '<div class="notice">需要沿相连的铁路逐站前进。</div>' : ''}${selected.id === s.node && !j ? `<h4>站点交易 · ${s.credits} 票券</h4><div class="trade-buttons">${button('trade', '燃煤 +10 / 10券', 'data-item="fuel" data-amount="10"')}${button('trade', '食材 +10 / 10券', 'data-item="raw" data-amount="10"')}${button('trade', '药品 +2 / 10券', 'data-item="medicine" data-amount="2"')}${button('sell', '售出废钢 5 / +6券', 'data-item="metal" data-amount="5"')}</div>${s.node === 'yard' && !s.flags.extraCar ? button('add-car', '修复并挂接货厢 / 4零件', '', 'primary') : ''}` : ''}</aside></div>`,
      true,
    );
  }
  private endScreen() {
    const s = this.state();
    this.modal = 'end';
    this.panel(
      s.status === 'won' ? '你们抵达了春天' : '这段旅途，在此停下',
      s.status === 'won' ? 'A NEW PLACE TO CALL HOME' : 'THE END OF THIS JOURNEY',
      `<div class="ending"><div class="ending-symbol">${s.status === 'won' ? '✧' : '◇'}</div><p>${s.status === 'won' ? '白桦林挡住了北方的风。炉火还亮着，车轮终于可以歇一会儿。' : '列车依旧留在铁轨上，故事会被下一批旅人记住。'}</p><div class="overview-grid"><div><small>幸存旅人</small><b>${allies(s).length}</b></div><div><small>击退袭击</small><b>${s.stats.battles}</b></div><div><small>生产热食</small><b>${s.stats.meals}</b></div><div><small>行驶距离</small><b>${s.distance.toFixed(1)} km</b></div></div>${button('export', '导出这段旅程')}${button('new-confirm', '开始新的迁徙', '', 'primary')}</div>`,
    );
    this.sound.play('good');
  }
  private async action(a: string, d: DOMStringMap, e?: MouseEvent) {
    const s = this.state();
    this.hideContext();
    if (a === 'start') {
      this.firstStart = false;
      this.closeModal();
      this.open('map');
      return;
    }
    if (a === 'return-welcome') {
      this.welcome();
      return;
    }
    if (a === 'close') {
      this.closeModal();
      return;
    }
    if (a === 'speed') {
      setSpeed(s, Number(d.speed) as 0 | 1 | 2 | 3);
      this.refresh();
      return;
    }
    if (
      [
        'overview',
        'work',
        'build',
        'map',
        'inventory',
        'journal',
        'help',
        'menu',
        'new-confirm',
      ].includes(a)
    ) {
      if (a === 'help' || a === 'menu' || a === 'new-confirm') setSpeed(s, 0);
      this.open(a);
      return;
    }
    if (a === 'select') {
      const p = s.pawns.find((p) => p.id === d.id);
      if (!p || p.dead) return;
      this.selected = e?.shiftKey ? [...new Set([...this.selected, p.id])] : [p.id];
      this.facility = null;
      this.setLayer(p.layer);
    }
    if (a === 'clear') {
      this.selected = [];
      this.facility = null;
    }
    if (a === 'layer-inside') this.setLayer('inside');
    if (a === 'layer-roof') this.setLayer('roof');
    if (a === 'fit') this.scene.fit();
    if (a === 'zoom-in' || a === 'zoom-out') {
      const r = this.scene.container.getBoundingClientRect();
      this.scene.zoomAt(a === 'zoom-in' ? 1.18 : 1 / 1.18, r.x + r.width / 2, r.y + r.height / 2);
    }
    if (a === 'draft') {
      const ps = allies(s).filter((p) => this.selected.includes(p.id));
      draft(s, this.selected, !ps.every((p) => p.drafted));
    }
    if (a === 'release-all') {
      draft(
        s,
        allies(s).map((p) => p.id),
        false,
      );
      this.toast('全员已解除征召，恢复日常工作');
    }
    if (a === 'to-roof') {
      const selected = allies(s).filter((p) => this.selected.includes(p.id));
      const target =
        selected.length && selected.every((p) => p.layer === 'roof') ? 'inside' : 'roof';
      for (const p of selected.filter((p) => p.layer !== target)) {
        const h = s.facilities
          .filter((f) => f.kind === 'hatch')
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
        if (h) movePawn(s, p, { x: h.x, y: h.y, layer: target });
      }
      this.setLayer(target);
    }
    if (a === 'eat') {
      for (const id of this.selected) this.result(forceEat(s, id), '已安排进食');
    }
    if (a === 'rest') {
      for (const p of allies(s).filter((p) => this.selected.includes(p.id))) {
        const beds = s.facilities
          .filter((f) => f.kind === 'bed' && f.built)
          .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        let err: string | null = '没有可用床位';
        for (const b of beds) {
          err = forceFacility(s, p.id, b.id);
          if (!err) break;
        }
        this.result(err, '已安排休息');
      }
    }
    if (a === 'priority') {
      const p = s.pawns.find((p) => p.id === d.id)!;
      const w = d.work as Work;
      p.priorities[w] = (p.priorities[w] + 1) % 5;
      this.refreshModal();
    }
    if (a === 'production') {
      this.modalFacility = d.id!;
      this.open('production');
    }
    if (a === 'bill-add') {
      const f = s.facilities.find((f) => f.id === d.id)!;
      f.bills.push({
        id: uid(s, 'bill'),
        recipe: f.kind === 'stove' ? 'meal' : 'parts',
        mode: 'times',
        target: 5,
        remaining: 5,
        enabled: true,
      });
      this.refreshModal();
    }
    if (a.startsWith('bill-') && a !== 'bill-add') {
      for (const f of s.facilities) {
        const b = f.bills.find((b) => b.id === d.id);
        if (!b) continue;
        if (a === 'bill-mode')
          b.mode = b.mode === 'stock' ? 'times' : b.mode === 'times' ? 'forever' : 'stock';
        if (a === 'bill-toggle') b.enabled = !b.enabled;
        if (a === 'bill-delete') f.bills = f.bills.filter((b) => b.id !== d.id);
      }
      this.refreshModal();
    }
    if (a === 'build-kind') {
      this.buildKind = d.kind as FacilityKind;
      this.rotation = 0;
      this.setLayer(this.buildKind === 'barricade' ? 'roof' : 'inside');
      this.closeModal();
      this.selected = [];
      this.facility = null;
    }
    if (a === 'rotate') this.rotation = (this.rotation + 1) % 2;
    if (a === 'cancel-build') this.buildKind = null;
    if (a === 'map-node') {
      this.mapNode = d.id!;
      this.refreshModal();
    }
    if (a === 'depart') {
      const err = depart(s, d.id!);
      if (!err) {
        this.closeModal();
        setSpeed(s, 1);
        this.sound.play('good');
      }
      this.result(err, '列车出发了。旅途中的生活与工作将继续。');
    }
    if (a === 'trade' || a === 'sell') {
      this.result(trade(s, d.item as Item, Number(d.amount), a === 'trade'), '交易完成');
      this.refreshModal();
    }
    if (a === 'add-car') {
      this.result(addCar(s), '新车厢已经挂接');
      this.scene.fit();
      this.refreshModal();
    }
    if (a === 'dismantle') {
      this.result(dismantle(s, d.id!), '设施已拆除，回收材料等待搬运');
      this.facility = null;
    }
    if (a === 'toggle-facility') {
      const f = s.facilities.find((f) => f.id === d.id)!;
      f.enabled = !f.enabled;
    }
    if (a === 'defend') {
      const ps = allies(s);
      this.selected = ps.map((p) => p.id);
      draft(s, this.selected, true);
      const car = s.cars[Math.min(1, s.cars.length - 1)];
      for (const [i, p] of ps.entries())
        movePawn(s, p, { x: car.x + 2 + i, y: LANE_Y, layer: 'roof' });
      this.setLayer('roof');
      this.toast('已征召并下达车顶部署命令。点击 1× 或空格执行。');
    }
    if (a === 'force-work' || a === 'force-repair') {
      const id = this.selected[0];
      if (id)
        this.result(
          forceFacility(s, id, d.id!, a === 'force-repair' ? 'repair' : 'work'),
          '已下达强制任务',
        );
      this.hideContext();
    }
    if (a === 'attack') {
      for (const id of this.selected) attackOrder(s, id, d.id!);
      this.hideContext();
    }
    if (a === 'move-here') {
      this.orderMove({ x: Number(d.x), y: LANE_Y, layer: this.scene.layer });
      this.hideContext();
    }
    if (a === 'cancel-job') {
      for (const p of s.pawns.filter((p) => this.selected.includes(p.id))) cancelTask(s, p);
      this.hideContext();
    }
    if (a === 'emergency') this.result(emergencyFuel(s), '应急燃料已入库');
    if (a === 'save') {
      try {
        await saveGame(s);
        this.toast('旅程已保存');
      } catch {
        this.toast('保存失败，请导出文件备份', true);
      }
    }
    if (a === 'continue' || a === 'load-auto') {
      try {
        const saved = await loadGame(a === 'continue' ? 'manual' : 'auto');
        if (!saved) {
          this.toast('没有找到对应存档', true);
          return;
        }
        this.restore(saved);
        this.toast('旅程已恢复，点击倍速按钮继续');
      } catch {
        this.toast('存档读取失败，可尝试导入备份', true);
      }
    }
    if (a === 'export') exportGame(s);
    if (a === 'import') (this.el('import-save') as HTMLInputElement).click();
    if (a === 'sound') {
      this.sound.enabled = !this.sound.enabled;
      this.refreshModal();
    }
    if (a === 'new') {
      this.resetSession(true);
      this.newGame();
      this.welcome();
    }
    this.refresh();
  }
  private setLayer(layer: 'inside' | 'roof') {
    this.scene.layer = layer;
    document.querySelectorAll<HTMLElement>('[data-layer]').forEach((b) => {
      const active = b.dataset.layer === layer;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }
  private hideContext() {
    this.el('context-menu').hidden = true;
  }
  private context(pick: Pick, x: number, y: number) {
    const s = this.state();
    let body = '';
    if (pick.kind === 'facility') {
      const f = s.facilities.find((f) => f.id === pick.id)!;
      body = `<div class="context-title">${FACILITY[f.kind].name}</div>`;
      if (f.kind === 'stove' || f.kind === 'bench')
        body += button('production', '设置制作清单', `data-id="${f.id}"`);
      if (this.selected.length) {
        body += button(
          'force-work',
          f.kind === 'bed' ? '强制休息' : f.built ? '强制执行工作' : '强制建造',
          `data-id="${f.id}"`,
        );
        if (f.hp < f.maxHp) body += button('force-repair', '强制维修', `data-id="${f.id}"`);
      }
      if (f.kind === 'hatch') body += button('to-roof', '通过舱门切换楼层');
    }
    if (pick.kind === 'pawn') {
      const p = s.pawns.find((p) => p.id === pick.id)!;
      if (p.enemy && this.selected.length)
        body = button('attack', `攻击 ${esc(p.name)}`, `data-id="${p.id}"`);
      else body = button('select', `选择 ${esc(p.name)}`, `data-id="${p.id}"`);
    }
    if (pick.kind === 'ground' && this.selected.length) {
      this.orderMove(pick.point);
      return;
    }
    if (this.selected.length) body += button('cancel-job', '取消当前命令');
    if (!body) return;
    const el = this.el('context-menu');
    el.innerHTML = body;
    el.hidden = false;
    el.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - el.offsetHeight - 78)}px`;
  }
  private orderMove(point: Point) {
    const s = this.state(),
      used = new Set<string>();
    let moved = 0;
    for (const p of allies(s).filter((p) => this.selected.includes(p.id))) {
      const options = [0, 1, -1, 2, -2, 3, -3, 4, -4].map((dx) => ({
        ...point,
        x: point.x + dx,
        y: LANE_Y,
      }));
      for (const q of options) {
        const k = `${q.x},${q.y}`;
        if (!used.has(k) && findPath(s, p, q) && movePawn(s, p, q)) {
          used.add(k);
          moved++;
          break;
        }
      }
    }
    if (!moved) this.toast('目标不可达，请检查障碍与楼层连接', true);
  }
  private bindCanvas() {
    const canvas = this.scene.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.modal || e.button > 2) return;
      e.preventDefault();
      this.sound.unlock();
      this.hideContext();
      canvas.setPointerCapture(e.pointerId);
      this.dragging = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        button: e.button,
        moved: false,
      };
    });
    canvas.addEventListener('pointermove', (e) => {
      this.scene.hoverPoint = this.scene.navigationAt(e.clientX, e.clientY);
      const d = this.dragging;
      if (!d || d.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
      if (d.moved && (d.button === 1 || d.button === 2))
        this.scene.pan(e.clientX - d.lastX, e.clientY - d.lastY);
      if (d.moved && d.button === 0 && !this.buildKind) {
        const box = this.el('select-box');
        box.hidden = false;
        box.style.cssText = `left:${Math.min(d.x, e.clientX)}px;top:${Math.min(d.y, e.clientY)}px;width:${Math.abs(e.clientX - d.x)}px;height:${Math.abs(e.clientY - d.y)}px;`;
      }
      d.lastX = e.clientX;
      d.lastY = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      const d = this.dragging;
      if (!d || d.pointerId !== e.pointerId) return;
      this.cancelDrag();
      const pick = this.scene.pick(e.clientX, e.clientY);
      if (d.moved) {
        if (d.button === 0 && !this.buildKind) {
          const ids = allies(this.state())
            .filter((p) => {
              const q = this.scene.screenAt(p);
              return (
                q.x >= Math.min(d.x, e.clientX) &&
                q.x <= Math.max(d.x, e.clientX) &&
                q.y >= Math.min(d.y, e.clientY) &&
                q.y <= Math.max(d.y, e.clientY)
              );
            })
            .map((p) => p.id);
          this.selected = e.shiftKey ? [...new Set([...this.selected, ...ids])] : ids;
          this.facility = null;
        }
        this.refresh();
        return;
      }
      if (d.button === 2) {
        this.setLayer(pick.point.layer);
        this.context(pick, e.clientX, e.clientY);
        return;
      }
      if (d.button !== 0) return;
      if (this.buildKind) {
        const p = this.scene.navigationAt(e.clientX, e.clientY);
        this.result(
          build(
            this.state(),
            this.buildKind,
            { x: Math.round(p.x), y: LANE_Y, layer: p.layer },
            this.rotation,
          ),
          '蓝图已放置',
        );
        return;
      }
      this.setLayer(pick.point.layer);
      if (pick.kind === 'pawn') {
        this.selected = e.shiftKey ? [...new Set([...this.selected, pick.id!])] : [pick.id!];
        this.facility = null;
      } else if (pick.kind === 'facility') {
        this.facility = pick.id!;
        this.selected = [];
      } else {
        this.selected = [];
        this.facility = null;
      }
      this.refresh();
    });
    canvas.addEventListener('pointercancel', () => this.cancelDrag());
    canvas.addEventListener('lostpointercapture', () => this.cancelDrag());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.scene.zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY);
      },
      { passive: false },
    );
    document.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('.context-menu') && e.target !== canvas)
        this.hideContext();
    });
  }
  private cancelDrag() {
    const d = this.dragging;
    this.dragging = null;
    this.el('select-box').hidden = true;
    const canvas = this.scene.renderer.domElement;
    if (d && canvas.hasPointerCapture?.(d.pointerId)) canvas.releasePointerCapture(d.pointerId);
  }
  private key(e: KeyboardEvent) {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (e.target instanceof HTMLElement && e.target.isContentEditable) ||
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    const pausedDialog = ['welcome', 'help', 'menu', 'new-confirm', 'end'].includes(this.modal);
    if (e.code === 'Space') {
      e.preventDefault();
      if (pausedDialog) return;
      togglePause(this.state());
      this.refresh();
    }
    if (['1', '2', '3'].includes(e.key) && !pausedDialog) {
      setSpeed(this.state(), Number(e.key) as 1 | 2 | 3);
      this.refresh();
    }
    if (e.key === 'Escape') {
      this.cancelDrag();
      this.hideContext();
      if (this.buildKind) this.buildKind = null;
      else if (this.modal && this.modal !== 'welcome' && this.modal !== 'end') this.closeModal();
      else {
        this.selected = [];
        this.facility = null;
      }
      this.refresh();
    }
    if (e.key.toLowerCase() === 'r' && !this.modal) {
      if (this.buildKind) this.rotation = (this.rotation + 1) % 2;
      else void this.action('draft', {});
    }
    if (e.key === 'Tab' && !this.modal) {
      e.preventDefault();
      this.setLayer(this.scene.layer === 'inside' ? 'roof' : 'inside');
      this.refresh();
    }
  }
}
