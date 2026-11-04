import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/04.json', 'utf8'));
const hole = buildHole(def);
/** Trees in the MAP frame (y north). */
const trees = hole.trees.map((t) => ({ ...t, y: -t.z }));
/** UDisc's line: out to the right to a bend, then back in to the basket. */
const BEND = [10.7, 52.7];
const UDISC_LINE = [[0, 0], BEND, [0, 87.8]];
/** x of UDisc's line at a given y. */
const lineX = (y: number) => (y < BEND[1] ? (BEND[0] * y) / BEND[1] : BEND[0] * (1 - (y - BEND[1]) / (87.8 - BEND[1])));
const standing = trees.filter((t) => t.kind !== 'bush');

describe('SeaTac hole 4', () => {
  it('puts the A pin straight north, 297 ft along the line', () => {
    expect(hole.pinId).toBe('A');
    expect(Math.abs(hole.world.basket.x)).toBeLessThan(0.1);
    let len = 0;
    for (let i = 1; i < UDISC_LINE.length; i++) len += Math.hypot(UDISC_LINE[i][0] - UDISC_LINE[i - 1][0], UDISC_LINE[i][1] - UDISC_LINE[i - 1][1]);
    expect(len * 3.28084).toBeCloseTo(297, -1);
    expect(hole.def.lengthFt).toBe(297);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('has a way through at trunk height along the line', () => {
    const line = [[0, 3], [5.5, 27], [10.7, 52.7], [0, 85]];
    for (let i = 1; i < line.length; i++) {
      for (let k = 0; k <= 10; k++) {
        const x = line[i - 1][0] + ((line[i][0] - line[i - 1][0]) * k) / 10;
        const y = line[i - 1][1] + ((line[i][1] - line[i - 1][1]) * k) / 10;
        for (const t of trees) {
          const r = t.kind === 'bush' ? t.canopyRx : t.trunkRadius;
          expect(Math.hypot(t.x - x, t.y - y), `near (${x.toFixed(1)}, ${y.toFixed(1)})`).toBeGreaterThan(r + 1.2);
        }
      }
    }
  });

  it('has the critical pair about 25 m out, one on a straight line at the basket', () => {
    expect(standing.some((t) => t.y > 22 && t.y < 32 && Math.abs(t.x) < 2)).toBe(true);
    expect(standing.some((t) => t.y > 20 && t.y < 28 && t.x - lineX(t.y) > 2.5 && t.x - lineX(t.y) < 5)).toBe(true);
  });

  it('has a big tree inside the bend, so the corner cannot be cut', () => {
    const inside = standing.filter((t) => t.y > 45 && t.y < 56 && t.x > -1 && t.x < lineX(t.y) - 5 && t.canopyRx >= 4);
    expect(inside.length).toBeGreaterThan(0);
  });

  it('opens up right of the bend', () => {
    const count = (x0: number, x1: number) => standing.filter((t) => t.y > 44 && t.y < 62 && t.x > x0 && t.x < x1).length;
    // The same-sized strip of woods on the far side of the lane is much busier.
    expect(count(16, 32)).toBeLessThan(count(-22, -6) / 2);
  });

  describe('playing it', () => {
    const b = hole.world.basket;
    const shot = (o: Pick<ThrowInput, 'discId' | 'power' | 'launchDeg'> & { aimDeg?: number; from?: [number, number] }) => {
      const [fx, fy] = o.from ?? [0, 0];
      const toBasket = (Math.atan2(b.x - fx, -b.z - fy) * 180) / Math.PI;
      const aimDeg = toBasket + (o.aimDeg ?? 0);
      const ground = hole.world.groundHeight(fx, -fy) + (o.from ? 0 : teePadLift(hole, 0, 0));
      return simulateThrow(
        { discId: o.discId, power: o.power, launchDeg: o.launchDeg, aimDeg, style: 'backhand', hyzerDeg: 0, hand: 'right', seed: 1, from: releaseFrom(v3(fx, ground, -fy), aimDeg, releasePoint('backhand')) },
        hole.world,
      );
    };
    const fromBasket = (r: ReturnType<typeof shot>) => Math.hypot(r.rest.x - b.x, r.rest.z - b.z);

    it('a drive straight at the basket is stopped by the critical trees', () => {
      for (const discId of ['birthday-boy', 'red-eye']) {
        const r = shot({ discId, power: 0.9, launchDeg: 5 });
        expect(-r.rest.z, discId).toBeLessThan(55);
      }
    });

    it('a drive thrown out right that fades back in finishes near the basket', () => {
      const r = shot({ discId: 'birthday-boy', power: 0.7, launchDeg: 5, aimDeg: 8 });
      expect(fromBasket(r)).toBeLessThan(8);
    });

    it('an approach from the open patch right of the bend gets close', () => {
      const r = shot({ discId: 'chain-seeker', power: 0.5, launchDeg: 5, from: [20, 55] });
      expect(fromBasket(r)).toBeLessThan(5);
    });
  });
});
