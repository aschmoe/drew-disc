import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { autoPuttPower, puttLaunchDeg, releaseFrom } from '../client/src/game/shot';
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
