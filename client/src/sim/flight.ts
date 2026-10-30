// The disc flight model.
//
// Sim-lite: real lift and drag from the angle of attack (a simplified Hummel model), but the
// disc's roll (the thing turn and fade really describe) comes from a rate model driven by the
// flight numbers instead of a full gyroscopic precession model. That keeps it tunable while
// letting bank angle, wind, trees and arm speed interact the way a disc golfer expects:
//
// - Bank tilts the lift vector, so a hyzer curves toward the fade side and an anhyzer away.
// - Above its rated speed a disc rolls toward the turn side (turn number), below it it rolls back
//   toward the fade side (fade number). Underthrow a high-speed driver and it fades right away.
// - A headwind raises airspeed, so discs turn more; a tailwind does the opposite.
//
// Coordinates are the WORLD frame from frame.ts (y up, north is -z).

import { getDisc, type Disc } from '@shared/discs';
import { headingToDir } from './frame';
import { createRng, type Rng } from './rng';
import { add, cross, dot, len, normalize, scale, sub, UP, v3, type V3 } from './vec';
import { BASKET, type SimTree, type SimWorld, type Surface } from './world';

export type ThrowStyle = 'backhand' | 'forehand';
export type Hand = 'right' | 'left';

export interface ThrowInput {
  discId: string;
  /** Putting uses a soft arm-speed range (inside Circle 1). Defaults to 'throw'. */
  mode?: 'throw' | 'putt';
  style: ThrowStyle;
  hand: Hand;
  /** 0 to 1 is a clean throw at increasing arm speed. Above 1 is "muscling it": a bit more speed,
   *  plus random off-axis torque. */
  power: number;
  /** Where the thrower aims, compass degrees (0 = north). */
  aimDeg: number;
  /** Release angle. Positive = hyzer (outside edge down), negative = anhyzer. */
  hyzerDeg: number;
  /** Launch angle of the flight path above horizontal. */
  launchDeg?: number;
  /** Disc pitch relative to the launch angle. Slightly nose down is good form. */
  noseDeg?: number;
  /** Pull or push from the flick, degrees. Positive pushes the throw right. */
  flickDeg?: number;
  /** Release cleanliness from 0 to 1 (spin). Low spin makes the disc less stable. */
  spin?: number;
  /** Release point in the world frame (the lie, plus release height). */
  from: V3;
  seed: number;
}

export interface Wind {
  /** Meters per second. */
  speed: number;
  /** Compass direction the wind blows TOWARD. */
  towardDeg: number;
}

export type FlightEventKind =
  | 'release'
  | 'branch'
  | 'trunk'
  | 'ground'
  | 'chains'
  | 'spit-out'
  | 'blow-through'
  | 'band'
  | 'cage'
  | 'in-basket'
  | 'rest';

export interface FlightEvent {
  t: number;
  kind: FlightEventKind;
  x: number;
  y: number;
  z: number;
}

/** One sample of the path, recorded at SAMPLE_HZ for rendering and network playback. */
export interface PathSample {
  t: number;
  /** Position. */
  p: [number, number, number];
  /** Disc normal (its "up" axis), for drawing its tilt. */
  n: [number, number, number];
}

export interface FlightResult {
  path: PathSample[];
  events: FlightEvent[];
  rest: V3;
  inBasket: boolean;
  /** Came to rest out of bounds. */
  ob: boolean;
  /** Last ground point the disc was over while in bounds (the OB lie). */
  lastInBounds: V3;
  restSurface: Surface;
  flightTime: number;
}

export const SIM_HZ = 240;
export const SAMPLE_HZ = 60;
const DT = 1 / SIM_HZ;
const MAX_TIME = 20;

// Air and disc constants.
const RHO = 1.225;
const G = 9.81;
const DISC_RADIUS = 0.105;
const AREA = Math.PI * DISC_RADIUS * DISC_RADIUS;

