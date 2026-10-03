/**
 * ============================================================
 *  legacy.js  —  الـNPC القدما (القدماء)
 * ============================================================
 *  ★ هذو هوما الـNPC لي "ما يرجعوش": ملي يموت الواحد فيهم يبقى مدفون
 *    نهائيا ويخلّي وراه شاهد قبر.
 *  - في الوضع القديم (respawnMode = 'old') يرجعو بعد الموت مثل قبل.
 */
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

const COLORS = [0x5b6b52, 0x6b5348, 0x4d5a6e, 0x6e5a4a, 0x556066];

/** شريط صحة صغير فوق راس العدو */
class MiniBar {
  constructor() {
    this.group = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x140a0a, transparent: true, opacity: 0.75, depthWrite: false })
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff4444, depthWrite: false })
    );
    fill.position.z = 0.001;
    this.fill = fill;
    this.group.add(bg, fill);
    this.group.renderOrder = 5;
  }
  set(p) {
    const q = Math.max(0, Math.min(1, p));
    this.fill.scale.x = q;
    this.fill.position.x = -(1 - q) * 0.41;
    this.group.visible = q < 0.999;
  }
  face(camera) { this.group.quaternion.copy(camera.quaternion); }
}

export class LegacyEnemy {
  constructor({ scene, world, fx, sfx, position, wave = 1, manager }) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.sfx = sfx;
    this.manager = manager;

    this.maxHp = Math.round(52 * (1 + 0.16 * (wave - 1)));
    this.hp = this.maxHp;
    this.damage = 7 + wave * 0.6;
    this.speed = rand(1.9, 3.0) + wave * 0.05;
    this.radius = 0.42;
    this.attackRange = 1.75;
    this.cd = rand(0.4, 1.4);
    this.windup = 0;
    this.hitFlash = 0;
    this.dead = false;
    this.respawnOldAt = -1;
    this.y = 0; this.vy = 0;

    this.root = new THREE.Group();
    this.root.position.copy(position);
    scene.add(this.root);

    // ---- الجسم ----
    const color = COLORS[(Math.random() * COLORS.length) | 0];
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05, flatShading: true });
    this.mats = [skin, skin];
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 4, 10), skin);
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.root.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    this.root.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeMat);
      eye.position.set(s * 0.1, 1.65, 0.2);
      this.root.add(eye);
    }

    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.62, 3, 7), skin);
      arm.position.set(s * 0.44, 1.05, 0);
      arm.castShadow = true;
      this.root.add(arm);
      this.arms.push(arm);
    }

    this.bar = new MiniBar();
    this.bar.group.position.y = 2.0;
    this.root.add(this.bar.group);

    this.phase = Math.random() * 10;
    this.yaw = rand(0, Math.PI * 2);
    this.spawnPos = position.clone();
  }

  get position() { return this.root.position; }

  hit(dmg, fromPos) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.hitFlash = 1;
    const p = this.position.clone().setY(this.y + 1.1);
    this.fx.burst(p, 0x9ad46b, { count: 9, speed: 4.5, life: 0.4, size: 0.09 });
    this.fx.label(p.clone().setY(this.y + 1.8), `-${Math.round(dmg)}`, '#c8ff8a', { life: 0.6, size: 44, scale: 0.8, vy: 1.4 });
    this.sfx?.hit();
    if (fromPos) {
      const d = new THREE.Vector3(this.position.x - fromPos.x, 0, this.position.z - fromPos.z);
      if (d.lengthSq() > 1e-4) this.position.add(d.normalize().multiplyScalar(0.5));
    }
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    const p = this.position.clone().setY(this.y + 0.9);
    this.fx.burst(p, 0x8ce06b, { count: 26, speed: 6, life: 0.8, size: 0.13 });
    this.fx.burst(p, 0x333333, { count: 12, speed: 3.5, life: 1.1, size: 0.18, grav: -3 });
    this.fx.ring(this.position, 0x8ce06b, { r0: 0.3, r1: 3.2, life: 0.6 });
    this.sfx?.legacyDeath();
    this.root.visible = false;
  }

  /** إذا كان الوضع القديم: يرجع بعد 10 ثواني */
  reviveOld() {
    this.dead = false;
    this.hp = this.maxHp;
    this.root.visible = true;
    this.root.position.copy(this.spawnPos);
    this.y = 0; this.vy = 0; this.cd = 1;
    const p = this.position.clone().setY(1);
    this.fx.burst(p, 0x9b5cff, { count: 24, speed: 5, life: 0.7, size: 0.13 });
    this.fx.ring(this.position, 0x9b5cff, { r0: 0.3, r1: 3, life: 0.6 });
  }

  update(dt, ctx) {
    if (this.dead) return;
    const toP = new THREE.Vector3(ctx.playerPos.x - this.position.x, 0, ctx.playerPos.z - this.position.z);
    const dist = toP.length();

    // انفصال عن باقي الأعداء
    const sep = new THREE.Vector3();
    for (const o of this.manager.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 1e-4) sep.add(new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar((1.1 - d) * 2.5));
    }

    this.cd = Math.max(0, this.cd - dt);
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
      for (const m of this.mats) m.emissive?.setRGB(this.hitFlash * 0.6, this.hitFlash * 0.05, this.hitFlash * 0.05);
    }

    if (this.windup > 0) {
      // لحظة الهجوم
      this.windup -= dt;
      this.root.position.x += sep.x * dt;
      this.root.position.z += sep.z * dt;
      if (this.windup <= 0) {
        const d2 = Math.hypot(ctx.playerPos.x - this.position.x, ctx.playerPos.z - this.position.z);
        if (d2 <= this.attackRange * 1.35 && ctx.playerAlive !== false) {
          ctx.dealDamage(this.damage, this.position);
          this.fx.burst(this.position.clone().setY(1.1), 0xff8844, { count: 8, speed: 3.5, life: 0.35, size: 0.1 });
        }
        this.cd = 1.3;
      }
    } else if (dist <= this.attackRange && this.cd <= 0) {
      this.windup = 0.45;
      this.arms[0].rotation.x = -1.2;
    } else if (dist < 60) {
      const speed = this.speed * (dist < 5 ? 1.1 : 1);
      const dir = new THREE.Vector3(toP.x, 0, toP.z).normalize();
      dir.add(sep.multiplyScalar(0.35)).normalize();
      this.position.x += dir.x * speed * dt;
      this.position.z += dir.z * speed * dt;
      this.yaw = Math.atan2(dir.x, dir.z);
      // مشية متهالكة
      const t = performance.now() * 0.006 + this.phase;
      this.arms[0].rotation.x = Math.sin(t) * 0.7;
      this.arms[1].rotation.x = -Math.sin(t) * 0.7;
      this.root.position.y = Math.abs(Math.sin(t * 2)) * 0.06;
    }

    this.root.rotation.y = this.yaw + Math.PI;
    this.world.resolve({ position: this.position, radius: this.radius, y: this.y });
    this.bar.set(this.hp / this.maxHp);
    this.bar.face(ctx.camera);
  }
}

