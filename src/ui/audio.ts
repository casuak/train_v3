export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  play(kind: 'click' | 'alarm' | 'good' | 'shot' = 'click') {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx,
      t = c.currentTime,
      o = c.createOscillator(),
      g = c.createGain();
    const f = { click: 510, alarm: 260, good: 680, shot: 100 }[kind];
    o.type = kind === 'shot' ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'good' ? 960 : f * 0.6, t + 0.12);
    g.gain.setValueAtTime(kind === 'alarm' ? 0.07 : 0.025, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(t + 0.2);
  }
}
