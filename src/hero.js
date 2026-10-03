/**
 * ============================================================
 *  hero.js  —  الحارس: شخصية «Man in Long Sleeves» كـ NPC
 * ============================================================
 *  ★ هو الـNPC الوحيد لي يرجع بعد الموت (Respawn) في اللعبة.
 *  - يتمشى في الساحة (Patrol) ويبدّل نقاط الصمود.
 *  - يهجم على اللاعب ملي يقرب منه (Chase → Punch).
 *  - ملي يموت: يطيح، يختفي، ونستناو مدة الإحياء…
 *  - يرجع في نفس البلاصة (نقطة الصمود) وفي كل مرة يولّي أقوى.
 */
import * as THREE from 'three';
import { Nameplate } from './nameplate.js';
import { MODEL_FACING } from './characters.js';

export const HeroState = {
  PATROL: 'patrol', IDLE: 'idle', CHASE: 'chase', ATTACK: 'attack',
  HURT: 'hurt', DYING: 'dying', DEAD: 'dead', SPAWNING: 'spawning'
};

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class HeroNPC {
  constructor({ factory, scene, world, fx, sfx, spawn, onEvent }) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.sfx = sfx;
    this.spawn = spawn.clone();
    this.onEvent = onEvent || (() => {});

    // ------- الإعدادات -------
    this.cfg = {
      baseHp: 220, hpPerRespawn: 0.34,       // كل رجوع = صحة أكثر
      baseDamage: 13, dmgPerRespawn: 0.16,   // وضرر أكثر
      baseRun: 4.3, baseWalk: 1.75,
      aggro: 17, forget: 30,
      attackRange: 2.5, attackCooldown: 0.55,
      radius: 0.5, respawnDelay: 8            // ⏱️ مدة الإحياء بالثواني
    };

    // ------- الجسم (نسخة من الموديل) -------
    this.inst = factory.createInstance({ shirt: 0xb52d2d, pants: 0x2a3148, metalness: 0.05 });
    this.root = new THREE.Group();
    this.root.position.copy(this.spawn);
    this.root.add(this.inst.root);
    scene.add(this.root);

    // لوحة الاسم والصحة (تبقى ظاهرة حتى بعد اختفاء الجسم)
    this.plate = new Nameplate({ width: 2.6, accent: '#ff4d4d' });
    this.plate.sprite.position.y = 2.25;
    this.root.add(this.plate.sprite);
    this.plate.set({ name: 'الحارس · Man in Long Sleeves', tag: 'LV1', status: 'يتمشى في الساحة…' });

    // ------- الحالة -------
    this.state = HeroState.PATROL;
    this.respawnCount = 0;      // عدد مرات الرجوع
    this.deaths = 0;
    this._applyStats();
    this.hp = this.maxHp;
    this.vy = 0;
    this.y = 0;
    this.yaw = Math.PI;
    this.attackTimer = 0;
    this.attackDone = false;
    this.cooldown = 0;
    this.hurtTimer = 0;
    this.idleTimer = 0;
    this.deadTimer = 0;
    this.respawnTimer = 0;
    this.flash = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3().copy(this.spawn);

    // نقاط الدوريات حول نقطة الصمود
    const offs = [[0, 0], [-6, 4], [6, 4], [-7, -3], [7, -3], [0, 6], [-3, -6], [4, -7]];
    this.patrolPoints = offs.map(([dx, dz]) => {
      const p = new THREE.Vector3(this.spawn.x + dx, 0, this.spawn.z + dz);
      const lim = world.arenaRadius - 3;
      if (p.length() > lim) p.setLength(lim);
      return p;
    });
    this.patrolIndex = 0;
    this.target = this.patrolPoints[1].clone();

    this.inst.play('Idle');
  }

  // ---------------------------------------------------------- إحصائيات متجددة
  _applyStats() {
    const n = this.respawnCount;
    this.maxHp = Math.round(this.cfg.baseHp * (1 + this.cfg.hpPerRespawn * n));
    this.damage = Math.round(this.cfg.baseDamage * (1 + this.cfg.dmgPerRespawn * n));
    this.runSpeed = this.cfg.baseRun * (1 + 0.04 * n);
    this.walkSpeed = this.cfg.baseWalk * (1 + 0.03 * n);
    this.level = n + 1;
  }

  get alive() { return this.state !== HeroState.DYING && this.state !== HeroState.DEAD; }
  get position() { return this.root.position; }
  get isGhost() { return this.state === HeroState.DEAD; }

  // ---------------------------------------------------------- حالة نصية للـHUD
  statusText() {
    switch (this.state) {
      case HeroState.PATROL: return 'يتمشى في الساحة…';
      case HeroState.IDLE: return 'واقف يراقب…';
      case HeroState.CHASE: return '🏃 يهجم عليك!';
      case HeroState.ATTACK: return '👊 يضربك!';
      case HeroState.HURT: return '😖 متأثر من الضربة…';
      case HeroState.DYING: return '☠️ طاح…';
      case HeroState.DEAD: return `⏳ يرجع بعد ${this.respawnTimer.toFixed(1)} ثانية`;
      case HeroState.SPAWNING: return '✨ رجع للساحة!';
      default: return '';
    }
  }

  // ---------------------------------------------------------- استقبال الضرر
  hit(damage, fromPos) {
    if (!this.alive) return false;
    this.hp -= damage;
    this.flash = 1;

    const pos = this.position.clone().setY(this.y + 1.2);
    this.fx.burst(pos, 0xff5544, { count: 12, speed: 5, life: 0.45, size: 0.1 });
    this.fx.label(pos.clone().setY(this.y + 1.9), `-${Math.round(damage)}`, '#ff6b6b', {
      life: 0.7, size: 46, scale: 0.95, vy: 1.5
    });
    this.sfx?.hit();

    // ارتداد بسيط
    if (fromPos) {
      const d = new THREE.Vector3(this.position.x - fromPos.x, 0, this.position.z - fromPos.z);
      if (d.lengthSq() > 1e-4) this.position.add(d.normalize().multiplyScalar(0.45));
    }

    if (this.hp <= 0) { this._die(); return true; }
    if (this.state !== HeroState.ATTACK) {
      this.state = HeroState.HURT;
      this.hurtTimer = 0.24;
    }
    return false;
  }

  // ---------------------------------------------------------- الموت
  _die() {
    this.hp = 0;
    this.state = HeroState.DYING;
    this.deadTimer = 0;
    this.respawnTimer = this.cfg.respawnDelay;   // ⏱️ العد يبدأ من لحظة الموت
    this.deaths++;
    this.inst.play('Death', { fade: 0.12, loop: THREE.LoopOnce, clamp: true, timeScale: 1.15 });

    const p = this.position.clone().setY(this.y + 0.6);
    this.fx.burst(p, 0xff3b3b, { count: 40, speed: 7, life: 0.9, size: 0.16, grav: -12 });
    this.fx.ring(this.position, 0xff3b3b, { r0: 0.5, r1: 6, life: 0.8 });
    this.fx.flash(p, 0xff4444, 40);
    this.sfx?.heroDeath();
    this.onEvent('death', { position: this.position.clone() });
  }

  // ---------------------------------------------------------- الإحياء ★
  respawn() {
    this.respawnCount++;
    this._applyStats();
    this.hp = this.maxHp;
    this.state = HeroState.SPAWNING;
    this.deadTimer = 0;

    // يرجع في نفس البلاصة (نقطة الصمود) — "نفس البلاصة" كما هو مطلوب
    this.root.position.copy(this.spawn);
    this.y = 0; this.vy = 0;
    this.yaw = Math.PI;
    this.root.rotation.y = this.yaw;
    this.root.visible = true;
    this.inst.setOpacity(1);
    this.inst.play('Standing', { fade: 0.05 });
    this.plate.setVisible(true);

    const p = this.spawn.clone().setY(1.0);
    this.fx.burst(p, 0xffd166, { count: 46, speed: 8, life: 1.0, size: 0.17 });
    this.fx.ring(this.spawn, 0xffd166, { r0: 0.4, r1: 7.5, life: 1.0 });
    this.fx.flash(p, 0xffd166, 55);
    this.fx.label(this.spawn.clone().setY(3.1), `⚡ رجع الحارس — مستوى ${this.level}`, '#ffd166', {
      life: 1.6, size: 40, scale: 1.5, vy: 1.1
    });
    this.sfx?.respawn();
    this.onEvent('respawn', { count: this.respawnCount, level: this.level, maxHp: this.maxHp, damage: this.damage });

    this.spawnTimer = 1.0;   // وقفة قصيرة ثم يرجع للدورية
  }

  // ---------------------------------------------------------- التحديث
  update(dt, ctx) {
    this.inst.update(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      const e = this.flash * 0.9;
      for (const m of this.inst.materials) if (m.emissive) m.emissive.setRGB(e, e * 0.15, e * 0.15);
    }

    // الجاذبية (غير مهم عند الموت باش يغرق في الأرض)
    if (this.state !== HeroState.DYING && this.state !== HeroState.DEAD) {
      const gY = this.world.groundHeightAt(this.position.x, this.position.z);
      if (this.y > gY + 0.001) {
        this.vy -= 20 * dt;
        this.y += this.vy * dt;
        if (this.y <= gY) { this.y = gY; this.vy = 0; }
      } else { this.y = gY; this.vy = 0; }
    }

    switch (this.state) {
      case HeroState.DYING: this._updateDying(dt); break;
      case HeroState.DEAD: this._updateDead(dt); break;
      case HeroState.SPAWNING: this._updateSpawning(dt); break;
      default: this._updateAlive(dt, ctx); break;
    }

    // تطبيق الحركة على المجسم
    this.position.y = this.y;
    this.root.rotation.y = this.yaw;
    this.plate.set({
      hp: Math.max(0, this.hp),
      maxHp: this.maxHp,
      tag: `LV${this.level}`,
      status: this.statusText(),
      dead: !this.alive
    });
    this.plate.update();
  }

  // --------------------------------------------- منطق التحرك والهجوم
  _updateAlive(dt, ctx) {
    const toPlayer = new THREE.Vector3(ctx.playerPos.x - this.position.x, 0, ctx.playerPos.z - this.position.z);
    const dist = toPlayer.length();
    const canFight = ctx.playerAlive !== false;

    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      this.inst.play('Idle', { fade: 0.12, timeScale: 0.6 });
      if (this.hurtTimer <= 0) this.state = HeroState.CHASE;
      this.world.resolve({ position: this.position, radius: this.cfg.radius, y: this.y });
      return;                       // ما يتحركش وهو متأثر
    }

    switch (this.state) {
      case HeroState.ATTACK: {
        this.attackTimer += dt;
        // لحظة الإصابة
        if (!this.attackDone && this.attackTimer >= 0.42) {
          this.attackDone = true;
          const d = Math.hypot(ctx.playerPos.x - this.position.x, ctx.playerPos.z - this.position.z);
          if (d <= this.cfg.attackRange * 1.35 && canFight) {
            const hitPos = this.position.clone().setY(this.y + 1.1);
            this.fx.burst(hitPos, 0xffaa33, { count: 10, speed: 4, life: 0.35, size: 0.1 });
            ctx.dealDamage(this.damage, this.position);
            this.sfx?.punchHit();
          } else {
            this.sfx?.punchMiss();
          }
        }
        if (this.attackTimer >= 0.95) {
          this.cooldown = this.cfg.attackCooldown;
          this.state = HeroState.CHASE;
          this.attackTimer = 0;
        }
        // يلتفت نحو اللاعب أثناء الهجوم
        if (dist > 0.05) this.yaw = lerpAngle(this.yaw, Math.atan2(toPlayer.x, toPlayer.z) + MODEL_FACING, Math.min(1, dt * 6));
        break;
      }

      case HeroState.CHASE: {
        if (!canFight || dist > this.cfg.forget) {
          this.state = HeroState.PATROL;
          this.target = this._nearestPatrol();
          break;
        }
        if (dist <= this.cfg.attackRange && this.cooldown <= 0) {
          this._startAttack();
          break;
        }
        const speed = dist > 4.5 ? this.runSpeed : this.walkSpeed * 1.25;
        this._moveTowards(ctx.playerPos, speed, dt);
        this.inst.play(dist > 4.5 ? 'Run' : 'Walk', { fade: 0.2, timeScale: THREE.MathUtils.clamp(speed / 4.2, 0.7, 1.5) });
        break;
      }

      case HeroState.IDLE: {
        this.idleTimer -= dt;
        this.inst.play('Idle', { fade: 0.3 });
        this.yaw += dt * 0.35 * Math.sin(performance.now() * 0.0004);
        if (dist < this.cfg.aggro && canFight) { this.state = HeroState.CHASE; break; }
        if (this.idleTimer <= 0) {
          this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
          this.target = this.patrolPoints[this.patrolIndex].clone();
          this.state = HeroState.PATROL;
        }
        break;
      }

      default: { // PATROL
        if (dist < this.cfg.aggro && canFight) {
          this.state = HeroState.CHASE;
          this.sfx?.heroAlert();
          this.fx.label(this.position.clone().setY(this.y + 2.6), '!', '#ff6b6b', { life: 0.8, size: 80, scale: 1.1 });
          break;
        }
        if (!this.target) this.target = this._nearestPatrol();
        const t = new THREE.Vector3(this.target.x - this.position.x, 0, this.target.z - this.position.z);
        if (t.length() < 0.7) {
          this.state = HeroState.IDLE;
          this.idleTimer = 1.2 + Math.random() * 2.2;
          break;
        }
        this._moveTowards(this.target, this.walkSpeed, dt);
        this.inst.play('Walk', { fade: 0.25, timeScale: 1 });
      }
    }

    // كشف الالتصاق بحاجز → غيّر الهدف
    this.stuckTimer += dt;
    if (this.stuckTimer > 0.8) {
      const moved = this.position.distanceTo(this.lastPos);
      if (moved < 0.25 && (this.state === HeroState.PATROL)) this.target = this._nearestPatrol();
      this.lastPos.copy(this.position);
      this.stuckTimer = 0;
    }

    this.world.resolve({ position: this.position, radius: this.cfg.radius, y: this.y });
  }

  _startAttack() {
    this.state = HeroState.ATTACK;
    this.attackTimer = 0;
    this.attackDone = false;
    this.inst.play('Punch', { fade: 0.1, loop: THREE.LoopOnce, clamp: true, timeScale: 1.25 });
    this.fx.ring(this.position, 0xff7733, { r0: 0.6, r1: 1.8, life: 0.3 });
    this.sfx?.heroAttack();
  }

  _moveTowards(target, speed, dt) {
    const dx = target.x - this.position.x, dz = target.z - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const desiredYaw = Math.atan2(dx, dz) + MODEL_FACING;
    this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 7));
    this.position.x += (dx / len) * speed * dt;
    this.position.z += (dz / len) * speed * dt;
  }

  _nearestPatrol() {
    let best = this.patrolPoints[0], bd = Infinity;
    for (const p of this.patrolPoints) {
      const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
      if (d < bd) { bd = d; best = p; }
    }
    this.patrolIndex = this.patrolPoints.indexOf(best);
    return best.clone();
  }

  // --------------------------------------------- الموت والإحياء
  _updateDying(dt) {
    this.deadTimer += dt;
    this.respawnTimer = Math.max(0, this.respawnTimer - dt);
    const t = this.deadTimer;
    if (t > 1.1) {
      const o = Math.max(0, 1 - (t - 1.1) / 0.9);
      this.inst.setOpacity(o);
      this.y = -(t - 1.1) * 0.55;      // يغرق في الأرض شوية
    }
    if (t >= 2.0) {
      this.state = HeroState.DEAD;
      this.root.visible = false;
      this.onEvent('dead-enter', { delay: this.respawnTimer });
    }
  }

  _updateDead(dt) {
    this.respawnTimer -= dt;
    // عدّاد فوق نقطة الصمود
    if (Math.floor(this.respawnTimer * 2) !== Math.floor((this.respawnTimer + dt) * 2)) {
      this.fx.label(this.spawn.clone().setY(2.6), `${Math.ceil(this.respawnTimer)}`, '#ffd166', {
        life: 0.7, size: 64, scale: 1.0, vy: 0.7, outline: 'rgba(0,0,0,.85)'
      });
    }
    if (this.respawnTimer <= 0) this.respawn();   // ★ رجع!
  }

  _updateSpawning(dt) {
    this.y = 0;
    this.root.visible = true;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.state = HeroState.PATROL;
      this.patrolIndex = 0;
      this.target = this.patrolPoints[0].clone();
      this.inst.play('Idle', { fade: 0.25 });
    }
  }

  /** إعادة ضبط كاملة (لعبة جديدة) */
  reset() {
    this.state = HeroState.PATROL;
    this.respawnCount = 0;
    this.deaths = 0;
    this._applyStats();
    this.hp = this.maxHp;
    this.root.position.copy(this.spawn);
    this.root.visible = true;
    this.y = 0; this.vy = 0; this.yaw = Math.PI;
    this.inst.setOpacity(1);
    this.inst.play('Idle', { fade: 0.1 });
    this.plate.setVisible(true);
    this.patrolIndex = 0;
    this.target = this.patrolPoints[0].clone();
    this.cooldown = this.hurtTimer = this.deadTimer = this.respawnTimer = this.attackTimer = 0;
  }
}
