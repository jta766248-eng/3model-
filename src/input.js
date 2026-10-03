/**
 * ============================================================
 *  input.js  —  لوحة المفاتيح + الماوس + اللمس (أنالوج وأزرار)
 * ============================================================
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this.move = { x: 0, y: 0 };        // x: يمين، y: أمام
    this.look = { x: 0, y: 0 };        // فرق الكاميرا هذي الفريم
    this.zoomDelta = 0;
    this.attackHeld = false;
    this.attackQueued = false;
    this._atkTouch = false;
    this.pointerDrag = { active: false, id: -1, sx: 0, sy: 0, moved: 0, t: 0 };
    this._joy = { active: false, id: -1, cx: 0, cy: 0, vx: 0, vy: 0 };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this._bindKeyboard();
    this._bindMouse();
  }

  // ------------------------------------------------ لوحة المفاتيح
  _bindKeyboard() {
    const down = (e) => {
      if (e.repeat) { e.preventDefault(); return; }
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const up = (e) => this.keys.delete(e.code);
    addEventListener('keydown', down, { passive: false });
    addEventListener('keyup', up);
    addEventListener('blur', () => this.keys.clear());
  }

  // ------------------------------------------------ الماوس
  _bindMouse(canvas) {
    const el = canvas || document.getElementById('game');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.zoomDelta += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;             // اللمس يتعامل معه الأنالوج
      this.pointerDrag = { active: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now(), button: e.button };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.pointerDrag;
      if (!d.active || d.id !== e.pointerId) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      d.sx = e.clientX; d.sy = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      this.look.x += dx; this.look.y += dy;
    });
    const end = (e) => {
      const d = this.pointerDrag;
      if (!d.active || d.id !== e.pointerId) return;
      d.active = false;
      const quick = performance.now() - d.t < 320;
      if (d.button === 0 && d.moved < 10 && quick) this.attackQueued = true;   // كليكة = ضربة
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------ اللمس (أنالوج + أزرار)
  bindTouchUI() {
    const zone = document.getElementById('joyZone');
    const stick = document.getElementById('joyStick');
    const R = 62;
    const setStick = (dx, dy) => {
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, R);
      stick.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px)`;
      this._joy.vx = dx / len * Math.min(1, len / R);
      this._joy.vy = dy / len * Math.min(1, len / R);
      this.move.x = this._joy.vx;
      this.move.y = -this._joy.vy;
    };
    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const r = zone.getBoundingClientRect();
      this._joy.active = true; this._joy.id = t.identifier ?? -1;
      this._joy.cx = r.left + r.width / 2; this._joy.cy = r.top + r.height / 2;
      setStick(t.clientX - this._joy.cx, t.clientY - this._joy.cy);
      e.preventDefault();
    };
    const move = (e) => {
      if (!this._joy.active) return;
      const list = e.changedTouches || [e];
      for (const t of list) {
        if ((t.identifier ?? -1) !== this._joy.id) continue;
        setStick(t.clientX - this._joy.cx, t.clientY - this._joy.cy);
      }
      e.preventDefault();
    };
    const end = (e) => {
      if (!this._joy.active) return;
      this._joy.active = false; this._joy.vx = this._joy.vy = 0;
      this.move.x = this.move.y = 0;
      stick.style.transform = 'translate(0,0)';
      e.preventDefault();
    };
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('mousedown', start);
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    addEventListener('mousemove', (e) => { if (this._joy.active && e.buttons) move(e); });
    addEventListener('mouseup', end);

    const hold = (id, on) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { on(true); e.preventDefault(); });
      el.addEventListener('pointerup', (e) => { on(false); e.preventDefault(); });
      el.addEventListener('pointercancel', () => on(false));
      el.addEventListener('pointerleave', () => on(false));
    };
    hold('btnAtk', (v) => { this._atkTouch = v; if (v) this.attackQueued = true; });
    hold('btnJump', (v) => { if (v) this.justPressed.add('Space'); });
    hold('btnDash', (v) => { if (v) this.justPressed.add('ShiftLeft'); });

    // سحب على الشاشة (خارج الأنالوج والأزرار) = دوران الكاميرا
    const el = document.getElementById('game');
    el.addEventListener('touchstart', (e) => {
      const t = e.target;
      if (t.closest && (t.closest('#joyZone') || t.closest('.tbtn'))) return;
      const c = e.changedTouches[0];
      this.pointerDrag = { active: true, id: c.identifier, sx: c.clientX, sy: c.clientY, moved: 0, t: performance.now(), button: 0 };
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      const d = this.pointerDrag;
      if (!d.active) return;
      for (const c of e.changedTouches) {
        if (c.identifier !== d.id) continue;
        this.look.x += c.clientX - d.sx; this.look.y += c.clientY - d.sy;
        d.sx = c.clientX; d.sy = c.clientY;
      }
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!this.pointerDrag.active) return;
      this.pointerDrag.active = false;
    });
  }

  // ------------------------------------------------ قراءة الحالة
  update() {
    if (!this._joy.active) {
      let x = 0, y = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      const len = Math.hypot(x, y);
      this.move.x = len > 1 ? x / len : x;
      this.move.y = len > 1 ? y / len : y;
    }

    // ضغطة جديدة (كيبورد) → طلب ضربة
    if (this.justPressed.has('KeyJ') || this.justPressed.has('KeyK')) this.attackQueued = true;

    // استمرار الضغط: كيبورد، زر اللمس، أو كليك ماوس ثابت (بلا سحب)
    const mouseStill = this.pointerDrag.active && this.pointerDrag.moved < 10 && this.pointerDrag.button === 0;
    this.attackHeld = this.keys.has('KeyJ') || this.keys.has('KeyK') || this._atkTouch || mouseStill;
  }

  pressed(code) { return this.justPressed.has(code); }
  held(code) { return this.keys.has(code); }

  /** استهلاك الضربة (باش ما تتكررش في نفس الفريم) */
  consumeAttack() { const v = this.attackQueued; this.attackQueued = false; return v; }

  endFrame() {
    this.justPressed.clear();
    this.look.x = 0; this.look.y = 0;
    this.zoomDelta = 0;
  }
}
