/**
 * ============================================================
 *  player.js  —  اللاعب (نفس الموديل بلون مختلف)
 * ============================================================
 */
import * as THREE from 'three';
import { MODEL_FACING } from './characters.js';

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class Player {
  constructor({ factory, scene, world, fx, sfx, spawn, onEvent }) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.sfx = sfx;
    this.onEvent = onEvent || (() => {});
    this.spawn = spawn.clone();

    this.maxHp = 130;
    this.hp = this.maxHp;
    this.speed = 5.6;
    this.runMul = 1.45;
    this.radius = 0.45;

    this.inst = factory.createInstance({ shirt: 0x2f6fd0, pants: 0x1f2a44, metalness: 0.05 });
    this.root = new THREE.Group();
    this.root.position.copy(this.spawn);
    this.root.add(this.inst.root);
    scene.add(this.root);

    // وميض الحماية بعد الضربة
    this.invuln = 0;
    this.hurtFlash = 0;

    // هجوم
    this.attackCd = 0;
    this.attacking = 0;
    this.attackDone = true;
    this.combo = 0;
    this.comboTimer = 0;
    this.attackRange = 2.9;
    this.attackDamage = 34;

    // اندفاع
    this.dashCd = 0;
    this.dashTime = 0;
    this.dashDir = new THREE.Vector3();

    // فيزياء
    this.vy = 0;
    this.y = 0;
    this.yaw = Math.PI;          // يبدا مقابل الحارس
    this.grounded = true;
    this.noDamageTime = 0;
    this.dead = false;
    this.walkPhase = 0;
  }

  get position() { return this.root.position; }

  // ---------------------------------------------------------- تحديث
  update(dt, ctx) {
    if (this.dead) { this.inst.update(dt); return; }
    const { input, camera } = ctx;

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    this.noDamageTime += dt;

    // شفافية وميض الحماية
    if (this.invuln > 0) {
      this.inst.setOpacity(0.45 + 0.55 * Math.abs(Math.sin(performance.now() * 0.02)));
    } else if (this.inst._opacity < 1) {
      this.inst.setOpacity(1);
    }
    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      for (const m of this.inst.materials) if (m.emissive) m.emissive.setRGB(this.hurtFlash, 0, 0);
    }

    // ---------- حركة نسبية للكاميرا ----------
    const camYaw = ctx.camYaw;
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, input.move.y)
      .addScaledVector(right, input.move.x);
    if (wish.lengthSq() > 1) wish.normalize();

    // ---------- اندفاع ----------
    if (input.pressed('ShiftLeft') && this.dashCd <= 0 && this.dashTime <= 0) {
      const dir = wish.lengthSq() > 0.01 ? wish.clone().normalize() : fwd.clone();
      this.dashDir.copy(dir);
      this.dashTime = 0.19;
      this.dashCd = 2.0;
      this.invuln = Math.max(this.invuln, 0.3);
      this.sfx?.dash();
      this.fx.burst(this.position.clone().setY(this.y + 0.6), 0x66d9ff, { count: 14, speed: 4, life: 0.4, size: 0.11 });
      this.onEvent('dash');
    }

    let speed = this.speed;
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      speed = 17;
      wish.copy(this.dashDir);
      if (Math.random() < 0.6) {
        this.fx.burst(this.position.clone().setY(this.y + 0.8), 0x3da8e0, { count: 3, speed: 1.5, life: 0.3, size: 0.09, grav: 0 });
      }
    } else if (input.held('ShiftLeft')) {
      speed *= this.runMul;
    }

    // ---------- هجوم ----------
    if (this.attackCd <= 0 && (input.consumeAttack() || input.attackHeld)) {
      this._attack();
    }

    if (this.attacking > 0) {
      this.attacking -= dt;
      // اندفاع صغير للأمام
      wish.addScaledVector(new THREE.Vector3(Math.sin(this.yaw - MODEL_FACING), 0, Math.cos(this.yaw - MODEL_FACING)), 0.5);
      if (wish.lengthSq() > 1) wish.normalize();
      if (!this.attackDone && this.attacking <= 0.32) {
        this.attackDone = true;
        ctx.dealDamage(this.attackDamage, this.position, this.attackRange, this.yaw);
      }
      speed *= 0.55;
    }

    // ---------- تطبيق الحركة ----------
    const before = this.position.clone();
    this.position.x += wish.x * speed * dt;
    this.position.z += wish.z * speed * dt;

    // اتجاه
    if (wish.lengthSq() > 0.01) {
      this.yaw = lerpAngle(this.yaw, Math.atan2(wish.x, wish.z) + MODEL_FACING, Math.min(1, dt * 12));
    } else if (input.attackHeld || this.attacking > 0) {
      // يستقبل اتجاه الكاميرا وقت الهجوم
      this.yaw = lerpAngle(this.yaw, camYaw + MODEL_FACING, Math.min(1, dt * 8));
    }

    // ---------- قفزة + جاذبية ----------
    const gY = this.world.groundHeightAt(this.position.x, this.position.z);
    if (input.pressed('Space') && this.grounded) {
      this.vy = 7.4;
      this.grounded = false;
      this.sfx?.jump();
      this.inst.play('Jump', { fade: 0.08, loop: THREE.LoopOnce });
    }
    this.vy -= 19 * dt;
    this.y += this.vy * dt;
    if (this.y <= gY) { this.y = gY; this.vy = 0; if (!this.grounded) { this.grounded = true; } }
    else this.grounded = false;

    // ---------- تصادم ----------
    this.world.resolve({ position: this.position, radius: this.radius, y: this.y });
    this.position.y = this.y;

    // ---------- الأنيميشن ----------
    const movedDist = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    const spd = dt > 0 ? movedDist / dt : 0;
    if (this.attacking <= 0) {
      if (!this.grounded) this.inst.play('Jump', { fade: 0.12, loop: THREE.LoopOnce, clamp: true });
      else if (spd > 0.4) {
        const running = spd > 6.2;
        this.inst.play(running ? 'Run' : 'Walk', { fade: 0.18, timeScale: THREE.MathUtils.clamp(spd / (running ? 6.5 : 3.4), 0.6, 1.7) });
      } else {
        this.inst.play('Idle', { fade: 0.25 });
      }
    }
    this.root.rotation.y = this.yaw;
    this.inst.update(dt);

    // ---------- تجدد بطيء ----------
    if (this.noDamageTime > 6 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 3.2 * dt);
    }
  }

  _attack() {
    this.combo = (this.combo % 3) + 1;
    this.comboTimer = 1.1;
    this.attacking = 0.55;
    this.attackDone = false;
    this.attackCd = 0.48;
    this.attackDamage = this.combo === 3 ? 52 : 34;
    const ts = this.combo === 3 ? 2.15 : 2.3;   // الضربة الثالثة ثقيلة
    this.inst.play('Punch', { fade: 0.08, loop: THREE.LoopOnce, clamp: true, timeScale: ts });
    this.sfx?.swing();
    const p = this.position.clone().setY(this.y + 1.1);
    const dir = new THREE.Vector3(Math.sin(this.yaw - MODEL_FACING), 0, Math.cos(this.yaw - MODEL_FACING));
    this.fx.burst(p.clone().addScaledVector(dir, 0.7), 0xffe08a, { count: 5, speed: 2.5, life: 0.25, size: 0.09, grav: 0 });
    this.onEvent('attack', { combo: this.combo });
  }

  // ---------------------------------------------------------- ضرر
  takeDamage(amount, fromPos) {
    if (this.dead || this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = 0.65;
    this.noDamageTime = 0;
    this.hurtFlash = 1;
    this.sfx?.hurt();
    if (fromPos) {
      const d = new THREE.Vector3(this.position.x - fromPos.x, 0, this.position.z - fromPos.z);
      if (d.lengthSq() > 1e-4) this.position.add(d.normalize().multiplyScalar(1.1));
      this.world.resolve({ position: this.position, radius: this.radius, y: this.y });
      this.position.y = this.y;
    }
    this.fx.burst(this.position.clone().setY(this.y + 1.2), 0xff4444, { count: 12, speed: 4, life: 0.45, size: 0.1 });
    this.onEvent('hurt', { amount });
    if (this.hp <= 0) { this.hp = 0; this._die(); return true; }
    return false;
  }

  _die() {
    this.dead = true;
    this.inst.play('Death', { fade: 0.1, loop: THREE.LoopOnce, clamp: true });
    this.fx.burst(this.position.clone().setY(this.y + 1), 0xff3b3b, { count: 30, speed: 6, life: 1, size: 0.15 });
    this.sfx?.playerDeath();
    this.onEvent('death');
  }

  reset() {
    this.dead = false;
    this.hp = this.maxHp;
    this.root.position.copy(this.spawn);
    this.y = 0; this.vy = 0;
    this.yaw = Math.PI;
    this.invuln = 1; this.hurtFlash = 0;
    this.attackCd = this.dashCd = this.attacking = 0;
    this.inst.setOpacity(1);
    this.inst.play('Idle', { fade: 0.1 });
  }
}
