/**
 * ============================================================
 *  world.js  —  الساحة: الأرض، الإضاءة، الحواجز، نقاط الظهور
 * ============================================================
 */
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.arenaRadius = 34;
    this.colliders = [];          // {type:'box'|'circle', ...}
    this.props = [];
    this.time = 0;

    // ---- نقاط مهمة ----
    this.heroSpawn = new THREE.Vector3(0, 0, -8);      // نقطة صمود الحارس
    this.playerSpawn = new THREE.Vector3(0, 0, 10);
    this.riftPoints = [];                              // بورتالات ظهور الـNPC القدما
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      this.riftPoints.push(new THREE.Vector3(Math.cos(a) * 27, 0, Math.sin(a) * 27));
    }

    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildWalls();
    this._buildProps();
    this._buildHeroSpawnMarker();
    this._buildRifts();
  }

  // ---------------------------------------------------------- السماء
  _buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(260, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x05070f) },
          mid: { value: new THREE.Color(0x171126) },
          bot: { value: new THREE.Color(0x3a1420) }
        },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 top, mid, bot; varying vec3 vP;
          void main(){
            float h = clamp(normalize(vP).y * 0.5 + 0.5, 0.0, 1.0);
            vec3 c = mix(bot, mid, smoothstep(0.35, 0.55, h));
            c = mix(c, top, smoothstep(0.55, 0.9, h));
            gl_FragColor = vec4(c, 1.0);
          }`
      })
    );
    sky.frustumCulled = false;
    this.scene.add(sky);

    // نجوم
    const N = 700, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(120, 240));
      v.y = Math.abs(v.y) * 0.9 + 12;
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9fc7ff, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false
    })));

    this.scene.fog = new THREE.FogExp2(0x0a0b14, 0.0165);
  }

  // ---------------------------------------------------------- الإضاءة
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x2a1a18, 0.55));

    const moon = new THREE.DirectionalLight(0xcfe0ff, 1.35);
    moon.position.set(-24, 34, 20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const d = 42;
    Object.assign(moon.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 110 });
    moon.shadow.camera.updateProjectionMatrix();
    moon.shadow.bias = -0.0016;
    moon.shadow.normalBias = 0.03;
    this.scene.add(moon);
    this.moon = moon;

    const warm = new THREE.PointLight(0xff6a4a, 45, 60, 2);
    warm.position.set(0, 7, -8);
    this.scene.add(warm);
    this.warm = warm;
  }

  // ---------------------------------------------------------- الأرض
  _buildGround() {
    const tex = this._gridTexture();
    tex.repeat.set(14, 14);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.05, color: 0x8c93a8 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(this.arenaRadius + 2, 64), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // حلقة نيون حول الساحة
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.arenaRadius - 0.6, this.arenaRadius, 96),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);
    this.edgeRing = ring;

    // دوائر مرسومة على الأرض
    const circle = new THREE.Mesh(
      new THREE.RingGeometry(9.9, 10.1, 80),
      new THREE.MeshBasicMaterial({ color: 0x59d0ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    circle.rotation.x = -Math.PI / 2; circle.position.y = 0.025;
    this.scene.add(circle);
  }

  _gridTexture() {
    const s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#2b3040'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(140,190,255,.30)'; g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
    g.strokeStyle = 'rgba(140,190,255,.10)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (s / 4) * i;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // ---------------------------------------------------------- الجدران / الأعمدة
  _buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1b2030, roughness: 0.8, metalness: 0.25, transparent: true, opacity: 0.85
    });
    // ملاحظة: ترتيب الفيرتكس في الأسطوانة يكون للخارج، نعكس الوجه باش يتشاف من الداخل
    const wallGeo = new THREE.CylinderGeometry(this.arenaRadius + 1.5, this.arenaRadius + 1.5, 9, 64, 1, true);
    const idx = wallGeo.getIndex();
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      idx.setX(i, a); idx.setX(i + 1, c); idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 4.5;
    wall.material.side = THREE.FrontSide;
    this.scene.add(wall);

    // أعمدة داخلية
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a3044, roughness: 0.7, metalness: 0.3 });
    const capMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pos = new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 24);
      if (pos.distanceTo(this.heroSpawn) < 7 || pos.distanceTo(this.playerSpawn) < 7) continue;
      const h = rand(4, 6.5);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 1.5), pillarMat);
      pillar.position.set(pos.x, h / 2, pos.z);
      pillar.castShadow = pillar.receiveShadow = true;
      this.scene.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 1.75), capMat);
      cap.position.set(pos.x, h + 0.08, pos.z);
      this.scene.add(cap);
      const light = new THREE.PointLight(0x66d9ff, 12, 16, 2);
      light.position.set(pos.x, h + 0.4, pos.z);
      this.scene.add(light);
      this.colliders.push({ type: 'box', x: pos.x, z: pos.z, hx: 0.9, hz: 0.9, h, mesh: pillar });
      this.props.push(pillar);
    }
  }

  // ---------------------------------------------------------- صناديق وحجارة
  _buildProps() {
    const crateMats = [
      new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x4a4f63, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x5a3a3a, roughness: 0.9 })
    ];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4e, roughness: 1, flatShading: true });

    const isFree = (p, r) => {
      if (p.length() < 6) return false;
      if (p.distanceTo(this.heroSpawn) < 6.5) return false;
      if (p.distanceTo(this.playerSpawn) < 6) return false;
      for (const rp of this.riftPoints) if (p.distanceTo(rp) < 5) return false;
      for (const c of this.colliders) {
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < (c.hx || c.r) + r + 1.2) return false;
      }
      return true;
    };

    // صناديق (يمكن القفز فوقها)
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, rr = rand(6, 26);
      const p = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      const s = rand(1.2, 2.1);
      const h = rand(0.8, 1.7);
      if (!isFree(p, s)) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s * 2, h, s * 2), crateMats[i % crateMats.length]);
      mesh.position.set(p.x, h / 2, p.z);
      mesh.rotation.y = rand(0, Math.PI);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.colliders.push({ type: 'box', x: p.x, z: p.z, hx: s, hz: s, h, mesh });
      this.props.push(mesh);
    }

    // حجارة
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, rr = rand(8, 28);
      const p = new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      const r = rand(0.6, 1.3);
      if (!isFree(p, r)) continue;
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
      mesh.position.set(p.x, r * 0.55, p.z);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.scale.y = 0.7;
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.colliders.push({ type: 'circle', x: p.x, z: p.z, r: r * 0.85, h: r * 1.2, mesh });
      this.props.push(mesh);
    }

    // بلورات مضيئة
    const crysMat = new THREE.MeshBasicMaterial({ color: 0x8ef0ff, transparent: true, opacity: 0.85 });
    this.crystals = [];
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, rr = rand(10, 27);
      const grp = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const h = rand(0.6, 1.5);
        const m = new THREE.Mesh(new THREE.ConeGeometry(rand(0.14, 0.26), h, 4), crysMat);
        m.position.set(rand(-0.3, 0.3), h / 2, rand(-0.3, 0.3));
        m.rotation.z = rand(-0.2, 0.2);
        grp.add(m);
      }
      grp.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      this.scene.add(grp);
      this.crystals.push(grp);
      const l = new THREE.PointLight(0x8ef0ff, 6, 10, 2);
      l.position.copy(grp.position).setY(1);
      this.scene.add(l);
    }
  }

  // ---------------------------------------------------------- نقطة صمود الحارس
  _buildHeroSpawnMarker() {
    const grp = new THREE.Group();
    grp.position.copy(this.heroSpawn);

    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.75, 48),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    ring1.rotation.x = -Math.PI / 2; ring1.position.y = 0.04;
    grp.add(ring1);

    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.05;
    grp.add(ring2);
    this.heroRingA = ring1; this.heroRingB = ring2;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.6, 7, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff5a5a, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false
      })
    );
    beam.position.y = 3.5;
    grp.add(beam);
    this.heroBeam = beam;

    const light = new THREE.PointLight(0xff4d4d, 8, 12, 2);
    light.position.y = 1;
    grp.add(light);

    this.scene.add(grp);
    this.heroMarker = grp;
  }

  // ---------------------------------------------------------- بورتالات القدماء
  _buildRifts() {
    this.rifts = [];
    for (const p of this.riftPoints) {
      const grp = new THREE.Group();
      grp.position.copy(p);
      const portal = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.16, 10, 32),
        new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: 0.85 })
      );
      portal.position.y = 1.7;
      grp.add(portal);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.45, 32),
        new THREE.MeshBasicMaterial({ color: 0x6a2ecf, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
      );
      glow.position.y = 1.7;
      grp.add(glow);
      const light = new THREE.PointLight(0x9b5cff, 9, 14, 2);
      light.position.y = 1.7;
      grp.add(light);
      this.scene.add(grp);
      this.rifts.push({ grp, portal, glow });
    }
  }

  // ---------------------------------------------------------- استعلامات
  /** أعلى سطح صلب تحت النقطة (للوقوف فوق الصناديق) */
  groundHeightAt(x, z) {
    let h = 0;
    for (const c of this.colliders) {
      if (c.type === 'box') {
        if (Math.abs(x - c.x) < c.hx && Math.abs(z - c.z) < c.hz) h = Math.max(h, c.h);
      } else {
        if (Math.hypot(x - c.x, z - c.z) < c.r) h = Math.max(h, c.h * 0.75);
      }
    }
    return h;
  }

  /** دفع الممثل خارج الحواجز + حدود الساحة */
  resolve(actor) {
    const p = actor.position, r = actor.radius, feetY = actor.y ?? 0;
    for (const c of this.colliders) {
      if (feetY > c.h - 0.25) continue;              // واقف فوق الحاجز
      if (c.type === 'box') {
        const dx = p.x - c.x, dz = p.z - c.z;
        const ox = (c.hx + r) - Math.abs(dx), oz = (c.hz + r) - Math.abs(dz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) p.x += Math.sign(dx || 1) * ox;
          else p.z += Math.sign(dz || 1) * oz;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-4) { p.x += (dx / d) * (min - d); p.z += (dz / d) * (min - d); }
      }
    }
    const d = Math.hypot(p.x, p.z), lim = this.arenaRadius - r - 0.4;
    if (d > lim) { p.x = (p.x / d) * lim; p.z = (p.z / d) * lim; }
  }

  update(dt) {
    this.time += dt;
    if (this.heroRingA) {
      this.heroRingA.rotation.z += dt * 0.8;
      this.heroRingB.rotation.z -= dt * 1.4;
      this.heroBeam.material.opacity = 0.07 + 0.05 * Math.sin(this.time * 2);
    }
    for (const rf of this.rifts) {
      rf.portal.rotation.z += dt * 1.2;
      rf.portal.rotation.x = Math.sin(this.time + rf.grp.position.x) * 0.25;
      rf.glow.material.opacity = 0.2 + 0.12 * Math.sin(this.time * 3 + rf.grp.position.z);
    }
    for (let i = 0; i < this.crystals.length; i++) {
      this.crystals[i].rotation.y += dt * (0.3 + i * 0.05);
    }
    this.warm.intensity = 42 + Math.sin(this.time * 3.4) * 6;
  }
}
