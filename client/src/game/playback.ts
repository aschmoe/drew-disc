// Plays a simulated flight back on screen: moves and spins the disc along the path, draws the
// trail, and hands each flight event (landing, chains...) to the game as playback reaches it.

import * as THREE from 'three';
import { fadeSide, type FlightEvent, type FlightResult, type ThrowStyle } from '../sim/flight';
import type { V3 } from '../sim/vec';
import { RELEASE_AT } from '../world/character';
import { buildDiscMesh, paintDisc } from '../world/props';
import type { Disc } from '@shared/discs';

/** Seconds from the start of the throw animation to the top of the follow-through. */
export const THROW_ANIM_SECONDS = 0.5;
/** Seconds the disc sits at rest before the turn moves on. */
const REST_SECONDS = 1.2;
/** Trail length in path samples (1.2 seconds at 60 Hz). */
const TRAIL_SAMPLES = 72;

/** Where the disc is this frame, for the camera. */
export interface PlaybackFrame {
  pos: THREE.Vector3;
  /** Movement over the current path segment. */
  vel: THREE.Vector3;
  /** Has been at rest long enough for the turn to move on. */
  done: boolean;
}

export class FlightPlayback {
  readonly disc: THREE.Mesh;
  readonly trail = makeLine(0xffffff, 0.45, false);
  private result: FlightResult | null = null;
  private style: ThrowStyle = 'backhand';
  private clock = 0;
  private nextEvent = 0;
  private lastTrailIndex = -1;
  private spinAngle = 0;

  constructor(disc: Disc) {
    this.disc = buildDiscMesh(disc);
  }

  paint(color: string): void {
    paintDisc(this.disc, color);
  }

  /** The disc is in the thrower's hand: hidden, parked at the release point. */
  hold(at: V3): void {
    this.disc.visible = false;
    this.disc.position.set(at.x, at.y, at.z);
    this.disc.quaternion.identity();
    this.disc.scale.setScalar(1);
  }

  /** Start playing a flight. The disc leaves when the swing reaches the release point. */
  start(result: FlightResult, style: ThrowStyle): void {
    this.result = result;
    this.style = style;
    this.clock = -RELEASE_AT * THROW_ANIM_SECONDS;
    this.nextEvent = 0;
    this.lastTrailIndex = -1;
    this.trail.visible = true;
  }

  hideTrail(): void {
    this.trail.visible = false;
  }

  /**
   * Advance playback. Returns null while the swing is still before the release (the disc is in
   * the hand). `onEvent` gets each flight event reached this frame, with the disc's speed then.
   */
  advance(dt: number, cameraPos: THREE.Vector3, onEvent: (e: FlightEvent, speed: number, disc: THREE.Vector3) => void): PlaybackFrame | null {
    const r = this.result;
    if (!r) return null;
    this.clock += dt;
    if (this.clock < 0) return null;

    this.disc.visible = true;
    const path = r.path;
    const end = path[path.length - 1].t;
    const t = Math.min(this.clock, end);
    let i = path.findIndex((p) => p.t >= t);
    if (i < 1) i = 1;
    const a = path[i - 1];
    const b = path[i];
    const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
    const pa = new THREE.Vector3().fromArray(a.p);
    const pb = new THREE.Vector3().fromArray(b.p);
    const pos = pa.clone().lerp(pb, f);
    const normal = new THREE.Vector3().fromArray(a.n).lerp(new THREE.Vector3().fromArray(b.n), f).normalize();
    this.disc.position.copy(pos);
    // Spin about the disc's own axis (clockwise from above for a right-hand backhand), slowing
    // as it slows, so the stamp turns.
    const speed = pb.distanceTo(pa) / Math.max(1e-3, b.t - a.t);
    if (this.clock <= end) this.spinAngle -= fadeSide(this.style, 'right') * dt * Math.min(16, 4 + speed * 0.6);
    this.disc.quaternion
      .setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.spinAngle));
    while (this.nextEvent < r.events.length && r.events[this.nextEvent].t <= t) {
      const e = r.events[this.nextEvent++];
      onEvent(e, this.speedAt(e.t), pos);
    }
    // Bigger in flight so it reads at a distance.
    this.disc.scale.setScalar(1 + Math.min(1.5, cameraPos.distanceTo(pos) / 25));

    if (i !== this.lastTrailIndex) {
      setLine(this.trail, path.slice(Math.max(0, i - TRAIL_SAMPLES), i + 1).map((p) => p.p));
      this.lastTrailIndex = i;
    }
    return { pos, vel: pb.sub(pa), done: this.clock > end + REST_SECONDS };
  }

  private speedAt(t: number): number {
    const path = this.result!.path;
    const i = Math.max(1, path.findIndex((p) => p.t >= t));
    const a = path[i - 1];
    const b = path[Math.min(i, path.length - 1)];
    const dt = b.t - a.t;
    return dt > 0 ? new THREE.Vector3().fromArray(b.p).distanceTo(new THREE.Vector3().fromArray(a.p)) / dt : 0;
  }
}

export function makeLine(color: number, opacity: number, dashed: boolean): THREE.Line {
  const geo = new THREE.BufferGeometry();
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.8, gapSize: 0.5 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

export function setLine(line: THREE.Line, pts: [number, number, number][]): void {
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => arr.set(p, i * 3));
  line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  line.geometry.setDrawRange(0, pts.length);
  if (line.material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
}
