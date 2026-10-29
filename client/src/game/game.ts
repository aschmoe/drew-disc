// One player playing one hole: aim, throw, watch the flight, walk to the lie, repeat.
// Multiplayer later wraps this same loop in a room (see docs/DESIGN.md section 9).

import * as THREE from 'three';
import { DEFAULT_BAG, getDisc } from '@shared/discs';
import type { CourseDef, Hole } from '../content/hole';
import { dirToHeading, headingToDir } from '../sim/frame';
import { simulateThrow, type FlightResult, type ThrowInput, type Wind } from '../sim/flight';
import { createRng } from '../sim/rng';
import { v3, type V3 } from '../sim/vec';
import { Hud, type ShotSettings } from '../ui/hud';
import { buildDiscMesh, buildThrower } from '../world/props';
import { followSun } from '../world/scene';
import { formatFeet, maxStrokes, scoreName } from './score';

type Phase = 'aim' | 'flight' | 'holed';

const CIRCLE_1 = 10; // meters, putting range
const PREVIEW_FRACTION = 0.4;

export class Game {
  private phase: Phase = 'aim';
  private strokes = 0;
  private lie: V3 = v3();
  private result: FlightResult | null = null;
  private clock = 0;
  private wind: Wind;
  private hud: Hud;

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
  ) {
    const rng = createRng((Date.now() & 0xffff) ^ 0x5eed);
    const w = course.environment.wind;
    this.wind = { speed: Number(rng.range(w.minSpeed, w.maxSpeed).toFixed(1)), towardDeg: Math.round(rng.range(0, 360)) };
    this.sunOffset = sun.position.clone().sub(sun.target.position);

    this.hud = new Hud(uiRoot, DEFAULT_BAG, {
      onChange: () => this.refresh(),
      onThrow: () => this.throwDisc(),
      onRestart: () => this.restart(),
    });

    this.disc = buildDiscMesh(getDisc(this.hud.settings.discId));
    this.preview = makeLine(0xffffff, 0.75, true);
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
    this.phase = 'aim';
    this.result = null;
    this.markers.clear();
    this.trail.visible = false;
    this.hud.set({ aimOffsetDeg: 0, hyzerDeg: 0 });
    this.hud.setThrowEnabled(true);
    this.snapCamera();
    this.refresh();
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

  private shotInput(s: ShotSettings, seed: number): ThrowInput {
    const putt = this.isPutt();
    const aimDeg = this.basketHeading() + s.aimOffsetDeg;
    const fwd = headingToDir(aimDeg);
    const release = putt ? 1.0 : 1.1;
    return {
      discId: s.discId,
      style: s.style,
      hand: 'right',
      mode: putt ? 'putt' : 'throw',
      power: s.power,
      aimDeg,
      hyzerDeg: putt ? 0 : s.hyzerDeg,
      from: v3(this.lie.x + fwd.x * 0.4, this.lie.y + release, this.lie.z + fwd.z * 0.4),
      seed,
    };
  }

  /** Re-run the preview and refresh the HUD after any change. */
  private refresh(): void {
    const s = this.hud.settings;
    if (this.discId !== s.discId) {
      this.discId = s.discId;
      (this.disc.material as THREE.MeshLambertMaterial).color.set(getDisc(s.discId).color);
    }
    const dist = this.basketDistance();
    this.hud.setHeader(
      `<b>${this.hole.def.name}</b> · Par ${this.hole.def.par} · ${this.hole.def.lengthFt} ft` +
        `<span class="sep"></span>Throw <b>${this.strokes + 1}</b>` +
        `<span class="sep"></span><b>${formatFeet(dist)}</b> to pin` +
        `<span class="sep"></span>Wind ${this.wind.speed} m/s ${windArrow(this.wind.towardDeg - this.basketHeading())}`,
    );
    this.hud.setMode(this.isPutt() ? 'Putting (Circle 1)' : `${getDisc(s.discId).name} · ${s.style}`);

    // Thrower faces the aim line.
    const aimDeg = this.basketHeading() + s.aimOffsetDeg;
    this.thrower.position.set(this.lie.x, this.lie.y, this.lie.z);
    this.thrower.rotation.y = -THREE.MathUtils.degToRad(aimDeg);

    if (this.phase !== 'aim') return;
    // Preview: a clean version of this throw (no muscle randomness), first part only.
    const input = this.shotInput({ ...s, power: Math.min(s.power, 1) }, 1);
    const r = simulateThrow(input, this.hole.world, this.wind);
    const n = s.fullPreview ? r.path.length : Math.max(2, Math.floor(r.path.length * PREVIEW_FRACTION));
    setLine(this.preview, r.path.slice(0, n).map((p) => p.p));
    this.preview.visible = true;
    this.placeDiscInHand(input);
  }

  private placeDiscInHand(input: ThrowInput): void {
    this.disc.position.set(input.from.x, input.from.y, input.from.z);
    this.disc.quaternion.identity();
    this.disc.scale.setScalar(1);
  }

  // --- Throwing --------------------------------------------------------------

  private throwDisc(): void {
    if (this.phase !== 'aim') return;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const input = this.shotInput(this.hud.settings, seed);
    this.result = simulateThrow(input, this.hole.world, this.wind);
    this.strokes++;
    this.phase = 'flight';
    this.clock = 0;
    this.lastTrailIndex = -1;
    this.preview.visible = false;
    this.trail.visible = true;
    this.hud.setThrowEnabled(false);
  }

  private finishFlight(): void {
    const r = this.result!;
    const marker = buildDiscMesh(getDisc(this.hud.settings.discId));
    marker.scale.setScalar(0.6);
    marker.position.set(this.lie.x, this.lie.y + 0.02, this.lie.z);
    this.markers.add(marker);

    if (r.inBasket) {
      this.phase = 'holed';
      this.hud.showToast(`${scoreName(this.strokes, this.hole.def.par)}  ${this.strokes} on a par ${this.hole.def.par}`, 6000);
      this.hud.setThrowEnabled(false);
      this.refresh();
      return;
    }
    if (r.ob) {
      this.strokes++;
      this.lie = v3(r.lastInBounds.x, r.lastInBounds.y, r.lastInBounds.z);
      this.hud.showToast('Out of bounds: +1, play from where it went out');
    } else {
      this.lie = v3(r.rest.x, r.rest.y - 0.01, r.rest.z);
      const hit = r.events.find((e) => e.kind === 'spit-out' || e.kind === 'blow-through' || e.kind === 'band' || e.kind === 'cage');
      if (hit) this.hud.showToast(hit.kind === 'spit-out' ? 'Spit out!' : hit.kind === 'blow-through' ? 'Blew through the chains' : 'Off the cage');
      else if (r.restSurface === 'bramble') this.hud.showToast('In the blackberries...');
    }
    if (this.strokes >= maxStrokes(this.hole.def.par)) {
      this.phase = 'holed';
      this.hud.showToast(`Picked up at ${this.strokes}`, 6000);
      return;
    }
    this.phase = 'aim';
    this.hud.set({ aimOffsetDeg: 0, hyzerDeg: 0, discId: this.isPutt() ? 'chain-seeker' : this.hud.settings.discId });
    this.hud.setThrowEnabled(true);
    this.refresh();
  }

  // --- Frame update -----------------------------------------------------------

  update(dt: number): void {
    if (this.phase === 'flight' && this.result) {
      this.clock += dt;
      const r = this.result;
      const path = r.path;
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
    } else {
      const { pos, look } = this.aimCamera();
      this.moveCamera(pos, look, dt, 4);
    }
    followSun(this.sun, this.camLook, this.sunOffset);
  }

  private aimCamera(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const aimDeg = this.basketHeading() + this.hud.settings.aimOffsetDeg;
    const fwd = headingToDir(aimDeg);
    const lie = new THREE.Vector3(this.lie.x, this.lie.y, this.lie.z);
    const putt = this.isPutt();
    const up = putt ? 1.8 : 2.6;
    // Back the camera off behind the thrower, but not into a tree.
    let back = putt ? 3 : 5.5;
    let pos = lie.clone().add(new THREE.Vector3(-fwd.x * back, up, -fwd.z * back));
    while (back > 1.2 && this.insideTree(pos)) {
      back -= 0.5;
      pos = lie.clone().add(new THREE.Vector3(-fwd.x * back, up * 0.85, -fwd.z * back));
    }
    const ahead = putt ? this.basketDistance() : 35;
    const look = lie.clone().add(new THREE.Vector3(fwd.x * ahead, putt ? 1 : 2, fwd.z * ahead));
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
      const s = this.hud.settings;
      const bag = DEFAULT_BAG;
      if (e.key === 'ArrowLeft') this.hud.update({ aimOffsetDeg: Math.max(-40, s.aimOffsetDeg - 0.5) });
      else if (e.key === 'ArrowRight') this.hud.update({ aimOffsetDeg: Math.min(40, s.aimOffsetDeg + 0.5) });
      else if (e.key === 'ArrowUp' || e.key === 'w') this.hud.update({ hyzerDeg: Math.max(-35, s.hyzerDeg - 1) });
      else if (e.key === 'ArrowDown' || e.key === 's') this.hud.update({ hyzerDeg: Math.min(35, s.hyzerDeg + 1) });
      else if (e.key === 'f') this.hud.update({ style: s.style === 'backhand' ? 'forehand' : 'backhand' });
      else if (e.key >= '1' && e.key <= String(bag.length)) this.hud.update({ discId: bag[Number(e.key) - 1] });
      else if (e.key === ' ') {
        e.preventDefault();
        this.throwDisc();
      } else if (e.key === 'r') this.restart();
      else return;
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
