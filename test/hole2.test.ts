import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { releaseFrom } from '../client/src/game/shot';
import { simulateThrow, type ThrowInput } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';
import { releasePoint } from '../client/src/world/character';
import { teePadLift } from '../client/src/world/props';

const def: HoleDef = JSON.parse(readFileSync('client/public/courses/seatac/holes/02.json', 'utf8'));
const hole = buildHole(def);

describe('SeaTac hole 2', () => {
  it('puts the A pin 245 ft north of the tee', () => {
    expect(hole.pinId).toBe('A');
    expect(Math.hypot(hole.world.basket.x, hole.world.basket.z) * 3.28084).toBeCloseTo(245, -1);
    expect(hole.def.lengthFt).toBe(245);
  });

  it('is identical every time it is built', () => {
    expect(buildHole(def).trees).toEqual(hole.trees);
  });

  it('keeps trunks off the line through the entrance', () => {
    const line = [[0, 3], [0.5, 30], [0.3, 55], [0, 62], [-0.7, 72]];
    for (let i = 1; i < line.length; i++) {
      for (let k = 0; k <= 10; k++) {
        const x = line[i - 1][0] + ((line[i][0] - line[i - 1][0]) * k) / 10;
        const y = line[i - 1][1] + ((line[i][1] - line[i - 1][1]) * k) / 10;
        for (const t of hole.trees) expect(Math.hypot(t.x - x, -t.z - y), `near (${x.toFixed(1)}, ${y.toFixed(1)})`).toBeGreaterThan(t.trunkRadius + 1.2);
      }
    }
  });

  it('has a tight chute in: about 3 m clear at disc height, from about 48 to 63 m out', () => {
    // At disc height only bushes (their whole canopy) and trunks block. Walk up the chute and
    // measure the clear width either side of the line.
    const reach = (t: (typeof hole.trees)[number], dy: number) => {
      const r = t.kind === 'bush' ? t.canopyRx : t.trunkRadius;
      return Math.abs(dy) < r ? Math.sqrt(r * r - dy * dy) : -Infinity;
    };
    let tightest = Infinity;
    for (let y = 48; y <= 63; y += 0.25) {
      let left = -Infinity;
      let right = Infinity;
      for (const t of hole.trees) {
        const ty = -t.z;
        const r = reach(t, y - ty);
        if (r === -Infinity || Math.abs(t.x) > 8) continue;
        if (t.x < 0) left = Math.max(left, t.x + r);
        else right = Math.min(right, t.x - r);
      }
      tightest = Math.min(tightest, right - left);
    }
    expect(tightest).toBeGreaterThan(2.4);
    expect(tightest).toBeLessThan(3.6);
  });

  it('puts the basket under the canopy', () => {
    const b = hole.world.basket;
    const over = hole.trees.filter((t) => Math.hypot(t.x - b.x, t.z - b.z) < t.canopyRx && t.canopyY - t.canopyRy > 4);
    expect(over.length).toBeGreaterThan(0);
  });

  describe('playing it', () => {
    const b = hole.world.basket;
    const shot = (o: Pick<ThrowInput, 'discId' | 'power' | 'launchDeg'> & { aimDeg?: number }) => {
      const aimDeg = o.aimDeg ?? 0;
      return simulateThrow(
        { ...o, aimDeg, style: 'backhand', hyzerDeg: 0, hand: 'right', seed: 1, from: releaseFrom(v3(0, hole.world.groundHeight(0, 0) + teePadLift(hole, 0, 0), 0), aimDeg, releasePoint('backhand')) },
        hole.world,
      );
    };
    const fromBasket = (r: ReturnType<typeof shot>) => Math.hypot(r.rest.x - b.x, r.rest.z - b.z);

    it('a low putter through the entrance parks it', () => {
      const r = shot({ discId: 'chain-seeker', power: 0.9, launchDeg: 9 });
      expect(fromBasket(r)).toBeLessThan(3);
    });

    it('a lofted throw catches the canopy and drops short', () => {
      const r = shot({ discId: 'red-eye', power: 0.8, launchDeg: 15 });
      expect(r.events.some((e) => e.kind === 'branch')).toBe(true);
      expect(-r.rest.z).toBeLessThan(68);
    });

    it('a big drive does not run on past the basket woods', () => {
      for (const aimDeg of [-1, 0, 1]) {
        const r = shot({ discId: 'birthday-boy', power: 0.9, launchDeg: 5, aimDeg });
        expect(-r.rest.z, `aim ${aimDeg}`).toBeLessThan(112);
      }
    });
  });
});
