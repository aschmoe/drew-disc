// One player playing one hole: aim, throw, watch the flight, walk to the lie, repeat.
// Multiplayer later wraps this same loop in a room (see docs/DESIGN.md section 9).

import * as THREE from 'three';
import { DEFAULT_BAG, getDisc } from '@shared/discs';
import type { CourseDef, Hole } from '../content/hole';
import { dirToHeading, headingToDir } from '../sim/frame';
import { simulateThrow, type FlightResult, type ThrowInput, type Wind } from '../sim/flight';
import { createRng } from '../sim/rng';
import { v3, type V3 } from '../sim/vec';
import { Controls, type ThrowGesture } from '../ui/controls';
import { DebugPanel } from '../ui/debugPanel';
import { Overlay, type ThrowRecord } from '../ui/overlay';
import { buildDiscMesh, buildThrower, poseThrower } from '../world/props';
import { followSun } from '../world/scene';
import { formatFeet, maxStrokes, scoreName } from './score';
import { AIM_LIMIT, HYZER_LIMIT, MAX_POWER, type ShotSettings } from './settings';

type Phase = 'aim' | 'flight' | 'holed';

const CIRCLE_1 = 10; // meters, putting range
const PREVIEW_FRACTION = 0.4;
const LOOK_SECONDS = 3.5;
const KEY_CHARGE_PER_SECOND = 0.75;

export class Game {
  private phase: Phase = 'aim';
  private strokes = 0;
  private lie: V3 = v3();
  private result: FlightResult | null = null;
  private resultDisc = '';
  private clock = 0;
  private wind: Wind;
  private settings: ShotSettings = {
    discId: DEFAULT_BAG[1],
    style: 'backhand',
    power: 0.9,
    aimOffsetDeg: 0,
    hyzerDeg: 0,
    fullPreview: false,
  };
  private pullPower: number | null = null;
  private keyCharge: number | null = null;
  private previewDirty = true;
  private puttTarget: number | null = null;
  private followClock = -1;
  private lookUntil = 0;
  private now = 0;
  private throws: ThrowRecord[] = [];
  private hasThrown = false;

  private overlay: Overlay;
  private controls: Controls;
  private debug: DebugPanel | null = null;
  private thrower = buildThrower();
  private disc: THREE.Mesh;
  private discId = '';
  private preview: THREE.Line;
  private trail: THREE.Line;
  private markers = new THREE.Group();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private sunOffset: THREE.Vector3;
  private lastTrailIndex = -1;

