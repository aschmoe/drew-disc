// One player playing one hole: aim, throw, watch the flight, walk to the lie, repeat.
// The pieces live beside it: turn state in round.ts, the camera in camera.ts, flight playback in
// playback.ts, keys in keyboard.ts. Multiplayer later wraps this same loop in a room (see
// docs/DESIGN.md section 9).

import * as THREE from 'three';
import { DEFAULT_BAG, getDisc } from '@shared/discs';
import type { CourseDef, Hole } from '../content/hole';
import { simulateThrow, type FlightEvent, type FlightResult, type ThrowInput, type Wind } from '../sim/flight';
import { dirToHeading } from '../sim/frame';
import { createRng } from '../sim/rng';
import { v3, type V3 } from '../sim/vec';
import { Controls, type ThrowGesture } from '../ui/controls';
import { DebugPanel } from '../ui/debugPanel';
import { Overlay } from '../ui/overlay';
import { Character, RELEASE_AT, releasePoint, type ThrowAnim } from '../world/character';
import { Effects } from '../world/effects';
import { buildDiscMesh, teePadLift } from '../world/props';
import { CameraRig } from './camera';
import { Keyboard } from './keyboard';
import { FlightPlayback, makeLine, setLine, THROW_ANIM_SECONDS } from './playback';
import { Round, type Scorecard } from './round';
import { formatFeet } from './score';
import { AIM_LIMIT, HYZER_LIMIT, LAUNCH_DEFAULT, LAUNCH_MAX, LAUNCH_MIN, MAX_POWER, type ShotSettings } from './settings';
import { autoPuttPower, releaseFrom } from './shot';

type Phase = 'aim' | 'flight' | 'holed';

const PREVIEW_FRACTION = 0.4;
const LOOK_SECONDS = 3.5;

export class Game {
  private phase: Phase = 'aim';
  private round: Round;
  private result: FlightResult | null = null;
  private resultDisc = '';
  private wind: Wind;
  private settings: ShotSettings = {
    discId: DEFAULT_BAG[1],
    style: 'backhand',
    power: 0.9,
    aimOffsetDeg: 0,
    hyzerDeg: 0,
    launchDeg: LAUNCH_DEFAULT,
    fullPreview: false,
  };
  private pullPower: number | null = null;
  private previewDirty = true;
  private puttTarget: number | null = null;
  private followClock = -1;
  private lookUntil = 0;
  private now = 0;
  private hasThrown = false;

  private overlay: Overlay;
  private controls: Controls;
  private keyboard: Keyboard;
  private debug: DebugPanel | null = null;
  private rig: CameraRig;
  private character = new Character();
  private thrower = this.character.root;
  /** Style of the throw in progress (the animation keeps it even if settings change). */
  private throwAnim: ThrowAnim = 'backhand';
  private playback: FlightPlayback;
  private discId = '';
  private preview = makeLine(0xffffff, 0.8, true);
  private markers = new THREE.Group();
  private effects = new Effects();
  /** Called as the flight playback reaches each event (landing, chains...), for sound. */
  onFlightEvent: ((e: FlightEvent, speed: number) => void) | null = null;
  /** Called on a birdie or better, as the disc hits the chains. */
  onCelebrate: ((ace: boolean) => void) | null = null;
  /** Called when the hole is over (in the basket, or picked up). Session shows the card. */
  onHoleDone: ((card: Scorecard, holed: boolean) => void) | null = null;
  /** Shown in the header: "Hole 4", and how the round stands ("Front 9 +1"). */
  private holeLabel = 'Hole 1';
  private roundTag = '';
  /** R (and the debug Restart) may start the hole over: not in a round, where it'd be a mulligan. */
  private allowRestart = false;
  private windRng = createRng((Date.now() & 0xffff) ^ 0x5eed);

