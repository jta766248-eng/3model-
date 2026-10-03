/**
 * ============================================================
 *  fx.js  —  المؤثرات: جزيئات، حلقات، نصوص طايرة (أرقام الضرر)
 * ============================================================
 */
import * as THREE from 'three';

const MAX_PARTICLES = 900;
const MAX_LABELS = 26;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this._initParticles();
    this._initRings();
    this._initLabels();
  }

  // ------------------------------------------------ جزيئات
  _initParticles() {
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pMax = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    g.setAttribute('psize', new THREE.BufferAttribute(this.pSize, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1));
    g.setDrawRange(0, MAX_PARTICLES);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float psize; attribute float alpha;
        varying vec3 vC; varying float vA;
        void main(){
          vC = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (260.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float m = smoothstep(0.5, 0.08, length(d));
          if (m <= 0.002) discard;
          gl_FragColor = vec4(vC, vA * m);
        }`,
      vertexColors: true
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.pCursor = 0;
  }

  /** انفجار جزيئات */
  burst(pos, color = 0xffffff, { count = 14, speed = 5, life = 0.6, size = 0.12, spread = 0.3, grav = -9 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
      const i3 = idx * 3;
      this.pPos[i3] = pos.x + (Math.random() - 0.5) * spread;
      this.pPos[i3 + 1] = pos.y + (Math.random() - 0.5) * spread;
      this.pPos[i3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      const sp = speed * (0.45 + Math.random() * 0.9);
      this.pVel[i3] = dir.x * sp;
      this.pVel[i3 + 1] = dir.y * sp;
      this.pVel[i3 + 2] = dir.z * sp;
      this.pCol[i3] = c.r; this.pCol[i3 + 1] = c.g; this.pCol[i3 + 2] = c.b;
      this.pSize[idx] = size * (0.6 + Math.random());
      this.pLife[idx] = this.pMax[idx] = life * (0.6 + Math.random() * 0.8);
      this.pAlpha[idx] = 1;
      this.pGrav[idx] = grav;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.psize.needsUpdate = true;
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }

  /** موجة صدمة دائرية على الأرض */
  ring(pos, color = 0xffffff, { r0 = 0.3, r1 = 3, life = 0.5, y = 0.06 } = {}) {
    const r = this._ring();
    r.mesh.position.set(pos.x, pos.y + y, pos.z);
    r.mesh.material.color.set(color);
    r.mesh.material.opacity = 0.9;
    r.mesh.scale.setScalar(r0);
    r.r0 = r0; r.r1 = r1; r.t = 0; r.life = life;
    r.active = true;
  }

  _initRings() {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.86, 1, 40);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false
      }));
      m.visible = false;
      this.scene.add(m);
      this.rings.push({ mesh: m, active: false, t: 0, life: 1, r0: 1, r1: 2 });
    }
  }

  _ring() {
    return this.rings.find(r => !r.active) || this.rings[0];
  }

  // ------------------------------------------------ نصوص طايرة
  _initLabels() {
    this.labels = [];
    for (let i = 0; i < MAX_LABELS; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false
      }));
      sprite.visible = false;
      sprite.scale.set(1.6, 0.6, 1);
      this.scene.add(sprite);
      this.labels.push({ sprite, canvas, tex, active: false, t: 0, life: 1, vy: 0 });
    }
  }

  /** نص طاير (أرقام ضرر، إعلانات) */
  label(pos, text, color = '#ffffff', { life = 0.9, size = 48, scale = 1.1, vy = 1.6, outline = '#000' } = {}) {
    const l = this.labels.find(x => !x.active) || this.labels[0];
    const { canvas, tex } = l;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `900 ${size}px system-ui, "Segoe UI", Tahoma, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.18; ctx.strokeStyle = outline;
    ctx.strokeText(text, 128, 52);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 52);
    tex.needsUpdate = true;

    const aspect = canvas.width / canvas.height;
    l.sprite.scale.set(scale * 1.5 * aspect / 2.6, scale * 1.5 / 2.6 * 1.6, 1);
    l.sprite.material.opacity = 1;
    l.sprite.position.copy(pos);
    l.sprite.visible = true;
    l.active = true; l.t = 0; l.life = life; l.vy = vy;
  }

  /** وميض ضوئي سريع */
  flash(pos, color = 0xffaa55, intensity = 30) {
    const light = new THREE.PointLight(color, intensity, 14, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this._flashes ??= [];
    this._flashes.push({ light, t: 0, life: 0.35 });
  }

  // ------------------------------------------------ تحديث
  update(dt) {
    // جزيئات
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const i3 = i * 3;
      this.pVel[i3 + 1] += this.pGrav[i] * dt;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (this.pPos[i3 + 1] < 0.02) { this.pPos[i3 + 1] = 0.02; this.pVel[i3 + 1] *= -0.35; }
      this.pAlpha[i] = Math.max(0, this.pLife[i] / this.pMax[i]);
      if (this.pLife[i] <= 0) this.pAlpha[i] = 0;
      dirty = true;
    }
    if (dirty) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.alpha.needsUpdate = true;
    }

    // حلقات
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { r.active = false; r.mesh.visible = false; }
      else r.mesh.visible = true;
    }

    // نصوص
    for (const l of this.labels) {
      if (!l.active) continue;
      l.t += dt;
      const k = Math.min(1, l.t / l.life);
      l.sprite.position.y += l.vy * dt;
      l.sprite.material.opacity = 1 - Math.pow(k, 2);
      if (k >= 1) { l.active = false; l.sprite.visible = false; }
    }

    // ومضات
    if (this._flashes) {
      for (let i = this._flashes.length - 1; i >= 0; i--) {
        const f = this._flashes[i];
        f.t += dt;
        f.light.intensity *= Math.pow(0.02, dt);
        if (f.t > f.life) { this.scene.remove(f.light); f.light.dispose?.(); this._flashes.splice(i, 1); }
      }
    }
  }
}
