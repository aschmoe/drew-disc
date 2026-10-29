// Every sound in the game, synthesized with Web Audio: no files to download. Browsers only allow
// audio after the player interacts, so nothing plays until unlock() runs from a tap or key.

import type { FlightEventKind } from '../sim/flight';

const MUTE_KEY = 'drew-disc-muted';

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private noise!: AudioBuffer;
  private jetGain: GainNode | null = null;
  private muted = false;
  private birdTimer = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.55;
    this.ambience.connect(this.master);

    // Two seconds of white noise, reused by everything noisy.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.startBreeze();
    this.startJetRumble();
    this.scheduleBirds();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage can be unavailable (private windows); the toggle still works for this visit.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** A flight event reached in playback. speed in m/s. */
  event(kind: FlightEventKind, speed: number): void {
    if (!this.ctx) return;
    switch (kind) {
      case 'release':
        this.whoosh(speed);
        break;
      case 'chains':
      case 'in-basket':
        this.chains(Math.min(1, 0.45 + speed / 16));
        break;
      case 'spit-out':
      case 'blow-through':
        this.chains(0.7);
        window.setTimeout(() => this.clank(0.5), 90);
        break;
      case 'band':
      case 'cage':
        this.clank(Math.min(1, 0.4 + speed / 15));
        break;
      case 'branch':
        this.rustle(Math.min(1, 0.3 + speed / 25));
        break;
      case 'trunk':
        this.thunk(Math.min(1, 0.4 + speed / 20));
        break;
      case 'ground':
        this.thud(Math.min(1, 0.25 + speed / 30));
        break;
    }
  }

  /** A short rising fanfare: birdie, or a bigger one for an ace. */
  fanfare(ace: boolean): void {
    if (!this.ctx) return;
    const notes = ace ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, this.now + 0.12 * i, 0.35, 0.12, 'triangle'));
    if (ace) [1047, 1319, 1568].forEach((f) => this.tone(f, this.now + 0.12 * notes.length, 1.2, 0.08, 'triangle'));
  }

  /** 0..1: how close a jet is. Drives the rumble. */
  setJetProximity(p: number): void {
    if (!this.ctx || !this.jetGain) return;
    this.jetGain.gain.setTargetAtTime(p * p * 0.5, this.ctx.currentTime, 0.3);
  }

  /** Called every frame; schedules ambient birdsong. */
  update(dt: number): void {
    if (!this.ctx) return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) this.scheduleBirds();
  }

  // --- Building blocks -------------------------------------------------------------------------

  private get now(): number {
    return this.ctx!.currentTime;
  }

  private tone(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', bus?: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(bus ?? this.sfx);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private noiseBurst(at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, bus?: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus ?? this.sfx);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur + 0.05);
  }

  /** The chain "ching": inharmonic metal partials struck several times as the chains rattle. */
  private chains(strength: number): void {
    const hits = 3 + Math.round(strength * 4);
    for (let h = 0; h < hits; h++) {
      const at = this.now + h * (0.025 + Math.random() * 0.05);
      const v = (0.07 + strength * 0.07) * (1 - h / (hits + 2));
      for (const base of [1180, 1730, 2410, 3150, 4020]) {
        this.tone(base * (0.97 + Math.random() * 0.06), at, 0.5 + Math.random() * 0.7, v * (1200 / base), 'sine');
      }
      this.noiseBurst(at, 0.06, v * 0.8, 'highpass', 5000);
    }
  }

  private clank(strength: number): void {
    for (const base of [420, 760, 1290]) this.tone(base * (0.98 + Math.random() * 0.04), this.now, 0.35, 0.09 * strength, 'square');
    this.noiseBurst(this.now, 0.08, 0.12 * strength, 'bandpass', 2400, 2);
  }

  private whoosh(speed: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(500 + speed * 25, this.now);
    f.frequency.exponentialRampToValueAtTime(220, this.now + 0.4);
    const g = ctx.createGain();
    const vol = Math.min(0.35, 0.08 + speed * 0.008);
    g.gain.setValueAtTime(0, this.now);
    g.gain.linearRampToValueAtTime(vol, this.now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, this.now + 0.45);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(this.now, Math.random());
    src.stop(this.now + 0.5);
  }

  private rustle(strength: number): void {
    for (let i = 0; i < 3; i++) this.noiseBurst(this.now + i * 0.04, 0.18, 0.12 * strength, 'bandpass', 3200 + Math.random() * 1500, 0.8);
  }

  private thunk(strength: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(190, this.now);
    o.frequency.exponentialRampToValueAtTime(80, this.now + 0.15);
    g.gain.setValueAtTime(0.4 * strength, this.now);
    g.gain.exponentialRampToValueAtTime(0.0001, this.now + 0.22);
    o.connect(g).connect(this.sfx);
    o.start();
    o.stop(this.now + 0.3);
    this.noiseBurst(this.now, 0.05, 0.2 * strength, 'lowpass', 1800);
  }

  private thud(strength: number): void {
    this.tone(85, this.now, 0.18, 0.25 * strength, 'sine');
    this.noiseBurst(this.now, 0.12, 0.12 * strength, 'lowpass', 900);
  }

  private startBreeze(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    // A slow swell, like gusts through the trees.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ctx.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g).connect(this.ambience);
    src.start();
    lfo.start();
  }

  private startJetRumble(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.ambience);
    src.start();
    this.jetGain = g;
  }

  /** A little birdsong phrase, then the next one a few seconds later. */
  private scheduleBirds(): void {
    this.birdTimer = 2.5 + Math.random() * 5;
    const ctx = this.ctx!;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      const at = this.now + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(base * (1 + (Math.random() - 0.3) * 0.25), at);
      o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.5), at + 0.07);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.025, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(g).connect(this.ambience);
      o.start(at);
      o.stop(at + 0.12);
    }
  }
}