export class LegacyManager {
  constructor({ scene, world, fx, sfx }) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.sfx = sfx;
    this.enemies = [];
    this.tombstones = [];
    this.buried = 0;
    this.mode = 'new';            // 'new' = ما يرجعوش، 'old' = الكل يرجع
    this.killScore = 0;
    this.spawnTimer = 0;
    this._tombPool = [];
  }

  get aliveCount() { return this.enemies.filter(e => !e.dead).length; }

  /** ظهور موجة: n عدو من البورتالات */
  spawnWave(count, wave) {
    const points = this.world.riftPoints;
    for (let i = 0; i < count; i++) {
      const p = points[(Math.random() * points.length) | 0];
      const pos = new THREE.Vector3(
        p.x + rand(-2.5, 2.5), 0, p.z + rand(-2.5, 2.5)
      );
      const e = new LegacyEnemy({
        scene: this.scene, world: this.world, fx: this.fx, sfx: this.sfx,
        position: pos, wave, manager: this
      });
      const gp = pos.clone().setY(1.6);
      this.fx.burst(gp, 0x9b5cff, { count: 18, speed: 5, life: 0.7, size: 0.14 });
      this.fx.ring(pos, 0x9b5cff, { r0: 0.3, r1: 3, life: 0.6 });
      this.enemies.push(e);
    }
  }

  update(dt, ctx) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, ctx);
      if (!e.dead) continue;

      if (this.mode === 'old') {
        // 🕰️ الوضع القديم: الكل يرجع بعد 10 ثواني
        e.oldTimer = (e.oldTimer ?? 10) - dt;
        if (e.oldTimer <= 0) { e.oldTimer = 10; e.reviveOld(); }
      } else {
        // ☠️ الوضع الجديد: موت نهائي + شاهد قبر (ما يرجعش أبدا)
        this._bury(e.position.clone());
        this.scene.remove(e.root);
        this.enemies.splice(i, 1);
      }
    }
  }

  _bury(pos) {
    this.buried++;
    this.killScore += 10;
    // شاهد القبر
    let t = this._tombPool.find(x => !x.visible);
    if (!t) {
      const grp = new THREE.Group();
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.7, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.9 })
      );
      slab.position.y = 0.35;
      slab.castShadow = true;
      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.2),
        new THREE.MeshBasicMaterial({ color: 0x8ce06b, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
      );
      rune.position.set(0, 0.42, 0.07);
      grp.add(slab, rune);
      this.scene.add(grp);
      t = { group: grp, visible: true, life: 0, rune };
      this._tombPool.push(t);
      this.tombstones.push(t);
    }
    t.visible = true;
    t.life = 0;
    t.group.visible = true;
    t.group.position.copy(pos).setY(0);
    t.group.rotation.y = Math.random() * Math.PI;
    this.fx.ring(pos, 0x8ce06b, { r0: 0.2, r1: 2, life: 0.5 });
    this.fx.label(pos.clone().setY(1.6), '☠️ مات نهائيا', '#8ce06b', { life: 1.2, size: 40, scale: 1.0, vy: 0.9 });
  }

  /** موجة جديدة من القدماء (تستدعيها main) */
  reset() {
    for (const e of this.enemies) this.scene.remove(e.root);
    this.enemies.length = 0;
    for (const t of this.tombstones) { t.visible = false; t.group.visible = false; }
    this.buried = 0;
    this.killScore = 0;
  }
}
