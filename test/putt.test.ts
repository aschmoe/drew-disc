import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { autoPuttPower, releaseFrom } from '../client/src/game/shot';
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
});
