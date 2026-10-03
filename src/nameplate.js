/**
 * ============================================================
 *  nameplate.js  —  لوحة عائمة فوق راس الحارس (اسم + صحة + حالة)
 * ============================================================
 */
import * as THREE from 'three';

const W = 384, H = 128;

export class Nameplate {
  constructor({ width = 2.5, accent = '#ff4d4d' } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex, transparent: true, depthWrite: false, depthTest: false
    }));
    this.sprite.scale.set(width, width * H / W, 1);
    this.sprite.renderOrder = 10;
    this.accent = accent;
    this.data = { name: '', hp: 1, maxHp: 1, status: '', tag: '', dead: false };
    this._dirty = true;
    this._last = '';
  }

  set(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (this.data[k] !== v) { this.data[k] = v; changed = true; }
    }
    if (changed) this._dirty = true;
  }

  update() {
    if (!this._dirty) return;
    this._dirty = false;
    const ctx = this.canvas.getContext('2d');
    const d = this.data;
    const key = `${d.name}|${d.hp.toFixed(0)}|${d.maxHp.toFixed(0)}|${d.status}|${d.tag}|${d.dead}`;
    if (key === this._last) return;
    this._last = key;

    ctx.clearRect(0, 0, W, H);
    // خلفية
    const pad = 8, r = 18;
    ctx.beginPath();
    ctx.moveTo(pad + r, pad);
    ctx.arcTo(W - pad, pad, W - pad, H - pad, r);
    ctx.arcTo(W - pad, H - pad, pad, H - pad, r);
    ctx.arcTo(pad, H - pad, pad, pad, r);
    ctx.arcTo(pad, pad, W - pad, pad, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,10,16,.78)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = d.dead ? 'rgba(255,209,102,.85)' : this.accent;
    ctx.stroke();

    // الاسم
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '700 30px system-ui, "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = '#ffe9e9';
    ctx.fillText(d.name, W - 22, 44);

    // شارة المستوى
    if (d.tag) {
      ctx.font = '700 22px system-ui, "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = 'rgba(255,209,102,.95)';
      ctx.textAlign = 'left';
      ctx.fillText(d.tag, 22, 44);
    }

    // شريط الصحة
    const bx = 22, by = 60, bw = W - 44, bh = 20;
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    this._round(ctx, bx, by, bw, bh, 10); ctx.fill();
    const p = Math.max(0, Math.min(1, d.hp / Math.max(1, d.maxHp)));
    if (p > 0) {
      const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      if (d.dead) { grd.addColorStop(0, '#8a6d3b'); grd.addColorStop(1, '#ffd166'); }
      else { grd.addColorStop(0, '#ff3b3b'); grd.addColorStop(1, '#ff8a3b'); }
      ctx.fillStyle = grd;
      this._round(ctx, bx, by, Math.max(8, bw * p), bh, 10); ctx.fill();
    }
    // كتابة الأرقام
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(Math.max(0, d.hp))} / ${Math.ceil(d.maxHp)}`, W / 2, by + 15);

    // الحالة
    if (d.status) {
      ctx.font = '700 24px system-ui, "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = d.dead ? '#ffd166' : '#bcd3ea';
      ctx.textAlign = 'center';
      ctx.fillText(d.status, W / 2, 114);
    }

    this.tex.needsUpdate = true;
  }

  _round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  setVisible(v) { this.sprite.visible = v; }
}
