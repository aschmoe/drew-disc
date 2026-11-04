// Where a throw starts and how hard a putt needs to be: pure, so tests check the same numbers
// the game plays.

import { DEFAULT_LAUNCH_DEG, simulateThrow, type ThrowInput, type Wind } from '../sim/flight';
import { headingToDir } from '../sim/frame';
import { v3, type V3 } from '../sim/vec';
import type { SimBasket, SimWorld } from '../sim/world';

/**
 * The world point a throw leaves from: `hand` is the release point in the thrower's frame
 * (x right, y up, -z toward the target, as `releasePoint` gives it), turned to face `headingDeg`
 * from the lie.
 */
export function releaseFrom(lie: V3, headingDeg: number, hand: V3): V3 {
  const fwd = headingToDir(headingDeg);
  return v3(lie.x - fwd.z * hand.x - fwd.x * hand.z, lie.y + hand.y, lie.z + fwd.x * hand.x - fwd.z * hand.z);
}

/**
 * A power for a putt that arrives at the middle of the chains. `input` builds the putt at a given
 * power; the search flies it with the basket moved out of the way and reads the height as it
 * passes the pole's distance.
 */
export function autoPuttPower(input: (power: number) => ThrowInput, world: SimWorld, wind?: Wind): number {
  const b = world.basket;
  const target = b.base + CHAIN_MIDDLE;
  const clear = { ...world, basket: { ...b, z: b.z + 1e4 } };
  const heightAtBasket = (power: number) => {
    const shot = input(power);
    const dist = Math.hypot(b.x - shot.from.x, b.z - shot.from.z);
    const r = simulateThrow(shot, clear, wind);
    for (const sample of r.path) {
      if (Math.hypot(sample.p[0] - shot.from.x, sample.p[2] - shot.from.z) >= dist - 0.2) return sample.p[1];
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

/** Height of the middle of the chains above the basket's base, where a putt aims. */
export const CHAIN_MIDDLE = 1.05;

/**
 * Launch angle for a putt from `from`: the usual soft lob, tipped up (or down) by the angle to the
 * middle of the chains, so a putt up to a basket on a hill climbs to it instead of dying into
 * the slope, and one down a hill doesn't sail over.
 */
export function puttLaunchDeg(from: V3, basket: SimBasket): number {
  const dist = Math.max(0.5, Math.hypot(basket.x - from.x, basket.z - from.z));
  const rise = basket.base + CHAIN_MIDDLE - from.y;
  return DEFAULT_LAUNCH_DEG.putt + (Math.atan2(rise, dist) * 180) / Math.PI;
}

/** Closest the thrower's feet come to the pole, in meters: a putt from a disc that stopped right
 *  under the basket is taken from a step back, not from inside the cage. */
export const MIN_STANCE = 1.5;

/**
 * Where the thrower stands for a lie: on it, unless that is within `MIN_STANCE` of the basket, in
 * which case straight back from the basket through the lie (or toward `fallback`, the tee, when
 * the lie is right at the pole). Keeps the lie's height; the caller puts the feet on the ground.
 */
export function stanceFor(lie: V3, basket: SimBasket, fallback: V3): V3 {
  let dx = lie.x - basket.x;
  let dz = lie.z - basket.z;
  let d = Math.hypot(dx, dz);
  if (d >= MIN_STANCE) return lie;
  if (d < 1e-3) {
    dx = fallback.x - basket.x;
    dz = fallback.z - basket.z;
    d = Math.hypot(dx, dz) || 1;
  }
  return v3(basket.x + (dx / d) * MIN_STANCE, lie.y, basket.z + (dz / d) * MIN_STANCE);
}
