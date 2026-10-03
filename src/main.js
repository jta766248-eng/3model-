/**
 * ============================================================
 *  main.js  —  محرك اللعبة: الكاميرا، الموجات، الحلقة الرئيسية
 * ============================================================
 *  ركّبنا فيه شخصية «Man in Long Sleeves» كـ NPC (الحارس) وهي
 *  الوحيدة لي ترجع بعد الموت — شوف src/hero.js
 */
import * as THREE from 'three';
import { CharacterFactory, MODEL_FACING } from './characters.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { SFX } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Player } from './player.js';
import { HeroNPC, HeroState } from './hero.js';
import { LegacyManager } from './legacy.js';

const GLB_URL = './assets/man-in-long-sleeves.glb';

/** اتجاه النظر انطلاقا من زاوية الجسم */
const facingOf = (yaw) => new THREE.Vector3(Math.sin(yaw - MODEL_FACING), 0, Math.cos(yaw - MODEL_FACING));

// ============================================================
//  كاميرا الشخص الثالث
// ============================================================
class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;                // الكاميرا وراء اللاعب (تشوف نحو -Z، فين كاين الحارس)
    this.pitch = 0.34;
    this.dist = 7.2;
    this.targetDist = 7.2;
    this.pos = new THREE.Vector3(0, 4, 12);
    this.look = new THREE.Vector3();
    this.shake = 0;
  }

  addShake(v) { this.shake = Math.min(0.55, this.shake + v); }

  update(dt, input, targetPos) {
    // سحب الماوس/اللمس = دوران
    this.yaw -= input.look.x * 0.0038;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.look.y * 0.0032, -0.15, 1.05);
    this.targetDist = THREE.MathUtils.clamp(this.targetDist + input.zoomDelta * 0.7, 3.2, 14);
    this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 8);

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = new THREE.Vector3(
      targetPos.x - fwd.x * this.dist * cp,
      targetPos.y + 1.5 + this.dist * sp,
      targetPos.z - fwd.z * this.dist * cp
    );
    // ما تدخلش الكاميرا تحت الأرض
    want.y = Math.max(want.y, 0.9);
    this.pos.lerp(want, Math.min(1, dt * 9));

    if (this.shake > 0.001) {
      this.shake *= Math.pow(0.02, dt);
      const s = this.shake * 0.35;
      this.camera.position.set(
        this.pos.x + (Math.random() - 0.5) * s,
        this.pos.y + (Math.random() - 0.5) * s,
        this.pos.z + (Math.random() - 0.5) * s
      );
    } else {
      this.camera.position.copy(this.pos);
    }
    this.look.lerp(new THREE.Vector3(targetPos.x, targetPos.y + 1.35, targetPos.z), Math.min(1, dt * 12));
    this.camera.lookAt(this.look);
  }
}

// ============================================================
//  اللعبة
// ============================================================
class Game {
  constructor() {
    this.state = 'boot';         // boot | menu | play | pause | over
    this.score = 0;
    this.wave = 1;
    this.waveTimer = 0;
    this.spawnQueue = 0;
    this.spawnCooldown = 0;
    this.breakTimer = 0;
    this.pickups = [];
    this.clock = new THREE.Clock();
    this.uiUpdate = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game'),
      antialias: true, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);
    this.rig = new CameraRig(this.camera);

    this.world = new World(this.scene);
    // على الهاتف: ظلال أخف باش اللعبة تبقى سلسة
    if (matchMedia('(pointer: coarse)').matches) {
      this.world.moon.shadow.mapSize.set(1024, 1024);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    }
    this.fx = new FX(this.scene);
    this.sfx = new SFX();
    this.input = new Input();
    this.ui = new UI();

    addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this._pause(); });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.state === 'play') this._pause();
        else if (this.state === 'pause') this._resume();
      }
      if (e.code === 'KeyM') { this.sfx.enabled = !this.sfx.enabled; this.ui.toast(this.sfx.enabled ? '🔊 الصوت مفتوح' : '🔇 الصوت مسدود', 1200); }
    });

    this.ui.onStart = () => this.startGame();
    this.ui.onResume = () => this._resume();
    this.ui.onQuit = () => { this.state = 'menu'; this.ui.show('menu'); };
    this.ui.onAgain = () => this.startGame();
  }

  async boot() {
    try {
      this.factory = await CharacterFactory.load(GLB_URL);
    } catch (err) {
      console.error(err);
      const l = document.getElementById('loading');
      l.innerHTML = `<p style="color:#ff8080;max-width:80vw;text-align:center">تعذّر تحميل الموديل<br><code style="font-size:12px">${GLB_URL}</code><br><br>شغّل اللعبة عبر سيرفر HTTP (مثال: <code>npx serve</code>) ماشي بفتح الملف مباشرة.</p>`;
      return;
    }

    // اللاعب
    this.player = new Player({
      factory: this.factory, scene: this.scene, world: this.world, fx: this.fx, sfx: this.sfx,
      spawn: this.world.playerSpawn,
      onEvent: (k, d) => this._playerEvent(k, d)
    });

    // ★ الحارس — الـNPC المطلوب (هو الوحيد لي يرجع)
    this.hero = new HeroNPC({
      factory: this.factory, scene: this.scene, world: this.world, fx: this.fx, sfx: this.sfx,
      spawn: this.world.heroSpawn,
      onEvent: (k, d) => this._heroEvent(k, d)
    });

    // الـNPC القدما (ما يرجعوش)
    this.legacy = new LegacyManager({ scene: this.scene, world: this.world, fx: this.fx, sfx: this.sfx });

    this.ui.setTouch(this.input.isTouch);
    this.input.bindTouchUI();
    this.ui.hideLoading();
    this.ui.show('menu');
    this.state = 'menu';
    this._loop();
  }

  // ---------------------------------------------------------- دورة اللعبة
  startGame() {
    this.sfx.init(); this.sfx.resume(); this.sfx.click();
    this.ui.hideScreens();
    this.state = 'play';
    this.clock.getDelta();
    this.score = 0;
    this.wave = 1;
    this.spawnQueue = 0;
    this.breakTimer = 2.4;
    this.waveTimer = 0;

    this.player.reset();
    this.hero.reset();
    this.legacy.reset();
    this.legacy.mode = this.ui.mode;      // 'new' → القدما ما يرجعوش / 'old' → الكل يرجع
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups.length = 0;

    this.rig.yaw = 0;
    this.rig.pitch = 0.34;
    this.rig.targetDist = 7.2;
    this.rig.pos.copy(this.world.playerSpawn).setY(4);

    this.ui.banner('الموجة 1 — ابدأ!', '#ffd166', 1800);
    this.ui.toast(this.ui.mode === 'new'
      ? '🛡️ الوضع الجديد: <b>الحارس فقط</b> يرجع بعد الموت — الـNPC القدما يبقاو مدفونين ☠️'
      : '🕰️ الوضع القديم: كل الـNPC يرجعو بعد الموت.', 4200);
    this.sfx.waveStart();
    this._nextWave();
  }

  _pause() {
    this.state = 'pause';
    this.ui.showPauseStats(this._stats());
    this.ui.show('pause');
  }
  _resume() {
    this.state = 'play';
    this.ui.hideScreens();
    this.clock.getDelta();
  }

  _stats() {
    return {
      wave: this.wave, score: Math.round(this.score),
      buried: this.legacy.buried, respawns: this.hero.respawnCount
    };
  }

  _nextWave() {
    const count = Math.min(4 + this.wave * 2, 15);
    this.spawnQueue = count;
    this.spawnCooldown = 0;
    this.breakTimer = 0;
  }

  // ---------------------------------------------------------- الأحداث
  _playerEvent(kind, data) {
    if (kind === 'hurt') {
      this.ui.flashDamage();
      this.rig.addShake(0.35);
    } else if (kind === 'death') {
      this.rig.addShake(0.5);
      setTimeout(() => {
        this.state = 'over';
        this.ui.showGameOver(this._stats());
      }, 1500);
    }
  }

  _heroEvent(kind, data) {
    if (kind === 'death') {
      this.score += 80;
      this.ui.toast('☠️ <b style="color:#ff6b6b">الحارس مات!</b> راهو غادي يرجع بعد شوية…', 2600);
      this.ui.banner('☠️ الحارس طاح!', '#ff6b6b', 1800);
    } else if (kind === 'respawn') {
      this.ui.banner(`⚡ رجع الحارس — مستوى ${data.level}`, '#ffd166', 2000);
      this.ui.toast(`⚡ الحارس رجع في <b>نفس البلاصة</b> وهو أقوى: صحة ${data.maxHp} · ضرر ${data.damage}`, 3600);
      this.rig.addShake(0.3);
    }
  }

  // ---------------------------------------------------------- الضرر
  /** ضرر من اللاعب (مخروط أمامه) */
  _playerDealDamage(amount, fromPos, range, yaw) {
    const facing = facingOf(yaw);
    let hits = 0;
    const inArc = (p) => {
      const dx = p.x - fromPos.x, dz = p.z - fromPos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) return false;
      if (d < 0.6) return true;
      return (dx / d) * facing.x + (dz / d) * facing.z > 0.28;   // ~ 145°
    };

    for (const e of this.legacy.enemies) {
      if (e.dead) continue;
      if (inArc(e.position)) {
        const killed = e.hit(amount, fromPos);
        hits++;
        if (killed) {
          this.score += 10;
          this.rig.addShake(0.12);
          if (Math.random() < 0.28) this._dropPickup(e.position.clone());
        }
      }
    }
    if (this.hero.alive && inArc(this.hero.position)) {
      const killed = this.hero.hit(amount, fromPos);
      hits++;
      this.rig.addShake(0.16);
      if (killed) this.score += 60;   // أسقطنا الحارس (لكنه غادي يرجع…)
    }
    if (hits === 0) this.sfx.punchMiss();
    else this.sfx.punchHit();
  }

  /** ضرر على اللاعب */
  _damagePlayer(amount, fromPos) {
    if (this.state !== 'play') return;
    const died = this.player.takeDamage(amount, fromPos);
    if (!died) this.rig.addShake(0.22);
  }

  _dropPickup(pos) {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: 0x2ee66b })
    );
    core.position.y = 1.0;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 20),
      new THREE.MeshBasicMaterial({ color: 0x8affc0, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    mesh.add(core, ring);
    mesh.position.copy(pos).setY(0);
    this.scene.add(mesh);
    this.pickups.push({ mesh, core, t: 0 });
  }

  // ---------------------------------------------------------- الحلقة
  _loop = () => {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update();

    // مؤثرات دائما
    this.fx.update(dt);
    if (this.state === 'play') this._updatePlay(dt);
    else {
      // في القائمة: الحارس يتمشى في الساحة كخلفية حية
      this.world.update(dt * 0.5);
      this.player?.inst.update(dt);
      this.hero?.update(dt * 0.8, {
        playerPos: this.player.position, playerAlive: false,
        camera: this.camera, dealDamage: () => {}
      });
      this.fx.update(dt);
      this._updateCamera(dt);
    }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  _updateCamera(dt) {
    const target = this.player.position.clone().setY(this.player.y ?? 0);
    this.rig.update(dt, this.input, target);
    this.camYaw = this.rig.yaw;
  }

  _updatePlay(dt) {
    this.world.update(dt);
    this.player.update(dt, {
      input: this.input,
      camera: this.camera,
      camYaw: this.rig.yaw,
      dealDamage: (amount, fromPos, range, yaw) => this._playerDealDamage(amount, fromPos, range, yaw)
    });

    this.hero.update(dt, {
      playerPos: this.player.position,
      playerAlive: !this.player.dead,
      camera: this.camera,
      dealDamage: (amount, fromPos) => this._damagePlayer(amount, fromPos)
    });

    this.legacy.update(dt, {
      playerPos: this.player.position,
      playerAlive: !this.player.dead,
      camera: this.camera,
      dealDamage: (amount, fromPos) => this._damagePlayer(amount, fromPos)
    });

    // منع التراكب بين اللاعب والحارس
    if (this.hero.alive) {
      const d = new THREE.Vector3(
        this.player.position.x - this.hero.position.x, 0,
        this.player.position.z - this.hero.position.z
      );
      const dist = d.length();
      const minD = this.player.radius + this.hero.cfg.radius + 0.05;
      if (dist < minD && dist > 1e-4) {
        d.multiplyScalar((minD - dist) / dist * 0.5);
        this.player.position.add(d);
        this.hero.position.sub(d);
      }
    }
    // فرقة مع القدماء
    for (const e of this.legacy.enemies) {
      if (e.dead) continue;
      const dx = this.player.position.x - e.position.x, dz = this.player.position.z - e.position.z;
      const dist = Math.hypot(dx, dz), minD = this.player.radius + e.radius;
      if (dist < minD && dist > 1e-4) {
        const push = (minD - dist) / dist * 0.7;
        this.player.position.x += dx * push;
        this.player.position.z += dz * push;
      }
    }

    // المخلّفات (صحة)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.core.rotation.y += dt * 2.4;
      p.core.position.y = 1.0 + Math.sin(p.t * 3) * 0.12;
      const d = Math.hypot(this.player.position.x - p.mesh.position.x, this.player.position.z - p.mesh.position.z);
      if (d < 1.3 && !this.player.dead) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 28);
        this.fx.burst(p.mesh.position.clone().setY(1), 0x2ee66b, { count: 16, speed: 4, life: 0.6, size: 0.12 });
        this.fx.label(p.mesh.position.clone().setY(1.8), '+28', '#8affc0', { life: 0.9, size: 48, scale: 1, vy: 1.4 });
        this.sfx.respawn();
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }

    // مدير الموجات
    if (this.spawnQueue > 0) {
      this.spawnCooldown -= dt;
      if (this.spawnCooldown <= 0) {
        this.legacy.spawnWave(1, this.wave);
        this.spawnQueue--;
        this.spawnCooldown = 0.45;
      }
    } else if (this.legacy.aliveCount === 0) {
      this.breakTimer += dt;
      if (this.breakTimer > 3.5) {
        this.wave++;
        this.breakTimer = 0;
        this.sfx.waveStart();
        this.ui.banner(`الموجة ${this.wave}`, '#ff6b6b', 1700);
        this.ui.toast(this.legacy.mode === 'old'
          ? `الموجة ${this.wave}: ${Math.min(4 + this.wave * 2, 15)} قدماء جداد (وفي القدما يرجعو…)`
          : `الموجة ${this.wave}: ${Math.min(4 + this.wave * 2, 15)} قدماء جداد — وهذو ما يرجعوش ☠️`, 3000);
        this._nextWave();
      }
    }

    // النقاط حسب البقاء
    this.score += dt * (1 + this.wave * 0.2);

    this._updateCamera(dt);
    this._updateHud(dt);
  }

  _updateHud(dt) {
    this.uiUpdate += dt;
    if (this.uiUpdate < 0.08) return;
    this.uiUpdate = 0;

    this.ui.setHero({
      hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level,
      status: this.hero.statusText(),
      dead: this.hero.state === HeroState.DEAD,
      respawnIn: this.hero.state === HeroState.DEAD ? this.hero.respawnTimer : null
    });
    this.ui.setPlayer({
      hp: this.player.hp, maxHp: this.player.maxHp,
      dashRatio: 1 - this.player.dashCd / 2.0
    });
    this.ui.setStats({
      wave: this.wave, score: Math.round(this.score),
      alive: this.legacy.aliveCount, buried: this.legacy.buried,
      respawns: this.hero.respawnCount
    });
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}

export function start() {
  const game = new Game();
  window.__game = game;     // للتجريب من الكونسول
  game.boot();
}