/** Tuning knobs, exported so the flight lab can show them. */
export const TUNING = {
  /** Arm speed (m/s) at power 0 and power 1. */
  armSpeedMin: 11,
  armSpeedMax: 32,
  /** Arm speed range for putts. */
  puttSpeedMin: 4,
  puttSpeedMax: 13,
  /** Rated airspeed for a disc: base + perSpeed * speed number. */
  ratedBase: 11.5,
  ratedPerSpeed: 1.4,
  /** Roll rates in rad/s per flight-number unit. */
  turnRate: 0.12,
  fadeRate: 0.4,
  /** Drag and lift from the flight numbers. */
  cd0Base: 0.12,
  cd0PerSpeed: 0.0075,
  cdAlpha: 1.1,
  alpha0: (-4 * Math.PI) / 180,
  cl0Base: 0.04,
  cl0PerGlide: 0.017,
  clAlpha: 1.25,
  clAlphaPerGlide: 0.06,
  /** Most a disc tilts from level in flight, radians. Roll eases off toward it, and the turning
   *  flight (which tips the disc's world-fixed attitude further over) can't carry it past. */
  maxTilt: (60 * Math.PI) / 180,
};

const SURFACE_FRICTION: Record<Surface, number> = {
  path: 0.45,
  tee: 0.45,
  green: 0.55,
  fairway: 0.6,
  rough: 1.3,
  bramble: 4.0,
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Aero {
  rated: number;
  cd0: number;
  cl0: number;
  clA: number;
  turn: number;
  fade: number;
}

function aeroFor(disc: Disc): Aero {
  const f = disc.flight;
  return {
    rated: TUNING.ratedBase + TUNING.ratedPerSpeed * f.speed,
    cd0: TUNING.cd0Base - TUNING.cd0PerSpeed * f.speed,
    cl0: TUNING.cl0Base + TUNING.cl0PerGlide * f.glide,
    clA: TUNING.clAlpha + TUNING.clAlphaPerGlide * f.glide,
    turn: f.turn,
    fade: f.fade,
  };
}

/**
 * Which way the disc fades: +1 when it fades LEFT (right-hand backhand, left-hand forehand),
 * -1 when it fades right.
 */
export function fadeSide(style: ThrowStyle, hand: Hand): 1 | -1 {
  return (style === 'backhand') === (hand === 'right') ? 1 : -1;
}

export function windVector(wind: Wind | undefined): V3 {
  if (!wind || wind.speed === 0) return v3();
  return scale(headingToDir(wind.towardDeg), wind.speed);
}

/** Rotate v about a unit axis by angle (right-hand rule). */
function rotateAbout(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Current bank relative to the flight direction: positive = left side down. */
function bankOf(normal: V3, heading: V3): number {
  const right = cross(heading, UP);
  return Math.asin(Math.max(-1, Math.min(1, -dot(normal, right))));
}

/** `normal`, tipped back toward level if it leans further than `max` from straight up. */
function limitTilt(normal: V3, max: number): V3 {
  if (normal.y >= Math.cos(max)) return normal;
  const flat = Math.hypot(normal.x, normal.z);
  if (flat < 1e-9) return normal;
  const k = Math.sin(max) / flat;
  return v3(normal.x * k, Math.cos(max), normal.z * k);
}

/** Disc normal from heading, pitch (nose up positive) and roll (left side down positive). */
function attitude(heading: V3, pitch: number, roll: number): V3 {
  const right = cross(heading, UP);
  const cp = Math.cos(pitch);
  return normalize(
    add(add(scale(UP, cp * Math.cos(roll)), scale(heading, -Math.sin(pitch))), scale(right, -Math.sin(roll) * cp)),
  );
}

export function simulateThrow(input: ThrowInput, world: SimWorld, wind?: Wind): FlightResult {
  const disc = getDisc(input.discId);
  const aero = aeroFor(disc);
  const rng = createRng(input.seed);
  const side = fadeSide(input.style, input.hand);
  const windV = windVector(wind);

  // Release.
  const clean = Math.min(Math.max(input.power, 0), 1);
  const excess = Math.max(0, input.power - 1);
  let spin = Math.min(Math.max(input.spin ?? 1, 0.2), 1);
  const putt = input.mode === 'putt';
  const lo = putt ? TUNING.puttSpeedMin : TUNING.armSpeedMin;
  const hi = putt ? TUNING.puttSpeedMax : TUNING.armSpeedMax;
  let speed = lo + (hi - lo) * clean;
  speed += excess * (hi - lo) * 0.6;
  speed *= 0.9 + 0.1 * spin;

  // Off-axis torque from muscling it: a random extra roll and nose angle, and less spin.
  let roll = (side * (input.hyzerDeg * Math.PI)) / 180;
  let pitchOffset = ((input.noseDeg ?? (putt ? 0 : -1.5)) * Math.PI) / 180;
  if (excess > 0) {
    roll += rng.gaussian() * excess * 2.2;
    pitchOffset += rng.gaussian() * excess * 0.5;
    spin = Math.max(0.3, spin - excess * 2);
  }

  const launch = ((input.launchDeg ?? (putt ? 12 : 9)) * Math.PI) / 180;
  const heading0 = headingToDir(input.aimDeg + (input.flickDeg ?? 0));
  let vel = add(scale(heading0, speed * Math.cos(launch)), scale(UP, speed * Math.sin(launch)));
  const pitch = launch + pitchOffset;
  let pos = { ...input.from };

  const path: PathSample[] = [];
  const events: FlightEvent[] = [];
  const event = (t: number, kind: FlightEventKind) => events.push({ t, kind, x: pos.x, y: pos.y, z: pos.z });
  event(0, 'release');

  let lastInBounds = { ...pos, y: world.groundHeight(pos.x, pos.z) };
  let grounded = false;
  let inBasket = false;
  let branchCooldown = 0;
  let basketCooldown = 0;
  let wasInChains = false;
  let heading = heading0;
  let normal = attitude(heading, pitch, roll);
  let t = 0;
  let step = 0;
  const sampleEvery = SIM_HZ / SAMPLE_HZ;
  const record = () => path.push({ t, p: [pos.x, pos.y, pos.z], n: [normal.x, normal.y, normal.z] });
  record();

  while (t < MAX_TIME) {
    t += DT;
    step++;
    branchCooldown -= DT;
    basketCooldown -= DT;

    if (!grounded) {
      // Heading follows the horizontal flight direction (a disc is symmetric, so yaw is free).
      const horiz = v3(vel.x, 0, vel.z);
      if (len(horiz) > 0.5) heading = normalize(horiz);

      const air = sub(vel, windV);
      const airSpeed = len(air);
      const airDir = scale(air, 1 / Math.max(airSpeed, 1e-6));

      // Roll: turn side above rated speed, fade side as it slows. Low spin exaggerates both.
      const s = airSpeed / aero.rated;
      const turnRate = TUNING.turnRate * -aero.turn * smoothstep(0.85, 1.15, s);
      const fadeRate = TUNING.fadeRate * (aero.fade + 0.4) * (1 - smoothstep(0.4, 0.9, s));
      const wobble = 1 / (0.4 + 0.6 * spin);
      // The disc's attitude stays fixed in space apart from this roll about the flight direction.
      // So as the flight curves, the launch's nose-up tilt turns into extra bank and the angle of
      // attack falls away: a fading disc loses lift and drops, instead of curling on.
      let dRoll = side * (fadeRate - turnRate) * wobble * DT;
      const bank = bankOf(normal, heading);
      const tilt = Math.acos(Math.max(-1, Math.min(1, normal.y)));
      if (Math.abs(bank + dRoll) > Math.abs(bank)) dRoll *= 1 - smoothstep(0.6 * TUNING.maxTilt, TUNING.maxTilt, tilt);
      normal = normalize(rotateAbout(normal, heading, -dRoll));
      normal = limitTilt(normal, TUNING.maxTilt);

      // Lift and drag.
      const alpha = Math.asin(Math.max(-1, Math.min(1, -dot(airDir, normal))));
      const q = 0.5 * RHO * airSpeed * airSpeed * AREA;
      const cl = aero.cl0 + aero.clA * alpha;
      const cd = aero.cd0 + TUNING.cdAlpha * (alpha - TUNING.alpha0) ** 2;
      const liftDir = normalize(sub(normal, scale(airDir, dot(normal, airDir))));
      const mass = (disc.mass ?? 172) / 1000;
      const accel = add(scale(add(scale(liftDir, q * cl), scale(airDir, -q * cd)), 1 / mass), v3(0, -G, 0));
      vel = add(vel, scale(accel, DT));
    } else {
      // Sliding on the ground: friction by surface, then stop.
      const mu = SURFACE_FRICTION[world.surfaceAt(pos.x, pos.z)];
      const h = Math.hypot(vel.x, vel.z);
      const decel = mu * G * DT;
      const k = h > decel ? (h - decel) / h : 0;
      vel = v3(vel.x * k, 0, vel.z * k);
      // Settle flat as it slides; a disc doesn't stay balanced on its edge.
      normal = normalize(add(normal, scale(UP, DT * 14)));
    }

    const prev = pos;
    pos = add(pos, scale(vel, DT));

    // Trees.
    for (const tree of world.treesNear(pos.x, pos.z)) {
      const hit = collideTree(tree, prev, pos, vel, branchCooldown <= 0, rng);
      if (hit) {
        pos = hit.pos;
        vel = hit.vel;
        if (hit.kind === 'branch') branchCooldown = 0.12;
        normal = normalize(rotateAbout(normal, heading, rng.range(-0.5, 0.5) * (hit.kind === 'branch' ? 1 : 0.6)));
        grounded = grounded && pos.y <= world.groundHeight(pos.x, pos.z) + 0.02;
        event(t, hit.kind);
      }
    }

    // Basket.
    if (!inBasket && basketCooldown <= 0) {
      const b = collideBasket(world, prev, pos, vel, wasInChains, rng);
      wasInChains = b.inChains;
      if (b.kind) {
        event(t, b.kind);
        if (b.kind === 'in-basket') {
          inBasket = true;
          pos = b.pos ?? pos;
          vel = v3();
          normal = normalize(v3(0.15, 1, 0.1));
        } else {
          pos = b.pos ?? pos;
          vel = b.vel ?? vel;
          basketCooldown = 0.25;
        }
      }
    }

    // Ground.
    const g = world.groundHeight(pos.x, pos.z);
    if (!inBasket && pos.y <= g + 0.012) {
      pos = v3(pos.x, g + 0.012, pos.z);
      if (!grounded) {
        grounded = true;
        event(t, 'ground');
        // Impact: hard landings lose more of their speed.
        const vy = vel.y;
        const steep = Math.min(1, Math.abs(vy) / Math.max(Math.hypot(vel.x, vel.z), 0.1));
        const keep = 0.75 - 0.5 * steep;
        vel = v3(vel.x * keep, 0, vel.z * keep);
      }
    }

    if (!world.isOB(pos.x, pos.z)) lastInBounds = v3(pos.x, world.groundHeight(pos.x, pos.z), pos.z);
    if (step % sampleEvery === 0) record();

    const restingOnGround = grounded && Math.hypot(vel.x, vel.z) < 0.05;
    if (inBasket || restingOnGround) break;
  }

  // Lying still: flat on the ground (or in the tray).
  if (!inBasket) normal = UP;
  record();
  event(t, inBasket ? 'in-basket' : 'rest');
  const ob = !inBasket && world.isOB(pos.x, pos.z);
  return {
    path,
    events,
    rest: pos,
    inBasket,
    ob,
    lastInBounds,
    restSurface: world.surfaceAt(pos.x, pos.z),
    flightTime: t,
  };
}

interface TreeHit {
  kind: 'branch' | 'trunk';
  pos: V3;
  vel: V3;
}

function collideTree(tree: SimTree, prev: V3, pos: V3, vel: V3, branchesLive: boolean, rng: Rng): TreeHit | null {
  const dx = pos.x - tree.x;
  const dz = pos.z - tree.z;
  const d = Math.hypot(dx, dz);
  const y = pos.y - tree.base;

  // Trunk: a solid cylinder.
  const trunkR = tree.trunkRadius + DISC_RADIUS * 0.6;
  if (d < trunkR && y < tree.trunkHeight && y > -0.5) {
    const n = d > 1e-6 ? v3(dx / d, 0, dz / d) : normalize(v3(prev.x - tree.x, 0, prev.z - tree.z));
    const vn = dot(vel, n);
    let out = vel;
    if (vn < 0) {
      const normalPart = scale(n, vn);
      const tangent = sub(vel, normalPart);
      out = add(scale(tangent, 0.6), scale(normalPart, -0.3));
    }
    return { kind: 'trunk', pos: add(v3(tree.x, pos.y, tree.z), scale(n, trunkR + 0.01)), vel: out };
  }

  // Canopy: soft. Each meter inside has a chance of catching a branch, more near the core.
  if (!branchesLive) return null;
  const cy = y - tree.canopyY;
  const e = (d * d) / (tree.canopyRx * tree.canopyRx) + (cy * cy) / (tree.canopyRy * tree.canopyRy);
  if (e >= 1) return null;
  const stepDist = len(sub(pos, prev));
  const p = tree.density * stepDist * (1.2 - e);
  if (rng.next() >= p) return null;
  const speed = len(vel);
  const kept = speed * rng.range(0.35, 0.75);
  const jolt = normalize(v3(rng.gaussian(), rng.gaussian() * 0.6 - 0.3, rng.gaussian()));
  const dir = normalize(add(normalize(vel), scale(jolt, rng.range(0.4, 1.1))));
  return { kind: 'branch', pos, vel: scale(dir, kept) };
}

/**
 * Chance the chains hold a disc that reaches them. A firm putt into the middle of the chains
 * almost always stays; drives and edge hits cut through or bounce out.
 */
export function catchChance(speed: number, offCenter: number, heightAboveBase: number): number {
  let p: number;
  if (speed <= 10) p = 0.97;
  else if (speed <= 22) p = 0.97 - ((speed - 10) / 12) * 0.67;
  else p = Math.max(0.08, 0.3 - ((speed - 22) / 8) * 0.22);
  if (offCenter > 0.2) p *= 0.75; // cutting the edge of the chains
  if (heightAboveBase > 1.18 || heightAboveBase < 0.86) p *= 0.85; // top or bottom of the chains
  return p;
}

interface BasketHit {
  kind: FlightEventKind | null;
  inChains: boolean;
  pos?: V3;
  vel?: V3;
}

function collideBasket(world: SimWorld, prev: V3, pos: V3, vel: V3, wasInChains: boolean, rng: Rng): BasketHit {
  const b = world.basket;
  const dx = pos.x - b.x;
  const dz = pos.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d > 1) return { kind: null, inChains: false };
  const y = pos.y - b.base;
  const prevY = prev.y - b.base;
  const outward = d > 1e-6 ? v3(dx / d, 0, dz / d) : v3(1, 0, 0);
  const speed = len(vel);

  // Chains: the disc's edge reaches the chains once its center is within chainRadius + a bit.
  const inChains = d < BASKET.chainRadius + 0.06 && y > BASKET.chainBottom && y < BASKET.chainTop;
  if (inChains && !wasInChains) {
    // How far off-center the disc's line is: distance from the pole to its horizontal path.
    const h = Math.hypot(vel.x, vel.z);
    const offset = h > 1e-6 ? Math.abs(dx * vel.z - dz * vel.x) / h : d;
    const pCatch = catchChance(speed, offset, y);
    if (rng.next() < pCatch) {
      return { kind: 'in-basket', inChains, pos: v3(b.x + dx * 0.5, b.base + BASKET.trayBottom + 0.05, b.z + dz * 0.5) };
    }
    if (speed > 15 && offset > 0.12) {
      return { kind: 'blow-through', inChains, vel: scale(vel, 0.45) };
    }
    const back = scale(normalize(v3(-vel.x, 0, -vel.z)), speed * rng.range(0.15, 0.35));
    return { kind: 'spit-out', inChains, vel: add(back, v3(rng.range(-1, 1), 0.5, rng.range(-1, 1))) };
  }

  // Dropping in from above the band.
  if (d < BASKET.trayRadius - 0.03 && prevY > BASKET.trayTop && y <= BASKET.trayTop && y > BASKET.trayBottom) {
    return { kind: 'in-basket', inChains, pos: v3(pos.x, b.base + BASKET.trayBottom + 0.05, pos.z) };
  }

  // Top band and tray rim: solid rings, bounce off.
  const ring = (lo: number, hi: number, r: number) => y > lo && y < hi && d < r + DISC_RADIUS * 0.5 && d > r - 0.12;
  if (ring(BASKET.chainTop, BASKET.bandTop, BASKET.bandRadius) || ring(BASKET.trayBottom, BASKET.trayTop, BASKET.trayRadius)) {
    const vn = dot(vel, outward);
    if (vn < 0) {
      const kind: FlightEventKind = y > BASKET.chainTop ? 'band' : 'cage';
      const reflected = sub(vel, scale(outward, 1.4 * vn));
      return { kind, inChains, vel: scale(reflected, 0.5) };
    }
  }
  return { kind: null, inChains };
}

/** Distance flown along the ground from the release point, in meters. */
export function carryDistance(input: ThrowInput, result: FlightResult): number {
  return Math.hypot(result.rest.x - input.from.x, result.rest.z - input.from.z);
}

export const M_TO_FT = 3.28084;
