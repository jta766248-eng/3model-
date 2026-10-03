/**
 * ============================================================
 *  characters.js  —  تحميل الشخصية (Man in Long Sleeves) وصنع نسخ منها
 * ============================================================
 *  الموديل الأصلي: assets/man-in-long-sleeves.glb (Quaternius)
 *  فيه 11 أنيميشن: Idle / Walk / Run / Punch / Death / Standing / Clap ...
 *
 *  نفس الموديل مستعمل في:
 *    - اللاعب      (createInstance → tint أزرق)
 *    - الحارس NPC  (createInstance → tint أحمر)   ← الشخصية المطلوبة
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const TARGET_HEIGHT = 1.8;      // نطبّع طول الشخصية بـ 1.8 متر
// إزاحة اتجاه الموديل: حسب تحليل فيرتكسات العينين، الموديل (بالدوران 0) يواجه +Z
export const MODEL_FACING  = 0;
export const MOVE_ANIMS    = ['Idle', 'Walk', 'Run', 'Punch', 'Death', 'Standing', 'Clap', 'Jump'];

export class CharacterInstance {
  constructor(root, mixer, actions, materials) {
    this.root = root;
    this.mixer = mixer;
    this.actions = actions;          // { Idle: AnimationAction, ... }
    this.materials = materials;      // مصفوفة مواد خاصة بهذه النسخة
    this.current = null;
    this._opacity = 1;
  }

  /** تشغيل أنيميشن مع انتقال ناعم */
  play(name, { fade = 0.22, loop = THREE.LoopRepeat, clamp = false, timeScale = 1, onDone = null } = {}) {
    const next = this.actions[name];
    if (!next) return null;
    if (this.current === next && next.isRunning() && !onDone) {
      next.timeScale = timeScale;
      return next;
    }
    next.reset();
    next.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    next.clampWhenFinished = clamp;
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    next.play();
    this.current = next;
    if (onDone) {
      const cb = () => { this.mixer.removeEventListener('finished', cb); onDone(); };
      this.mixer.addEventListener('finished', cb);
    }
    return next;
  }

  /** شفافية (تستعمل في الاختفاء عند الموت) */
  setOpacity(o) {
    if (o === this._opacity) return;
    this._opacity = o;
    for (const m of this.materials) {
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o > 0.6;
    }
  }

  update(dt) { this.mixer.update(dt); }
  get height() { return TARGET_HEIGHT; }
}

export class CharacterFactory {
  static async load(url) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    return new CharacterFactory(gltf);
  }

  constructor(gltf) {
    this.gltf = gltf;
    this.clips = {};
    for (const c of gltf.animations) {
      const m = /Man_([A-Za-z]+)/.exec(c.name);
      this.clips[m ? m[1] : c.name] = c;
    }
    // قياس الموديل الأصلي
    const box = new THREE.Box3().setFromObject(gltf.scene);
    this.rawSize = box.getSize(new THREE.Vector3());
    this.scaleFactor = TARGET_HEIGHT / Math.max(1e-6, this.rawSize.y);
  }

  /**
   * نسخة جديدة من الشخصية.
   * @param {{shirt?:number, pants?:number, skin?:number, hair?:number, metalness?:number}} opts
   */
  createInstance(opts = {}) {
    const model = cloneSkinned(this.gltf.scene);
    model.scale.multiplyScalar(this.scaleFactor);

    // ضبط الموضع: الرجلين على الأرض + توسيط
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.x -= (box.min.x + box.max.x) / 2;
    model.position.z -= (box.min.z + box.max.z) / 2;
    model.position.y -= box.min.y;

    const materials = [];
    const byName = new Map();
    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      const src = o.material;
      const key = src.name || src.uuid;
      let mat = byName.get(key);
      if (!mat) {
        mat = src.clone();
        mat.metalness = opts.metalness ?? 0.0;
        mat.roughness = 0.85;
        if (opts[key.toLowerCase()] !== undefined) mat.color.setHex(opts[key.toLowerCase()]);
        byName.set(key, mat);
        materials.push(mat);
      }
      o.material = mat;
    });

    const root = new THREE.Group();
    root.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      actions[name] = mixer.clipAction(clip);
    }

    const inst = new CharacterInstance(root, mixer, actions, materials);
    inst.model = model;
    inst.play('Idle');
    return inst;
  }
}
