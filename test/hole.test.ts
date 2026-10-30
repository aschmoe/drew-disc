import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/01.json', 'utf8'));
const hole = buildHole(def);

describe('SeaTac hole 1', () => {
  it('puts the C pin 360 ft north of the tee', () => {
    expect(hole.pinId).toBe('C');
    expect(hole.world.basket.z).toBeCloseTo(-109.7, 1);
    expect(hole.def.lengthFt).toBe(360);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('keeps trunks off both ways round the big trees', () => {
    const routes = {
      gap: [[0, 5], [1, 30], [3, 55], [4, 66], [3.6, 74], [2.2, 82], [0.5, 92], [0, 105]],
      right: [[1, 10], [8, 30], [13, 50], [14.5, 65], [15, 80], [13, 92], [6, 104]],
    };
    for (const [name, line] of Object.entries(routes)) {
      for (let i = 1; i < line.length; i++) {
        for (let k = 0; k <= 10; k++) {
          const x = line[i - 1][0] + ((line[i][0] - line[i - 1][0]) * k) / 10;
          const y = line[i - 1][1] + ((line[i][1] - line[i - 1][1]) * k) / 10;
          for (const t of hole.trees) expect(Math.hypot(t.x - x, -t.z - y), `${name} route near (${x.toFixed(1)}, ${y.toFixed(1)})`).toBeGreaterThan(t.trunkRadius + 1.2);
        }
      }
    }
  });

  it('knows its surfaces and OB', () => {
    expect(hole.world.surfaceAt(0, 0)).toBe('tee');
    expect(hole.world.surfaceAt(3, -30)).toBe('fairway');
    expect(hole.world.surfaceAt(-20, -30)).toBe('bramble');
    expect(hole.world.surfaceAt(0, -109.7)).toBe('green');
    expect(hole.world.isOB(0, 12)).toBe(true);
    expect(hole.world.isOB(0, -50)).toBe(false);
  });

  describe('playing it', () => {
    const b = hole.world.basket;
    // Thrown the way the game throws: from the hand, standing on the tee pad.
    const shot = (o: Pick<ThrowInput, 'discId' | 'style' | 'power' | 'aimDeg' | 'hyzerDeg'>, seed = 1) =>
      simulateThrow(
        { ...o, hand: 'right', seed, from: releaseFrom(v3(0, hole.world.groundHeight(0, 0) + teePadLift(hole, 0, 0), 0), o.aimDeg, releasePoint(o.style)) },
        hole.world,
      );
    const fromBasket = (r: ReturnType<typeof shot>) => Math.hypot(r.rest.x - b.x, r.rest.z - b.z);
    /** Where the flight crosses a line `metersOut` north of the tee: [x, height]. */
    const crossing = (r: ReturnType<typeof shot>, metersOut: number) => {
      const s = r.path.find((p) => -p.p[2] >= metersOut)!;
      return [s.p[0], s.p[1]];
    };

    it('the left big tree blocks the straight line', () => {
      const r = shot({ discId: 'birthday-boy', style: 'backhand', power: 0.95, aimDeg: 0, hyzerDeg: 0 });
      expect(r.events.some((e) => e.kind === 'branch' || e.kind === 'trunk')).toBe(true);
      expect(-r.rest.z).toBeLessThan(90);
    });

    it('threads the gap between the big trees and gets close', () => {
      const r = shot({ discId: 'birthday-boy', style: 'backhand', power: 0.85, aimDeg: -7, hyzerDeg: -20 });
      expect(crossing(r, 73.6)[0]).toBeGreaterThan(2.8); // right of the left tree
      expect(crossing(r, 83.8)[0]).toBeLessThan(7.8); // left of the right tree
      expect(fromBasket(r)).toBeLessThan(10);
    });

    it('goes round the right of the right big tree and gets close', () => {
      const r = shot({ discId: 'birthday-boy', style: 'backhand', power: 0.9, aimDeg: 10, hyzerDeg: 0 });
      expect(crossing(r, 83.8)[0]).toBeGreaterThan(12);
      expect(fromBasket(r)).toBeLessThan(10);
    });

    it('the little trees close off the left', () => {
      for (const style of ['backhand', 'forehand'] as const) {
        for (const aimDeg of [-14, -11, -8]) {
          for (const hyzerDeg of [-20, 0, 20]) {
            const r = shot({ discId: 'birthday-boy', style, power: 1.05, aimDeg, hyzerDeg });
            expect(fromBasket(r), `${style} aim ${aimDeg} hyzer ${hyzerDeg}`).toBeGreaterThan(10);
          }
        }
      }
    });
  });
});
