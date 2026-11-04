import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { pointInPolygon } from '../client/src/sim/frame';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/07.json', 'utf8'));
const hole = buildHole(def);
/** Trees in the MAP frame (y north). */
const trees = hole.trees.map((t) => ({ ...t, y: -t.z }));
/** UDisc's line: up the meadow left of the bush to a bend, then right over the top to the basket. */
const BEND = [-27.7, 71.2];
const UDISC_LINE = [[0, 0], BEND, [0, 97.1]];
const bushField = def.treeFields.find((f) => f.height)!;

describe('SeaTac hole 7', () => {
  it('puts the B pin straight north, 375 ft along the line', () => {
    expect(hole.pinId).toBe('B');
    expect(Math.abs(hole.world.basket.x)).toBeLessThan(0.1);
    let len = 0;
    for (let i = 1; i < UDISC_LINE.length; i++) len += Math.hypot(UDISC_LINE[i][0] - UDISC_LINE[i - 1][0], UDISC_LINE[i][1] - UDISC_LINE[i - 1][1]);
    expect(len * 3.28084).toBeCloseTo(375, -1);
    expect(hole.def.lengthFt).toBe(375);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('has a massive bush, tall and dense, across the straight line at the basket', () => {
    const big = trees.filter((t) => t.kind === 'bush' && t.height > 3 && pointInPolygon(t.x, t.y, bushField.polygon));
    expect(big.length).toBeGreaterThan(50);
    // Walking the straight line from 52 to 80 m out, it is never clear of the bush.
    for (let y = 52; y <= 80; y += 2) {
      expect(big.some((t) => Math.hypot(t.x, t.y - y) < t.canopyRx), `at ${y} m`).toBe(true);
    }
  });

  it('has a way through at trunk height up the meadow and round the top', () => {
    const line = [[0, 3], [-14, 35], [-25, 62], BEND, [-14, 86], [0, 95]];
    for (let i = 1; i < line.length; i++) {
      for (let k = 0; k <= 10; k++) {
        const x = line[i - 1][0] + ((line[i][0] - line[i - 1][0]) * k) / 10;
        const y = line[i - 1][1] + ((line[i][1] - line[i - 1][1]) * k) / 10;
        for (const t of trees) {
          const r = t.kind === 'bush' ? t.canopyRx : t.trunkRadius;
          expect(Math.hypot(t.x - x, t.y - y), `near (${x.toFixed(1)}, ${y.toFixed(1)})`).toBeGreaterThan(r + 0.8);
        }
      }
    }
  });

  it('puts the street out of bounds beyond the basket', () => {
    expect(hole.world.isOB(0, -125)).toBe(true);
    expect(hole.world.isOB(0, -105)).toBe(false);
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

    it('a drive at the basket dies in the bush', () => {
      for (const discId of ['birthday-boy', 'puddle-jumper']) {
        const r = shot({ discId, power: 0.9, launchDeg: 5 });
        expect(-r.rest.z, discId).toBeLessThan(70);
        expect(fromBasket(r), discId).toBeGreaterThan(30);
      }
    });

    it('a drive up the meadow left of the bush reaches the bend', () => {
      const r = shot({ discId: 'red-eye', power: 0.9, launchDeg: 5, aimDeg: -26 });
      expect(-r.rest.z).toBeGreaterThan(70);
      expect(r.rest.x).toBeLessThan(-20);
    });

    it('from the bend, an approach over the top of the bush gets close', () => {
      const r = shot({ discId: 'chain-seeker', power: 0.5, launchDeg: 5, from: [-24, 68] });
      expect(fromBasket(r)).toBeLessThan(3);
    });
  });
});
