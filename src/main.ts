import './style.css';
import { assets } from './assets';
import { initialState, setSpeed } from './sim/game';
import { SimulationClock } from './sim/clock';
import { TrainScene } from './render/scene';
import { GameUI } from './ui/interface';
import { saveGame } from './save/storage';

const root = document.querySelector<HTMLDivElement>('#app')!;
document.documentElement.style.setProperty('--atlas-image', `url("${assets.atlas}")`);
document.documentElement.style.setProperty('--terrain-image', `url("${assets.terrain}")`);
const tileStyles = document.createElement('style');
tileStyles.textContent = Array.from(
  { length: 16 },
  (_, i) =>
    `.tile-${i}{background-position:${((i % 4) / 3) * 100}% ${(Math.floor(i / 4) / 3) * 100}%;}`,
).join('');
document.head.appendChild(tileStyles);
root.innerHTML =
  '<main id="game-stage" class="game-stage"><div class="terrain"></div><div class="atmosphere"></div></main>';
const clock = new SimulationClock();
let state = initialState(),
  lastTime = performance.now(),
  lastUI = 0,
  lastSave = 0,
  lastEffect = 0;
try {
  const scene = new TrainScene(document.getElementById('game-stage')!, () => state);
  function replaceState(next: typeof state) {
    state = next;
    clock.reset();
    scene.reset();
    lastTime = performance.now();
    lastSave = lastTime;
    lastEffect = 0;
  }
  const ui = new GameUI(
    root,
    () => state,
    scene,
    replaceState,
    () => replaceState(initialState()),
  );
  function frame(now: number) {
    const real = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    clock.frame(state, real);
    scene.render();
    const effect = state.effects.at(-1);
    if (effect && effect.id > lastEffect) {
      lastEffect = effect.id;
      if (effect.kind === 'shot') ui.sound.play('shot');
    }
    if (now - lastUI > 200) {
      ui.refresh();
      lastUI = now;
    }
    if (now - lastSave > 60000 && state.time > 0) {
      lastSave = now;
      void saveGame(state, 'auto').catch(() => ui.toast('自动保存失败，请手动导出存档', true));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => {
    setSpeed(state, 0);
    if (state.time > 0) void saveGame(state, 'auto').catch(() => {});
  });
} catch (err) {
  root.innerHTML = `<div class="startup-error"><h1>画面暂时无法启动</h1><p>请使用支持 WebGL 2 的 PC 浏览器，并开启硬件加速。</p><pre>${String(err).replace(/[<>&]/g, '')}</pre><button onclick="location.reload()">重新尝试</button></div>`;
  console.error(err);
}
