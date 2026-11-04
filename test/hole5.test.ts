import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/05.json', 'utf8'));
const hole = buildHole(def);
/** Trees in the MAP frame (y north). */
const trees = hole.trees.map((t) => ({ ...t, y: -t.z }));
const standing = trees.filter((t) => t.kind !== 'bush');
/** UDisc's line: up the open ground to a bend, then back left to the basket. */
const BEND = [9, 66.8];
const UDISC_LINE = [[0, 0], BEND, [0, 87.8]];
const lineX = (y: number) => (y < BEND[1] ? (BEND[0] * y) / BEND[1] : BEND[0] * (1 - (y - BEND[1]) / (87.8 - BEND[1])));

describe('SeaTac hole 5', () => {
  it('puts the A pin straight north, 296 ft along the line', () => {
    expect(hole.pinId).toBe('A');
    expect(Math.abs(hole.world.basket.x)).toBeLessThan(0.1);
    let len = 0;
    for (let i = 1; i < UDISC_LINE.length; i++) len += Math.hypot(UDISC_LINE[i][0] - UDISC_LINE[i - 1][0], UDISC_LINE[i][1] - UDISC_LINE[i - 1][1]);
    expect(len * 3.28084).toBeCloseTo(296, -1);
    expect(hole.def.lengthFt).toBe(296);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('has a way through at trunk height along the line', () => {
    const line = [[0, 3], [9, 64], [0, 85]];
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

  it('is open for the first portion: nothing stands right of the line for 12 m', () => {
    for (let y = 12; y <= 58; y += 2) {
      const blocking = standing.filter((t) => Math.abs(t.y - y) < 2 && t.x > lineX(y) + 1 && t.x < lineX(y) + 12);
      expect(blocking.map((t) => `(${t.x.toFixed(1)}, ${t.y.toFixed(1)})`), `at ${y} m`).toEqual([]);
    }
  });

  it('has the critical trees: two left of the line, one right of the bend', () => {
    const leftOf = (y0: number, y1: number) => standing.some((t) => t.y > y0 && t.y < y1 && lineX(t.y) - t.x > 3 && lineX(t.y) - t.x < 7);
    expect(leftOf(20, 28)).toBe(true);
    expect(leftOf(51, 60)).toBe(true);
    expect(standing.some((t) => t.y > 63 && t.y < 72 && t.x - lineX(t.y) > 2 && t.x - lineX(t.y) < 6 && t.canopyRx >= 4)).toBe(true);
  });

  it('puts the maintenance yard out of bounds, west of the tee', () => {
    expect(hole.world.isOB(-25, -40)).toBe(true);
    expect(hole.world.isOB(0, -40)).toBe(false);
    expect(hole.world.isOB(-12, -10)).toBe(false);
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

    it('a midrange up the open ground, fading back left, finishes near the basket', () => {
      const r = shot({ discId: 'puddle-jumper', power: 0.9, launchDeg: 5, aimDeg: 3 });
      expect(fromBasket(r)).toBeLessThan(7);
    });

    it('a lofted drive straight at the basket catches the tree on the left at 55 m', () => {
      const r = shot({ discId: 'birthday-boy', power: 0.9, launchDeg: 10 });
      expect(r.events.some((e) => e.kind === 'branch' && -e.z > 45 && -e.z < 60)).toBe(true);
      expect(fromBasket(r)).toBeGreaterThan(15);
    });

    it('an approach from the open grass gets close', () => {
      const r = shot({ discId: 'chain-seeker', power: 0.5, launchDeg: 5, from: [12, 52] });
      expect(fromBasket(r)).toBeLessThan(5);
    });
  });
});
