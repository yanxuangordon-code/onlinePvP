// HYPERFIRE Audio Engine — procedural Web Audio API sounds

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.volume = 0.6;
    this.enabled = true;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('[Audio] Web Audio API not available');
      this.enabled = false;
    }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // ── Core helpers ────────────────────────────────────────────────────────────

  _noise(duration, gain = 0.3) {
    if (!this.enabled) return;
    this._resume();
    const bufSize = Math.ceil(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(this.masterGain);
    src.start();
    return { src, gain: g };
  }

  _tone(freq, type, duration, gainVal, endGain = 0) {
    if (!this.enabled) return null;
    this._resume();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(endGain || 0.001, this.ctx.currentTime + duration);
    osc.connect(g); g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
    return { osc, gain: g };
  }

  _filter(node, type, freq) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    node.gain.connect(f); f.connect(this.masterGain);
    node.gain.disconnect(this.masterGain);
    return f;
  }

  // ── Weapon sounds ───────────────────────────────────────────────────────────

  playShot(weapon) {
    if (!this.enabled) return;
    switch (weapon) {
      case 'ak47':   return this._shotRifle(0.55, 120, 0.28);
      case 'm4a1':   return this._shotRifle(0.45, 160, 0.22);
      case 'awp':    return this._shotSniper();
      case 'shotgun':return this._shotShotgun();
      case 'smg':    return this._shotSMG();
      case 'pistol': return this._shotPistol(0.38, 200);
      case 'deagle': return this._shotPistol(0.55, 110);
      default:       return this._shotRifle(0.5, 140, 0.25);
    }
  }

  _shotRifle(dur, pitch, vol) {
    this._resume();
    const now = this.ctx.currentTime;

    // Low body thud
    const body = this.ctx.createOscillator();
    const bodyG = this.ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(pitch, now);
    body.frequency.exponentialRampToValueAtTime(40, now + dur * 0.4);
    bodyG.gain.setValueAtTime(vol * 1.4, now);
    bodyG.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.45);
    body.connect(bodyG); bodyG.connect(this.masterGain);
    body.start(now); body.stop(now + dur * 0.5);

    // Crack / noise burst
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1);
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const nsG = this.ctx.createGain();
    nsG.gain.setValueAtTime(vol, now);
    nsG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 1800;
    ns.connect(hpf); hpf.connect(nsG); nsG.connect(this.masterGain);
    ns.start(now);
  }

  _shotSniper() {
    this._resume();
    const now = this.ctx.currentTime;

    // Long crack
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.6);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.75);

    // High crack
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const nsG = this.ctx.createGain();
    nsG.gain.setValueAtTime(0.5, now);
    nsG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 3000;
    ns.connect(hpf); hpf.connect(nsG); nsG.connect(this.masterGain);
    ns.start(now);
  }

  _shotShotgun() {
    this._resume();
    const now = this.ctx.currentTime;

    // Big low boom
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
    g.gain.setValueAtTime(0.7, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.45);

    // Spread noise
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const nsG = this.ctx.createGain();
    nsG.gain.setValueAtTime(0.55, now);
    nsG.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 4000;
    ns.connect(lpf); lpf.connect(nsG); nsG.connect(this.masterGain);
    ns.start(now);
  }

  _shotSMG() {
    this._resume();
    const now = this.ctx.currentTime;
    // Short sharp pop
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.12);
  }

  _shotPistol(dur, pitch) {
    this._resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + dur * 0.5);
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(now); osc.stop(now + dur);

    const bufSize = Math.ceil(this.ctx.sampleRate * 0.07);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const nsG = this.ctx.createGain();
    nsG.gain.setValueAtTime(0.3, now);
    nsG.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    ns.connect(nsG); nsG.connect(this.masterGain);
    ns.start(now);
  }

  // ── Hit / damage sounds ─────────────────────────────────────────────────────

  playHitConfirm() {
    // Short high beep — hit marker sound
    this._tone(1200, 'sine', 0.07, 0.18);
  }

  playDamaged() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    // Low thud + ringing
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(now); osc.stop(now + 0.4);
  }

  playBulletImpact() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 2000;
    ns.connect(lpf); lpf.connect(g); g.connect(this.masterGain);
    ns.start(now);
  }

  // ── Reload ──────────────────────────────────────────────────────────────────

  playReloadStart() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    // Magazine release click
    this._metalClick(now, 0.22);
  }

  playReloadEnd() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    // Mag in + charge handle
    this._metalClick(now, 0.28);
    this._metalClick(now + 0.18, 0.22);
  }

  _metalClick(time, vol) {
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.04);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 2500;
    ns.connect(hpf); hpf.connect(g); g.connect(this.masterGain);
    ns.start(time);
  }

  // ── Footsteps ───────────────────────────────────────────────────────────────

  playFootstep() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 600;
    ns.connect(lpf); lpf.connect(g); g.connect(this.masterGain);
    ns.start(now);
  }

  // ── Kill / death ─────────────────────────────────────────────────────────────

  playKillConfirm() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    // Two rising tones — satisfying kill ding
    this._scheduleTone(now,        880, 0.12, 0.2);
    this._scheduleTone(now + 0.10, 1320, 0.10, 0.18);
  }

  _scheduleTone(time, freq, dur, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(time); osc.stop(time + dur + 0.01);
  }

  playDeath() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    // Low descending tone
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.8);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(now); osc.stop(now + 1.0);
  }

  playJump() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    const bufSize = Math.ceil(this.ctx.sampleRate * 0.06);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource();
    ns.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = 'lowpass'; lpf.frequency.value = 500;
    ns.connect(lpf); lpf.connect(g); g.connect(this.masterGain);
    ns.start(now);
  }

  playRespawn() {
    if (!this.enabled) return;
    this._resume();
    const now = this.ctx.currentTime;
    [440, 550, 660, 880].forEach((f, i) => this._scheduleTone(now + i * 0.08, f, 0.1, 0.15));
  }

  playWeaponSwitch() {
    if (!this.enabled) return;
    this._resume();
    this._metalClick(this.ctx.currentTime, 0.2);
  }

  playEmptyClick() {
    if (!this.enabled) return;
    this._resume();
    this._metalClick(this.ctx.currentTime, 0.15);
  }
}

window.AudioManager = AudioManager;