  constructor(
    private hole: Hole,
    private course: CourseDef,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sun: THREE.DirectionalLight,
    uiRoot: HTMLElement,
    canvas: HTMLElement,
    private basket: THREE.Group,
  ) {
    this.wind = this.rollWind();
    this.round = new Round(hole.def.par, hole.world.basket);
    this.rig = new CameraRig(camera, sun, hole.world);

    this.overlay = new Overlay(uiRoot);
    this.controls = new Controls(uiRoot, DEFAULT_BAG, {
      settings: () => this.settings,
      update: (p) => this.update(p),
      pulling: (power) => {
        this.pullPower = power;
        this.previewDirty = true;
      },
      throwDisc: (g) => this.throwDisc(g),
      look: () => this.look(),
      aimBy: (aim, launch) =>
        this.update({
          aimOffsetDeg: this.settings.aimOffsetDeg + aim,
          // A putt keeps its own soft launch, as it keeps a flat release.
          launchDeg: this.settings.launchDeg + (this.round.isPutt() ? 0 : launch),
        }),
    }, canvas);
    this.keyboard = new Keyboard({
      settings: () => this.settings,
      update: (p) => this.update(p),
      canCharge: () => this.phase === 'aim',
      throwDisc: (power) => {
        this.controls.showPower(null);
        if (power > 0.05) this.throwDisc({ power, flickDeg: 0, spin: 0.95 });
      },
      look: () => this.look(),
      restart: () => this.allowRestart && this.restart(),
    });
    if (new URLSearchParams(location.search).has('debug')) {
      this.debug = new DebugPanel(uiRoot, {
        settings: () => this.settings,
        update: (p) => this.update(p),
        throwClean: (power) => this.throwDisc({ power, flickDeg: 0, spin: 1 }),
        restart: () => this.restart(),
        jumpTo: (m) => this.jumpTo(m),
      });
    }

    this.playback = new FlightPlayback(getDisc(this.settings.discId));
    scene.add(this.thrower, this.playback.disc, this.preview, this.playback.trail, this.markers, this.effects.object);
    this.restart();
    this.idle();
  }

  toast(text: string): void {
    this.overlay.showToast(text);
  }

  /** Switch to another hole's world (its scene is built by the caller). */
  setHole(hole: Hole, basket: THREE.Group): void {
    this.hole = hole;
    this.basket = basket;
    this.round = new Round(hole.def.par, hole.world.basket);
    this.rig = new CameraRig(this.camera, this.sun, hole.world);
  }

  /** Play a hole from the tee, with fresh wind. */
  startHole(label: string, roundTag: string, allowRestart: boolean): void {
    this.holeLabel = label;
    this.roundTag = roundTag;
    this.allowRestart = allowRestart;
    this.wind = this.rollWind();
    this.restart();
  }

  /** Behind a menu or card: the scene stays, nothing can be thrown. */
  idle(): void {
    this.phase = 'holed';
    this.controls.setEnabled(false);
    this.overlay.setHint(null);
  }

  private rollWind(): Wind {
    const w = this.course.environment.wind;
    return { speed: Number(this.windRng.range(w.minSpeed, w.maxSpeed).toFixed(1)), towardDeg: Math.round(this.windRng.range(0, 360)) };
  }

  private restart(): void {
    const tee = this.hole.def.tees[0];
    const g = this.hole.world.groundHeight(tee.pos[0], -tee.pos[1]);
    this.round.reset(v3(tee.pos[0], g, -tee.pos[1]));
    this.phase = 'aim';
    this.result = null;
    this.markers.clear();
    this.playback.hideTrail();
    this.settings = { ...this.settings, aimOffsetDeg: 0, hyzerDeg: 0, launchDeg: LAUNCH_DEFAULT, power: 0.9, discId: DEFAULT_BAG[1] };
    this.controls.setEnabled(true);
    this.enterAim();
    this.snapCamera();
  }

  /** Debug: put the lie on the tee-to-basket line, this many meters short of the basket. */
  private jumpTo(metersFromBasket: number): void {
    if (this.phase === 'flight') return;
    const tee = this.hole.def.tees[0];
    const b = this.hole.world.basket;
    const teeW = v3(tee.pos[0], 0, -tee.pos[1]);
    const d = Math.hypot(b.x - teeW.x, b.z - teeW.z);
    const f = Math.max(0, (d - metersFromBasket) / d);
    const x = teeW.x + (b.x - teeW.x) * f;
    const z = teeW.z + (b.z - teeW.z) * f;
    this.round.lie = v3(x, this.hole.world.groundHeight(x, z), z);
    this.enterAim();
    this.snapCamera();
  }

