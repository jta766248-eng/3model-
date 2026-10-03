/**
 * ============================================================
 *  ui.js  —  واجهة اللاعب (HUD + الشاشات) بالعربية
 * ============================================================
 */
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      heroCard: $('heroCard'), heroHpBar: $('heroHpBar'), heroState: $('heroState'),
      heroRespawn: $('heroRespawn'), heroLv: $('heroLv'),
      sWave: $('sWave'), sScore: $('sScore'), sAlive: $('sAlive'), sDead: $('sDead'), sRespawn: $('sRespawn'),
      pHpBar: $('pHpBar'), pHpTxt: $('pHpTxt'), pDashBar: $('pDashBar'), dashTxt: $('dashTxt'),
      banner: $('banner'), toast: $('toast'), dmgFlash: $('dmgFlash'),
      menu: $('menu'), pause: $('pause'), over: $('over'), loading: $('loading'),
      touch: $('touch'),
      pWave: $('pWave'), pScore: $('pScore'), pBuried: $('pBuried'), pRespawns: $('pRespawns'),
      oScore: $('oScore'), oWave: $('oWave'), oBuried: $('oBuried'), oRespawns: $('oRespawns'),
      overTitle: $('overTitle'), overMsg: $('overMsg')
    };
    this.mode = 'new';
    this._bind();
  }

  _bind() {
    for (const opt of document.querySelectorAll('.modeOpt')) {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.modeOpt').forEach(o => o.classList.remove('sel'));
        opt.classList.add('sel');
        this.mode = opt.dataset.mode;
        this.onModeChange?.(this.mode);
      });
    }
    $('btnStart').addEventListener('click', () => this.onStart?.());
    $('btnResume').addEventListener('click', () => this.onResume?.());
    $('btnQuit').addEventListener('click', () => this.onQuit?.());
    $('btnAgain').addEventListener('click', () => this.onAgain?.());
  }

  setTouch(on) {
    this.el.touch.classList.toggle('on', !!on);
  }

  hideLoading() { this.el.loading.style.display = 'none'; }

  hideScreens() {
    for (const k of ['menu', 'pause', 'over']) this.el[k].classList.remove('on');
  }
  show(name) {
    this.hideScreens();
    this.el[name].classList.add('on');
  }

  setHero({ hp, maxHp, level, status, dead, respawnIn }) {
    const p = Math.max(0, hp) / Math.max(1, maxHp);
    this.el.heroHpBar.style.width = (p * 100).toFixed(1) + '%';
    this.el.heroState.textContent = status || '';
    this.el.heroLv.textContent = `مستوى ${level}`;
    this.el.heroCard.classList.toggle('dead', !!dead);
    if (dead && respawnIn != null) {
      this.el.heroRespawn.style.display = 'block';
      this.el.heroRespawn.textContent = `⏳ يرجع بعد ${Math.max(0, respawnIn).toFixed(1)} ثانية — نفس البلاصة`;
    } else {
      this.el.heroRespawn.style.display = 'none';
    }
  }

  setPlayer({ hp, maxHp, dashRatio }) {
    const p = Math.max(0, hp) / Math.max(1, maxHp);
    this.el.pHpBar.style.width = (p * 100).toFixed(1) + '%';
    this.el.pHpTxt.textContent = `${Math.ceil(Math.max(0, hp))} / ${maxHp}`;
    this.el.pDashBar.style.width = (Math.max(0, Math.min(1, dashRatio)) * 100).toFixed(1) + '%';
    this.el.dashTxt.textContent = dashRatio >= 1 ? 'اندفاع جاهز' : 'اندفاع…';
  }

  setStats({ wave, score, alive, buried, respawns }) {
    this.el.sWave.textContent = wave;
    this.el.sScore.textContent = score;
    this.el.sAlive.textContent = alive;
    this.el.sDead.textContent = buried;
    this.el.sRespawn.textContent = respawns;
  }

  banner(text, color = '#ff6b6b', ms = 1600) {
    const b = this.el.banner;
    b.textContent = text;
    b.style.color = color;
    b.style.opacity = '1';
    clearTimeout(this._bT);
    this._bT = setTimeout(() => { b.style.opacity = '0'; }, ms);
  }

  toast(text, ms = 2600) {
    const t = this.el.toast;
    t.innerHTML = text;
    t.style.opacity = '1';
    clearTimeout(this._tT);
    this._tT = setTimeout(() => { t.style.opacity = '0'; }, ms);
  }

  flashDamage() {
    const f = this.el.dmgFlash;
    f.style.opacity = '0.85';
    clearTimeout(this._fT);
    this._fT = setTimeout(() => { f.style.opacity = '0'; }, 130);
  }

  showPauseStats(s) {
    this.el.pWave.textContent = s.wave;
    this.el.pScore.textContent = s.score;
    this.el.pBuried.textContent = s.buried;
    this.el.pRespawns.textContent = s.respawns;
  }

  showGameOver(s) {
    this.el.oScore.textContent = s.score;
    this.el.oWave.textContent = s.wave;
    this.el.oBuried.textContent = s.buried;
    this.el.oRespawns.textContent = s.respawns;
    this.el.overTitle.textContent = '☠️ سقطت!';
    this.el.overMsg.innerHTML = s.respawns > 0
      ? `الحارس رجع <b style="color:#ffd166">${s.respawns}</b> مرة… وهو باقي في الساحة يستنى فيك.`
      : 'الحارس ما ماتش ولا مرة… جرب تكون أسرع.';
    this.show('over');
  }
}
