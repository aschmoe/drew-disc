import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { autoPuttPower, MIN_STANCE, puttLaunchDeg, releaseFrom, stanceFor } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { dirToHeading } from '../client/src/sim/frame';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';

const hole = buildHole(JSON.parse(readFileSync('client/public/courses/seatac/holes/01.json', 'utf8')) as HoleDef);
const b = hole.world.basket;

/** A putt as the game builds it: from the thrower's hand, aimed from there at the basket. */
const putt = (metersSouth: number) => {
  const lie = v3(b.x, hole.world.groundHeight(b.x, b.z + metersSouth), b.z + metersSouth);
  const from = releaseFrom(lie, 0, releasePoint('putt'));
  const aimDeg = dirToHeading(v3(b.x - from.x, 0, b.z - from.z));
  return (power: number, seed = 1): ThrowInput => ({
    discId: 'chain-seeker',
    style: 'backhand',
    hand: 'right',
    mode: 'putt',
    power,
    aimDeg,
    hyzerDeg: 0,
    flickDeg: 0,
    spin: 1,
    from,
    seed,
  });
};

describe('putting from the hand', () => {
  it('lets go below the top of the chains, so a short putt can drop in', () => {
    expect(releasePoint('putt').y).toBeLessThan(1.25);
  });

  it('holes the auto-power putt from a tap-in out to 10 m', () => {
    for (const m of [1.5, 1.85, 4, 7, 10]) {
      const input = putt(m);
      const power = autoPuttPower(input, hole.world);
      const made = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => simulateThrow(input(power, seed), hole.world).inBasket);
      expect(made.length, `${m} m at power ${power}`).toBe(8);
    }
  });

  it('a putt caught by the chains rings them, then lands in the basket once', () => {
    const input = putt(4);
    const r = simulateThrow(input(autoPuttPower(input, hole.world), 1), hole.world);
    const kinds = r.events.map((e) => e.kind);
    expect(r.inBasket).toBe(true);
    expect(kinds.filter((k) => k === 'in-basket')).toHaveLength(1);
    expect(kinds.indexOf('chains')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('chains')).toBeLessThan(kinds.indexOf('in-basket'));
    expect(kinds).not.toContain('rest');
  });
});

describe('putting up or down a hill', () => {
  // Hole 6's basket sits on a hill about 2 m up: putting from below it, the chains are well above
  // the hand.
  const h6 = buildHole(JSON.parse(readFileSync('client/public/courses/seatac/holes/06.json', 'utf8')) as HoleDef);
  const b6 = h6.world.basket;
  const puttOn = (metersSouth: number, metersEast = 0) => {
    const lie = v3(b6.x + metersEast, h6.world.groundHeight(b6.x + metersEast, b6.z + metersSouth), b6.z + metersSouth);
    const from = releaseFrom(lie, 0, releasePoint('putt'));
    const aimDeg = dirToHeading(v3(b6.x - from.x, 0, b6.z - from.z));
    return (power: number, seed = 1): ThrowInput => ({
      discId: 'chain-seeker', style: 'backhand', hand: 'right', mode: 'putt', power, aimDeg, hyzerDeg: 0,
      flickDeg: 0, spin: 1, from, seed, launchDeg: puttLaunchDeg(from, b6),
    });
  };

  it('tips the putt up toward chains above the hand, and down toward chains below it', () => {
    const flat = puttLaunchDeg(v3(0, 0.9, 5), { x: 0, z: 0, base: 0 });
    expect(puttLaunchDeg(v3(0, 0.9, 5), { x: 0, z: 0, base: 1.5 })).toBeGreaterThan(flat + 10);
    expect(puttLaunchDeg(v3(0, 0.9, 5), { x: 0, z: 0, base: -1.5 })).toBeLessThan(flat - 10);
  });

  it('holes the auto-power putt uphill from below the basket', () => {
    for (const m of [3, 5, 7, 9]) {
      const input = puttOn(m);
      const power = autoPuttPower(input, h6.world);
      const made = [1, 2, 3, 4].filter((seed) => simulateThrow(input(power, seed), h6.world).inBasket);
      expect(made.length, `${m} m uphill at power ${power}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('holes the auto-power putt downhill from behind the basket', () => {
    for (const m of [-4, -7]) {
      const input = puttOn(m);
      const power = autoPuttPower(input, h6.world);
      const made = [1, 2, 3, 4].filter((seed) => simulateThrow(input(power, seed), h6.world).inBasket);
      expect(made.length, `${-m} m downhill at power ${power}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('a disc that stops right at the basket', () => {
  const tee = v3(0, 0, 0);

  it('puts the thrower a step back from the pole, not inside the cage', () => {
    for (const [dx, dz] of [[0, 0.3], [0.3, 0], [-0.2, -0.2], [0, 0]]) {
      const lie = v3(b.x + dx, 0, b.z + dz);
      const at = stanceFor(lie, b, tee);
      expect(Math.hypot(at.x - b.x, at.z - b.z)).toBeCloseTo(MIN_STANCE, 5);
    }
    // Further out, the thrower stands on the lie.
    const far = v3(b.x, 0, b.z + 3);
    expect(stanceFor(far, b, tee)).toEqual(far);
  });

  it('holes the auto-power putt from that step back, on every side', () => {
    for (const [dx, dz] of [[0, 0.3], [0.3, 0], [-0.3, 0], [0, -0.3]]) {
      const at = stanceFor(v3(b.x + dx, 0, b.z + dz), b, tee);
      const lie = v3(at.x, hole.world.groundHeight(at.x, at.z), at.z);
      const heading = dirToHeading(v3(b.x - lie.x, 0, b.z - lie.z));
      const from = releaseFrom(lie, heading, releasePoint('putt'));
      const aimDeg = dirToHeading(v3(b.x - from.x, 0, b.z - from.z));
      const input = (power: number, seed = 1): ThrowInput => ({
        discId: 'chain-seeker', style: 'backhand', hand: 'right', mode: 'putt', power, aimDeg, hyzerDeg: 0,
        flickDeg: 0, spin: 1, from, seed, launchDeg: puttLaunchDeg(from, b),
      });
      const power = autoPuttPower(input, hole.world);
      const made = [1, 2, 3, 4].filter((seed) => simulateThrow(input(power, seed), hole.world).inBasket);
      expect(made.length, `from (${dx}, ${dz}) at power ${power}`).toBe(4);
    }
  });
});