  constructor(
    private hole: Hole,
    course: CourseDef,
    scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sun: THREE.DirectionalLight,
    uiRoot: HTMLElement,
    canvas: HTMLElement,
  ) {
    const rng = createRng((Date.now() & 0xffff) ^ 0x5eed);
    const w = course.environment.wind;
    this.wind = { speed: Number(rng.range(w.minSpeed, w.maxSpeed).toFixed(1)), towardDeg: Math.round(rng.range(0, 360)) };
    this.sunOffset = sun.position.clone().sub(sun.target.position);

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
      aimBy: (d) => this.update({ aimOffsetDeg: this.settings.aimOffsetDeg + d }),
    }, canvas);
    if (new URLSearchParams(location.search).has('debug')) {
      this.debug = new DebugPanel(uiRoot, {
        settings: () => this.settings,
        update: (p) => this.update(p),
        throwClean: (power) => this.throwDisc({ power, flickDeg: 0, spin: 1 }),
        restart: () => this.restart(),
        jumpTo: (m) => this.jumpTo(m),
      });
    }

    this.disc = buildDiscMesh(getDisc(this.settings.discId));
    this.preview = makeLine(0xffffff, 0.8, true);
    this.trail = makeLine(0xffffff, 0.45, false);
    scene.add(this.thrower, this.disc, this.preview, this.trail, this.markers);
    this.bindKeys();
    this.restart();
  }

  private restart(): void {
    const tee = this.hole.def.tees[0];
    const g = this.hole.world.groundHeight(tee.pos[0], -tee.pos[1]);
    this.lie = v3(tee.pos[0], g, -tee.pos[1]);
    this.strokes = 0;
    this.throws = [];
    this.phase = 'aim';
    this.result = null;
    this.markers.clear();
    this.trail.visible = false;
    this.overlay.hideScorecard();
    this.settings = { ...this.settings, aimOffsetDeg: 0, hyzerDeg: 0, power: 0.9, discId: DEFAULT_BAG[1] };
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
    this.lie = v3(x, this.hole.world.groundHeight(x, z), z);
    this.overlay.hideScorecard();
    this.enterAim();
    this.snapCamera();
  }

  /** Apply a settings change from any control. */
  private update(patch: Partial<ShotSettings>): void {
    Object.assign(this.settings, patch);
    const s = this.settings;
    s.aimOffsetDeg = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, s.aimOffsetDeg));
    s.hyzerDeg = Math.max(-HYZER_LIMIT, Math.min(HYZER_LIMIT, s.hyzerDeg));
    s.power = Math.max(0, Math.min(MAX_POWER, s.power));
    this.controls.render();
    this.debug?.render();
    this.previewDirty = true;
    this.refreshHeader();
  }

  // --- Shot setup -----------------------------------------------------------

  private basketDistance(): number {
    const b = this.hole.world.basket;
    return Math.hypot(b.x - this.lie.x, b.z - this.lie.z);
  }

  private basketHeading(): number {
    const b = this.hole.world.basket;
    return dirToHeading(v3(b.x - this.lie.x, 0, b.z - this.lie.z));
  }

  private isPutt(): boolean {
    return this.basketDistance() <= CIRCLE_1;
  }

  private shotInput(s: ShotSettings, power: number, seed: number, flickDeg = 0, spin = 1): ThrowInput {
    const putt = this.isPutt();
    const aimDeg = this.basketHeading() + s.aimOffsetDeg;
    const fwd = headingToDir(aimDeg);
    const release = putt ? 1.0 : 1.1;
    return {
      discId: s.discId,
      style: s.style,
      hand: 'right',
      mode: putt ? 'putt' : 'throw',
      power,
      aimDeg,
      hyzerDeg: putt ? 0 : s.hyzerDeg,
      flickDeg,
      spin,
      from: v3(this.lie.x + fwd.x * 0.4, this.lie.y + release, this.lie.z + fwd.z * 0.4),
      seed,
    };
  }

  /** Set up for the next throw from the current lie. */
  private enterAim(): void {
    this.phase = 'aim';
    const putt = this.isPutt();
    if (putt) {
      this.settings.discId = 'chain-seeker';
      this.puttTarget = this.autoPuttPower('chain-seeker');
      this.settings.power = this.puttTarget;
    } else {
      this.puttTarget = null;
    }
    this.settings.aimOffsetDeg = 0;
    this.settings.hyzerDeg = 0;
    this.controls.setPutting(putt, this.puttTarget);
    this.controls.setEnabled(true);
    this.controls.showPower(null);
    this.overlay.setHint(this.hasThrown ? null : 'Drag the scene to aim. Pull the disc down, then flick up to throw.');
    this.update({});
  }

  private refreshHeader(): void {
    const dist = this.basketDistance();
    this.overlay.setHeader(
      `<b>${this.hole.def.name}</b> · Par ${this.hole.def.par}` +
        `<span class="sep"></span>Throw <b>${this.strokes + 1}</b>` +
        `<span class="sep"></span><b>${formatFeet(dist)}</b>` +
        `<span class="sep"></span>Wind ${this.wind.speed} m/s ${windArrow(this.wind.towardDeg - this.basketHeading() - this.settings.aimOffsetDeg)}`,
    );
  }

  private refreshPreview(): void {
    const s = this.settings;
    if (this.discId !== s.discId) {
      this.discId = s.discId;
      (this.disc.material as THREE.MeshLambertMaterial).color.set(getDisc(s.discId).color);
    }
    const aimDeg = this.basketHeading() + s.aimOffsetDeg;
    this.thrower.position.set(this.lie.x, this.lie.y, this.lie.z);
    this.thrower.rotation.y = -THREE.MathUtils.degToRad(aimDeg);
    if (this.phase !== 'aim') return;

    // Preview a clean version of the throw at the power being pulled (or the last power).
    const power = Math.min(1, this.pullPower ?? this.keyCharge ?? s.power);
    const input = this.shotInput(s, power, 1);
    const r = simulateThrow(input, this.hole.world, this.wind);
    const n = s.fullPreview ? r.path.length : Math.max(2, Math.floor(r.path.length * PREVIEW_FRACTION));
    setLine(this.preview, r.path.slice(0, n).map((p) => p.p));
    this.preview.visible = true;
    this.disc.position.set(input.from.x, input.from.y, input.from.z);
    this.disc.quaternion.identity();
    this.disc.scale.setScalar(1);
  }

  /**
   * A power for a putt that arrives at the middle of the chains. Shown as the tick on the power
   * ring while putting, so a putt doesn't inherit the drive's power.
   */
  private autoPuttPower(discId: string): number {
    const b = this.hole.world.basket;
    const target = b.base + 1.05;
    const dist = this.basketDistance();
    const heightAtBasket = (power: number) => {
      const input = this.shotInput({ ...this.settings, discId, aimOffsetDeg: 0 }, power, 1);
      const r = simulateThrow(input, { ...this.hole.world, basket: { ...b, z: b.z + 1e4 } }, this.wind);
      for (const sample of r.path) {
        if (Math.hypot(sample.p[0] - input.from.x, sample.p[2] - input.from.z) >= dist - 0.2) return sample.p[1];
      }
      return -Infinity; // fell short
    };
    let lo = 0.05;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (heightAtBasket(mid) < target) lo = mid;
      else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 100) / 100;
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
    this.strokes++;
    this.hasThrown = true;
    this.phase = 'flight';
    this.clock = 0;
    this.followClock = 0;
    this.lookUntil = 0;
    this.lastTrailIndex = -1;
    this.preview.visible = false;
    this.trail.visible = true;
    this.overlay.setHint(null);
    this.controls.setEnabled(false);
    if (g.power > 1) this.overlay.showToast('Muscled it!', 1200);
  }

  private finishFlight(): void {
    const r = this.result!;
    const disc = getDisc(this.resultDisc);
    const marker = buildDiscMesh(disc);
    marker.scale.setScalar(0.6);
    marker.position.set(this.lie.x, this.lie.y + 0.02, this.lie.z);
    this.markers.add(marker);
    const traveled = Math.hypot(r.rest.x - this.lie.x, r.rest.z - this.lie.z);
    const record: ThrowRecord = { disc: disc.name, color: disc.color, distance: traveled, outcome: '' };
    this.throws.push(record);

    if (r.inBasket) {
      record.outcome = this.strokes === 1 ? 'Ace!' : 'In';
      this.phase = 'holed';
      this.controls.setEnabled(false);
      window.setTimeout(() => this.showCard(), 900);
      return;
    }
    if (r.ob) {
      this.strokes++;
      record.outcome = 'OB +1';
      this.lie = v3(r.lastInBounds.x, r.lastInBounds.y, r.lastInBounds.z);
      this.overlay.showToast('Out of bounds: +1, play from where it went out');
    } else {
      this.lie = v3(r.rest.x, r.rest.y - 0.012, r.rest.z);
      const hit = r.events.find((e) => e.kind === 'spit-out' || e.kind === 'blow-through' || e.kind === 'band' || e.kind === 'cage');
      const trees = r.events.filter((e) => e.kind === 'branch' || e.kind === 'trunk').length;
      record.outcome = hit ? 'Chains' : r.restSurface === 'bramble' ? 'Brambles' : trees ? 'Trees' : '';
      if (hit) this.overlay.showToast(hit.kind === 'spit-out' ? 'Spit out!' : hit.kind === 'blow-through' ? 'Blew through the chains' : 'Off the cage');
      else if (r.restSurface === 'bramble') this.overlay.showToast('In the blackberries...');
      else if (this.basketDistance() <= CIRCLE_1) this.overlay.showToast(`Circle 1, ${formatFeet(this.basketDistance())}`);
    }
    if (this.strokes >= maxStrokes(this.hole.def.par)) {
      this.phase = 'holed';
      this.overlay.showToast(`Picked up at ${this.strokes}`, 2000);
      window.setTimeout(() => this.showCard(), 900);
      return;
    }
    this.enterAim();
  }

  private showCard(): void {
    const holed = this.result?.inBasket;
    this.overlay.showScorecard(
      {
        title: holed ? scoreName(this.strokes, this.hole.def.par) : 'Picked up',
        strokes: this.strokes,
        par: this.hole.def.par,
        holeName: `SeaTac ${this.hole.def.name}`,
        throws: this.throws,
      },
      () => this.restart(),
    );
  }

  // --- Frame update -----------------------------------------------------------

  /** Advance one rendered frame. */
  tick(dt: number): void {
    this.now += dt;
    if (this.keyCharge !== null) {
      this.keyCharge = Math.min(MAX_POWER, this.keyCharge + KEY_CHARGE_PER_SECOND * dt);
      this.controls.showPower(this.keyCharge);
      this.previewDirty = true;
    }
    if (this.previewDirty) {
      this.previewDirty = false;
      this.refreshPreview();
    }
    this.animateThrower(dt);

    if (this.phase === 'flight' && this.result) {
      this.clock += dt;
      const path = this.result.path;
      const end = path[path.length - 1].t;
      const t = Math.min(this.clock, end);
      let i = path.findIndex((p) => p.t >= t);
      if (i < 1) i = 1;
      const a = path[i - 1];
      const b = path[i];
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      const pos = new THREE.Vector3().fromArray(a.p).lerp(new THREE.Vector3().fromArray(b.p), f);
      const normal = new THREE.Vector3().fromArray(a.n).lerp(new THREE.Vector3().fromArray(b.n), f).normalize();
      this.disc.position.copy(pos);
      this.disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      // Bigger in flight so it reads at a distance.
      this.disc.scale.setScalar(1 + Math.min(1.5, this.camera.position.distanceTo(pos) / 25));

      if (i !== this.lastTrailIndex) {
        setLine(this.trail, path.slice(0, i + 1).map((p) => p.p));
        this.lastTrailIndex = i;
      }

      // Chase camera.
      const vel = new THREE.Vector3().fromArray(b.p).sub(new THREE.Vector3().fromArray(a.p));
      vel.y = 0;
      if (vel.lengthSq() < 1e-6) vel.copy(this.camLook).sub(this.camPos).setY(0);
      vel.normalize();
      const want = pos.clone().addScaledVector(vel, -8).add(new THREE.Vector3(0, 3, 0));
      this.moveCamera(want, pos, dt, 3);

      if (this.clock > end + 1.2) this.finishFlight();
    } else if (this.lookUntil > this.now) {
      const { pos, look } = this.lookCamera();
      this.moveCamera(pos, look, dt, 2.2);
    } else {
      const { pos, look } = this.aimCamera();
      this.moveCamera(pos, look, dt, 4);
    }
    followSun(this.sun, this.camLook, this.sunOffset);
  }

  private animateThrower(dt: number): void {
    const style = this.settings.style;
    if (this.followClock >= 0) {
      this.followClock += dt / 0.45;
      poseThrower(this.thrower, 0, this.followClock, style);
      if (this.followClock >= 1) {
        this.followClock = -1;
        poseThrower(this.thrower, 0, 0, style);
      }
      return;
    }
    const pull = this.pullPower ?? this.keyCharge;
    poseThrower(this.thrower, pull === null ? 0 : Math.min(1, pull / MAX_POWER + 0.15), 0, style);
  }

  private aimCamera(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const aimDeg = this.basketHeading() + this.settings.aimOffsetDeg;
    const fwd = headingToDir(aimDeg);
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const lie = new THREE.Vector3(this.lie.x, this.lie.y, this.lie.z);
    const putt = this.isPutt();
    // Over the thrower's right shoulder, so they stand to one side of the view instead of in
    // front of the basket. Further to the side when putting, where the basket is close.
    const up = putt ? 1.55 : 2.6;
    const side = putt ? 1.15 : 0.9;
    let back = putt ? 2.6 : 5.5;
    const at = (b: number, u: number) => lie.clone().addScaledVector(right, side).add(new THREE.Vector3(-fwd.x * b, u, -fwd.z * b));
    // Back the camera off behind the thrower, but not into a tree.
    let pos = at(back, up);
    while (back > 1.2 && this.insideTree(pos)) {
      back -= 0.5;
      pos = at(back, up * 0.85);
    }
    if (putt) {
      const b = this.hole.world.basket;
      // Look at the chains, nudged toward the aim line so aiming still moves the view.
      const look = new THREE.Vector3(b.x, b.base + 0.55, b.z).lerp(lie.clone().add(new THREE.Vector3(fwd.x * this.basketDistance(), 0.55, fwd.z * this.basketDistance())), 0.5);
      return { pos, look };
    }
    const look = lie.clone().add(new THREE.Vector3(fwd.x * 35, 2, fwd.z * 35));
    return { pos, look };
  }

  /** From behind the basket, looking back down the fairway at the lie. */
  private lookCamera(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const b = this.hole.world.basket;
    const toBasket = new THREE.Vector3(b.x - this.lie.x, 0, b.z - this.lie.z).normalize();
    const pos = new THREE.Vector3(b.x, b.base + 3.2, b.z).addScaledVector(toBasket, 7);
    const look = new THREE.Vector3(this.lie.x, this.lie.y + 1, this.lie.z).lerp(new THREE.Vector3(b.x, b.base, b.z), 0.55);
    return { pos, look };
  }

  private insideTree(p: THREE.Vector3): boolean {
    for (const t of this.hole.world.treesNear(p.x, p.z)) {
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d < t.trunkRadius + 0.4 && p.y - t.base < t.trunkHeight) return true;
      const cy = p.y - t.base - t.canopyY;
      if ((d * d) / (t.canopyRx * t.canopyRx) + (cy * cy) / (t.canopyRy * t.canopyRy) < 1.15) return true;
    }
    return false;
  }

  private snapCamera(): void {
    const { pos, look } = this.aimCamera();
    this.camPos.copy(pos);
    this.camLook.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  private moveCamera(pos: THREE.Vector3, look: THREE.Vector3, dt: number, k: number): void {
    const a = 1 - Math.exp(-dt * k);
    this.camPos.lerp(pos, a);
    this.camLook.lerp(look, Math.min(1, a * 2));
    const ground = this.hole.world.groundHeight(this.camPos.x, this.camPos.z);
    if (this.camPos.y < ground + 0.6) this.camPos.y = ground + 0.6;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const s = this.settings;
      const bag = DEFAULT_BAG;
      if (e.key === ' ') {
        e.preventDefault();
        // Hold space to charge, release to throw (a clean release; the flick is touch/mouse only).
        if (!e.repeat && this.phase === 'aim' && this.keyCharge === null) this.keyCharge = 0;
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'a') this.update({ aimOffsetDeg: s.aimOffsetDeg - 0.5 });
      else if (e.key === 'ArrowRight' || e.key === 'd') this.update({ aimOffsetDeg: s.aimOffsetDeg + 0.5 });
      else if (e.key === 'ArrowUp' || e.key === 'w') this.update({ hyzerDeg: s.hyzerDeg - 1 });
      else if (e.key === 'ArrowDown' || e.key === 's') this.update({ hyzerDeg: s.hyzerDeg + 1 });
      else if (e.key === 'f') this.update({ style: s.style === 'backhand' ? 'forehand' : 'backhand' });
      else if (e.key === 'l') this.look();
      else if (e.key >= '1' && e.key <= String(bag.length)) this.update({ discId: bag[Number(e.key) - 1] });
      else if (e.key === 'r') this.restart();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key !== ' ' || this.keyCharge === null) return;
      const power = this.keyCharge;
      this.keyCharge = null;
      this.controls.showPower(null);
      if (power > 0.05) this.throwDisc({ power, flickDeg: 0, spin: 0.95 });
    });
  }
}

function makeLine(color: number, opacity: number, dashed: boolean): THREE.Line {
  const geo = new THREE.BufferGeometry();
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.8, gapSize: 0.5 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

function setLine(line: THREE.Line, pts: [number, number, number][]): void {
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => arr.set(p, i * 3));
  line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  line.geometry.setDrawRange(0, pts.length);
  if (line.material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
}

/** An arrow showing which way the wind blows relative to the throw line. */
function windArrow(relativeDeg: number): string {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const i = Math.round((((relativeDeg % 360) + 360) % 360) / 45) % 8;
  return arrows[i];
}
