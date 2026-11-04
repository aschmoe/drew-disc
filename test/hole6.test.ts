import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type Hole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/06.json', 'utf8'));
const hole = buildHole(def);
/** Trees in the MAP frame (y north). */
const trees = hole.trees.map((t) => ({ ...t, y: -t.z }));
/** UDisc's line: up the narrow lane to a bend, then a little left and up the hill. */
const BEND = [4.5, 65.3];
const UDISC_LINE = [[0, 0], BEND, [0, 80.3]];
const lineX = (y: number) => (BEND[0] * y) / BEND[1];
const ground = (x: number, y: number) => hole.world.groundHeight(x, -y);

describe('SeaTac hole 6', () => {
  it('puts the A pin straight north, 266 ft along the line', () => {
    expect(hole.pinId).toBe('A');
    expect(Math.abs(hole.world.basket.x)).toBeLessThan(0.1);
    let len = 0;
    for (let i = 1; i < UDISC_LINE.length; i++) len += Math.hypot(UDISC_LINE[i][0] - UDISC_LINE[i - 1][0], UDISC_LINE[i][1] - UDISC_LINE[i - 1][1]);
    expect(len * 3.28084).toBeCloseTo(266, -1);
    expect(hole.def.lengthFt).toBe(266);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('puts the basket up on a little hill that starts after the bend', () => {
    expect(ground(0, 0)).toBeLessThan(0.2);
    expect(ground(...(BEND as [number, number]))).toBeLessThan(0.4);
    expect(hole.world.basket.base).toBeGreaterThan(1.8);
    expect(hole.world.basket.base).toBeLessThan(3);
  });

  it('has a clear but narrow lane for the first 60 m', () => {
    // At disc height only trunks and bushes block. Measure the clear width across the line.
    const reach = (t: (typeof trees)[number], dy: number) => {
      const r = t.kind === 'bush' ? t.canopyRx : t.trunkRadius;
      return Math.abs(dy) < r ? Math.sqrt(r * r - dy * dy) : -Infinity;
    };
    const widths: number[] = [];
    for (let y = 4; y <= 60; y += 0.5) {
      const cx = lineX(y);
      let left = cx - 14;
      let right = cx + 14;
      for (const t of trees) {
        const r = reach(t, y - t.y);
        if (r === -Infinity || Math.abs(t.x - cx) > 14) continue;
        if (t.x < cx) left = Math.max(left, t.x + r);
        else right = Math.min(right, t.x - r);
      }
      widths.push(right - left);
    }
    widths.sort((a, b) => a - b);
    // Clear everywhere, and walled: most of the way the gap is under about 10 m.
    expect(widths[0]).toBeGreaterThan(5);
    expect(widths[Math.floor(widths.length / 2)]).toBeLessThan(10);
  });

  it('has a way through at trunk height along the line', () => {
    const line = [[0, 3], BEND, [0, 78]];
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

  it('puts the maintenance yard out of bounds, east of the tee', () => {
    expect(hole.world.isOB(28, -10)).toBe(true);
    expect(hole.world.isOB(10, -10)).toBe(false);
  });

  describe('playing it', () => {
    const shot = (h: Hole, o: Pick<ThrowInput, 'discId' | 'power' | 'launchDeg'> & { aimDeg?: number; from?: [number, number] }) => {
      const b = h.world.basket;
      const [fx, fy] = o.from ?? [0, 0];
      const toBasket = (Math.atan2(b.x - fx, -b.z - fy) * 180) / Math.PI;
      const aimDeg = toBasket + (o.aimDeg ?? 0);
      const g = h.world.groundHeight(fx, -fy) + (o.from ? 0 : teePadLift(h, 0, 0));
      return simulateThrow(
        { discId: o.discId, power: o.power, launchDeg: o.launchDeg, aimDeg, style: 'backhand', hyzerDeg: 0, hand: 'right', seed: 1, from: releaseFrom(v3(fx, g, -fy), aimDeg, releasePoint('backhand')) },
        h.world,
      );
    };
    const fromBasket = (r: ReturnType<typeof shot>) => Math.hypot(r.rest.x - hole.world.basket.x, r.rest.z - hole.world.basket.z);

    it('a fairway driver up the lane finishes on the hill near the basket', () => {
      const r = shot(hole, { discId: 'red-eye', power: 0.8, launchDeg: 5, aimDeg: -2 });
      expect(fromBasket(r)).toBeLessThan(4);
    });

    it('a drive pulled left into the wall stops short', () => {
      const r = shot(hole, { discId: 'birthday-boy', power: 0.6, launchDeg: 10, aimDeg: -2 });
      expect(r.events.some((e) => e.kind === 'branch' || e.kind === 'trunk')).toBe(true);
      expect(-r.rest.z).toBeLessThan(50);
    });

    it('the hill holds an approach that would run on past the basket on flat ground', () => {
      const flat = buildHole({ ...def, terrain: { bumps: def.terrain!.bumps!.slice(1) } });
      const o = { discId: 'chain-seeker', power: 0.5, launchDeg: 5, from: [3.5, 55] as [number, number] };
      expect(-shot(hole, o).rest.z).toBeLessThan(-shot(flat, o).rest.z - 1);
    });
  });
});
