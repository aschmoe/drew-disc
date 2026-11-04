import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/03.json', 'utf8'));
const hole = buildHole(def);
/** Trees in the MAP frame (y north). */
const trees = hole.trees.map((t) => ({ ...t, y: -t.z }));
/** UDisc's line for the hole: north, a kink left, a jog right past the trees from the left, then in. */
const UDISC_LINE = [[0, 0], [-4, 73.3], [3.4, 85.8], [0, 110.3]];

describe('SeaTac hole 3', () => {
  it('puts the B pin straight north, 370 ft along the line', () => {
    expect(hole.pinId).toBe('B');
    expect(Math.abs(hole.world.basket.x)).toBeLessThan(0.1);
    let len = 0;
    for (let i = 1; i < UDISC_LINE.length; i++) len += Math.hypot(UDISC_LINE[i][0] - UDISC_LINE[i - 1][0], UDISC_LINE[i][1] - UDISC_LINE[i - 1][1]);
    expect(len * 3.28084).toBeCloseTo(370, -1);
    expect(-hole.world.basket.z * 3.28084).toBeCloseTo(362, -1);
    expect(hole.def.lengthFt).toBe(370);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('has a way through at trunk height, up the lane', () => {
    const line = [[0, 3], [0.6, 30], [-1.5, 50], [-3, 65], [-1, 78], [2, 88], [0, 107]];
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

  it('frames the tee shot with two big side trees', () => {
    const big = trees.filter((t) => t.height > 20 && t.y > 8 && t.y < 18 && Math.abs(t.x) > 4 && Math.abs(t.x) < 11);
    expect(big.some((t) => t.x < 0)).toBe(true);
    expect(big.some((t) => t.x > 0)).toBe(true);
  });

  it('has a trunk right in the way, within 2.5 m of a straight line at the basket', () => {
    const inWay = trees.filter((t) => t.kind !== 'bush' && t.y > 20 && t.y < 35 && Math.abs(t.x) < 2.5);
    expect(inWay.length).toBeGreaterThan(0);
  });

  it('has a string of low crowns poking in from the left near the bend', () => {
    // Canopies on the left, low enough to catch a disc, reaching within 2.5 m of the straight line.
    const poking = trees.filter((t) => t.kind !== 'bush' && t.x < 0 && t.y > 77 && t.y < 91 && t.canopyY - t.canopyRy < 5 && t.x + t.canopyRx > -2.5);
    expect(poking.length).toBeGreaterThanOrEqual(2);
    const string = trees.filter((t) => t.kind !== 'bush' && t.x < -3 && t.x > -22 && t.y > 77 && t.y < 91);
    expect(string.length).toBeGreaterThanOrEqual(4);
  });

  describe('playing it', () => {
    const b = hole.world.basket;
    const shot = (o: Pick<ThrowInput, 'discId' | 'power' | 'launchDeg'> & { aimDeg?: number; from?: [number, number] }) => {
      const [fx, fy] = o.from ?? [0, 0];
      const aimDeg = o.aimDeg ?? 0;
      const ground = hole.world.groundHeight(fx, -fy) + (o.from ? 0 : teePadLift(hole, 0, 0));
      return simulateThrow(
        { discId: o.discId, power: o.power, launchDeg: o.launchDeg, aimDeg, style: 'backhand', hyzerDeg: 0, hand: 'right', seed: 1, from: releaseFrom(v3(fx, ground, -fy), aimDeg, releasePoint('backhand')) },
        hole.world,
      );
    };
    const fromBasket = (r: ReturnType<typeof shot>) => Math.hypot(r.rest.x - b.x, r.rest.z - b.z);

    it('a low fairway driver threaded up the lane gets past the bend', () => {
      const r = shot({ discId: 'red-eye', power: 0.9, launchDeg: 4, aimDeg: -3 });
      expect(-r.rest.z).toBeGreaterThan(80);
    });

    it('a lofted drive catches the trees right in the way and drops short', () => {
      const r = shot({ discId: 'birthday-boy', power: 0.9, launchDeg: 12, aimDeg: -3 });
      expect(r.events.some((e) => e.kind === 'branch' && -e.z > 20 && -e.z < 36)).toBe(true);
      expect(-r.rest.z).toBeLessThan(55);
    });

    it('from the middle of the lane at the bend, a putter approach parks it', () => {
      const r = shot({ discId: 'chain-seeker', power: 0.5, launchDeg: 4, aimDeg: 4.6, from: [-3, 73] });
      expect(fromBasket(r)).toBeLessThan(3);
    });

    it('a big drive does not run on past the woods behind the basket', () => {
      for (const aimDeg of [-1.5, 0, 1.5]) {
        const r = shot({ discId: 'birthday-boy', power: 0.9, launchDeg: 4, aimDeg });
        expect(-r.rest.z, `aim ${aimDeg}`).toBeLessThan(125);
      }
    });
  });
});
