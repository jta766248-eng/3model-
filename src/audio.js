/**
 * ============================================================
 *  audio.js  —  أصوات مولّدة برمجيا (WebAudio) — بلا ملفات خارجية
 * ============================================================
 */
export class SFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.5;
    this._ambient = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this._noiseBuf = this._makeNoise(1.0);
  }

  resume() { this.ctx?.resume?.(); }

  _makeNoise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** نغمة بسيطة */
  tone({ f0 = 440, f1 = null, dur = 0.15, type = 'sine', gain = 0.25, delay = 0, sweep = 'exp' }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) {
      if (sweep === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(Math.max(1, f1), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** ضربة/انفجار ضوضاء */
  noise({ dur = 0.15, gain = 0.3, f = 1200, q = 1, type = 'lowpass', delay = 0, sweepTo = null }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (sweepTo) flt.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------- الأصوات ----------
  swing() { this.noise({ dur: 0.12, gain: 0.16, f: 900, sweepTo: 300, type: 'bandpass', q: 1.2 }); }
  punchHit() { this.noise({ dur: 0.14, gain: 0.35, f: 320, sweepTo: 90 }); this.tone({ f0: 160, f1: 60, dur: 0.14, type: 'square', gain: 0.16 }); }
  punchMiss() { this.noise({ dur: 0.1, gain: 0.12, f: 700, sweepTo: 250, type: 'bandpass' }); }
  hit() { this.tone({ f0: 320, f1: 140, dur: 0.1, type: 'triangle', gain: 0.2 }); this.noise({ dur: 0.09, gain: 0.2, f: 1800, type: 'bandpass' }); }
  jump() { this.tone({ f0: 330, f1: 620, dur: 0.14, type: 'sine', gain: 0.14 }); }
  dash() { this.noise({ dur: 0.22, gain: 0.22, f: 500, sweepTo: 2400, type: 'bandpass', q: 0.9 }); }
  hurt() { this.tone({ f0: 220, f1: 80, dur: 0.25, type: 'sawtooth', gain: 0.2 }); }
  heroAlert() { this.tone({ f0: 480, f1: 720, dur: 0.16, type: 'square', gain: 0.13 }); }
  heroAttack() { this.tone({ f0: 140, f1: 90, dur: 0.12, type: 'sawtooth', gain: 0.14 }); }
  heroDeath() {
    this.tone({ f0: 420, f1: 90, dur: 0.7, type: 'sawtooth', gain: 0.22, sweep: 'exp' });
    this.noise({ dur: 0.6, gain: 0.25, f: 400, sweepTo: 80 });
  }
  legacyDeath() { this.noise({ dur: 0.3, gain: 0.24, f: 700, sweepTo: 120 }); this.tone({ f0: 180, f1: 70, dur: 0.3, type: 'triangle', gain: 0.14 }); }
  playerDeath() { this.tone({ f0: 300, f1: 60, dur: 1.1, type: 'sawtooth', gain: 0.24 }); }
  respawn() {
    // نغمة صعود = رجع الحارس
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ f0: f, dur: 0.22, type: 'triangle', gain: 0.18, delay: i * 0.09 }));
    this.noise({ dur: 0.5, gain: 0.14, f: 500, sweepTo: 3000, type: 'bandpass' });
  }
  waveStart() {
    [330, 415, 494].forEach((f, i) => this.tone({ f0: f, dur: 0.3, type: 'square', gain: 0.12, delay: i * 0.12 }));
  }
  click() { this.tone({ f0: 900, f1: 1300, dur: 0.07, type: 'triangle', gain: 0.12 }); }
}
