// Where a throw starts and how hard a putt needs to be: pure, so tests check the same numbers
// the game plays.

import { simulateThrow, type ThrowInput, type Wind } from '../sim/flight';
import { headingToDir } from '../sim/frame';
import { v3, type V3 } from '../sim/vec';
import type { SimWorld } from '../sim/world';

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
  const target = b.base + 1.05;
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