  /** Apply a settings change from any control. */
  private update(patch: Partial<ShotSettings>): void {
    Object.assign(this.settings, patch);
    const s = this.settings;
    s.aimOffsetDeg = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, s.aimOffsetDeg));
    s.hyzerDeg = Math.max(-HYZER_LIMIT, Math.min(HYZER_LIMIT, s.hyzerDeg));
    s.launchDeg = Math.max(LAUNCH_MIN, Math.min(LAUNCH_MAX, s.launchDeg));
    s.power = Math.max(0, Math.min(MAX_POWER, s.power));
    this.controls.render();
    this.debug?.render();
    this.previewDirty = true;
    this.refreshHeader();
  }

  // --- Shot setup -----------------------------------------------------------

  private aimHeading(): number {
    return this.round.basketHeading() + this.settings.aimOffsetDeg;
  }

  /** Where the thrower's feet are: the lie, lifted onto the tee pad when standing on it. */
  private standingAt(): V3 {
    const lie = this.round.lie;
    return v3(lie.x, lie.y + teePadLift(this.hole, lie.x, lie.z), lie.z);
  }

  private shotInput(s: ShotSettings, power: number, seed: number, flickDeg = 0, spin = 1): ThrowInput {
    const putt = this.round.isPutt();
    // The flight starts where the thrower's hand lets go (out to the right of the body), and is
    // aimed from there, so a putt off the right hand still lines up on the basket.
    const from = releaseFrom(this.standingAt(), this.round.basketHeading() + s.aimOffsetDeg, releasePoint(putt ? 'putt' : s.style));
    const b = this.hole.world.basket;
    const aimDeg = dirToHeading(v3(b.x - from.x, 0, b.z - from.z)) + s.aimOffsetDeg;
    return {
      discId: s.discId,
      style: s.style,
      hand: 'right',
      mode: putt ? 'putt' : 'throw',
      power,
      aimDeg,
      hyzerDeg: putt ? 0 : s.hyzerDeg,
      launchDeg: putt ? undefined : s.launchDeg,
      flickDeg,
      spin,
      from,
      seed,
    };
  }

  /** Set up for the next throw from the current lie. */
  private enterAim(): void {
    this.phase = 'aim';
    const putt = this.round.isPutt();
    if (putt) {
      this.settings.discId = 'chain-seeker';
      this.puttTarget = this.autoPuttPower('chain-seeker');
      this.settings.power = this.puttTarget;
    } else {
      this.puttTarget = null;
    }
    this.settings.aimOffsetDeg = 0;
    this.settings.hyzerDeg = 0;
    this.settings.launchDeg = LAUNCH_DEFAULT;
    this.controls.setPutting(putt, this.puttTarget);
    this.controls.setEnabled(true);
    this.controls.showPower(null);
    this.overlay.setHint(this.hasThrown ? null : 'Drag the scene to aim, up or down to throw higher or lower. Pull the disc down, then flick up to throw.');
    this.update({});
  }

  private refreshHeader(): void {
    this.overlay.setHeader(
      `<b>${this.holeLabel}</b> · Par ${this.hole.def.par}` +
        (this.roundTag ? `<span class="sep"></span>${this.roundTag}` : '') +
        `<span class="sep"></span>Throw <b>${this.round.strokes + 1}</b>` +
        `<span class="sep"></span><b>${formatFeet(this.round.basketDistance())}</b>` +
        `<span class="sep"></span>Wind ${this.wind.speed} m/s ${windArrow(this.wind.towardDeg - this.aimHeading())}`,
    );
  }

  /** Degrees the launch is above (or below) a normal throw; 0 when putting. */
  private launchOffset(): number {
    return this.round.isPutt() ? 0 : this.settings.launchDeg - LAUNCH_DEFAULT;
  }

  private refreshPreview(): void {
    const s = this.settings;
    if (this.discId !== s.discId) {
      this.discId = s.discId;
      this.playback.paint(getDisc(s.discId).color);
      this.character.setDiscColor(getDisc(s.discId).color);
    }
    const feet = this.standingAt();
    this.thrower.position.set(feet.x, feet.y, feet.z);
    this.thrower.rotation.y = -THREE.MathUtils.degToRad(this.aimHeading());
    if (this.phase !== 'aim') return;

    // Preview a clean version of the throw at the power being pulled (or the last power).
    const power = Math.min(1, this.pullPower ?? this.keyboard.charge ?? s.power);
    const input = this.shotInput(s, power, 1);
    const r = simulateThrow(input, this.hole.world, this.wind);
    const n = s.fullPreview ? r.path.length : Math.max(2, Math.floor(r.path.length * PREVIEW_FRACTION));
    setLine(this.preview, r.path.slice(0, n).map((p) => p.p));
    this.preview.visible = true;
    // The disc is in the thrower's hand until the release.
    this.character.showHandDisc(true);
    this.playback.hold(input.from);
  }

  /**
   * A power for a putt that arrives at the middle of the chains. Shown as the tick on the power
   * ring while putting, so a putt doesn't inherit the drive's power.
   */
  private autoPuttPower(discId: string): number {
    const settings = { ...this.settings, discId, aimOffsetDeg: 0 };
    return autoPuttPower((power) => this.shotInput(settings, power, 1), this.hole.world, this.wind);
  }

  private look(): void {
    if (this.phase !== 'aim') return;
    this.lookUntil = this.lookUntil > this.now ? 0 : this.now + LOOK_SECONDS;
  }

  // --- Throwing --------------------------------------------------------------

  private throwDisc(g: ThrowGesture): void {
    if (this.phase !== 'aim') return;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const input = this.shotInput(this.settings, g.power, seed, g.flickDeg, g.spin);
    this.result = simulateThrow(input, this.hole.world, this.wind);
    this.resultDisc = this.settings.discId;
    this.settings.power = Math.min(1, g.power);
    this.throwAnim = this.round.isPutt() ? 'putt' : this.settings.style;
    this.round.throwStarted();
    this.hasThrown = true;
    this.phase = 'flight';
    this.followClock = 0;
    this.lookUntil = 0;
    this.playback.start(this.result, this.throwAnim === 'forehand' ? 'forehand' : 'backhand');
    this.preview.visible = false;
    this.overlay.setHint(null);
    this.controls.setEnabled(false);
    if (g.power > 1) this.overlay.showToast('Muscled it!', 1200);
  }

  /** Effects for one flight event as playback reaches it. */
  private playEvent(e: FlightEvent, speed: number, discPos: THREE.Vector3): void {
    const r = this.result!;
    const b = this.hole.world.basket;
    const toward = new THREE.Vector3(b.x - discPos.x, 0, b.z - discPos.z);
    switch (e.kind) {
      case 'ground':
        this.effects.landingPuff(new THREE.Vector3(e.x, e.y, e.z), speed, r.restSurface === 'path' ? '#b9a888' : '#7da552');
        break;
      case 'chains':
      case 'in-basket':
      case 'spit-out':
      case 'blow-through':
        this.basket.userData.hitChains?.(Math.min(1, 0.35 + speed / 14), toward.x, toward.z);
        break;
      case 'band':
      case 'cage':
        this.basket.userData.hitChains?.(0.25, toward.x, toward.z);
        break;
    }
    const strokes = this.round.strokes;
    if (e.kind === 'in-basket' && strokes - this.round.par <= -1) {
      this.effects.celebrate(new THREE.Vector3(b.x, b.base, b.z), strokes === 1);
      this.onCelebrate?.(strokes === 1);
    }
    this.onFlightEvent?.(e, speed);
  }

  private finishFlight(): void {
    const disc = getDisc(this.resultDisc);
    // Mark where the throw came from.
    const lie = this.round.lie;
    const marker = buildDiscMesh(disc);
    marker.scale.setScalar(0.6);
    marker.position.set(lie.x, lie.y + 0.02, lie.z);
    this.markers.add(marker);

    const out = this.round.throwFinished(this.result!, disc);
    if (out.toast) this.overlay.showToast(out.toast.text, out.toast.ms);
    if (out.done) {
      this.phase = 'holed';
      this.controls.setEnabled(false);
      // In the basket: let the chains and confetti have their moment before the card.
      const holed = out.done === 'holed';
      window.setTimeout(() => this.onHoleDone?.(this.round.scorecard(this.holeLabel), holed), holed ? 1800 : 900);
      return;
    }
    this.enterAim();
  }

  // --- Frame update -----------------------------------------------------------

  /** Today's wind, for the flag and the clouds. */
  get windNow(): Wind {
    return this.wind;
  }

  /** Advance one rendered frame. */
  tick(dt: number): void {
    this.now += dt;
    this.effects.update(dt);
    this.basket.userData.update?.(dt);
    if (this.keyboard.tick(dt)) {
      this.controls.showPower(this.keyboard.charge);
      this.previewDirty = true;
    }
    if (this.previewDirty) {
      this.previewDirty = false;
      this.refreshPreview();
    }
    this.animateThrower(dt);

    if (this.phase === 'flight') {
      const frame = this.playback.advance(dt, this.camera.position, (e, speed, pos) => this.playEvent(e, speed, pos));
      if (!frame) {
        // Still in the swing: the disc is in the hand and the camera holds.
        this.rig.moveTo(this.aimPose(), dt, 4);
        return;
      }
      this.rig.moveTo(this.rig.chasePose(frame.pos, frame.vel), dt, 3);
      if (frame.done) this.finishFlight();
    } else if (this.lookUntil > this.now) {
      this.rig.moveTo(this.rig.lookPose(this.round.lie), dt, 2.2);
    } else {
      this.rig.moveTo(this.aimPose(), dt, 4);
    }
  }

  private animateThrower(dt: number): void {
    if (this.followClock >= 0) {
      this.followClock += dt / THROW_ANIM_SECONDS;
      this.character.showHandDisc(this.followClock < RELEASE_AT);
      this.character.pose(this.throwAnim, 0, this.followClock, this.now);
      if (this.followClock >= 1.6) this.followClock = -1;
      return;
    }
    const style: ThrowAnim = this.round.isPutt() ? 'putt' : this.settings.style;
    const pull = this.pullPower ?? this.keyboard.charge;
    this.character.pose(style, pull === null ? 0 : Math.min(1, pull / MAX_POWER + 0.15), null, this.now);
  }

  private aimPose() {
    return this.rig.aimPose(this.round.lie, this.aimHeading(), this.round.isPutt(), this.launchOffset());
  }

  private snapCamera(): void {
    this.rig.snap(this.aimPose());
  }
}

/** An arrow showing which way the wind blows relative to the throw line. */
function windArrow(relativeDeg: number): string {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const i = Math.round((((relativeDeg % 360) + 360) % 360) / 45) % 8;
  return arrows[i];
}
