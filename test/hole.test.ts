import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildHole, type HoleDef } from '../client/src/content/hole';
import { simulateThrow } from '../client/src/sim/flight';

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

  it('keeps tree trunks out of the lane', () => {
    for (const t of hole.trees) {
      if (t.kind === 'bush') continue;
      const northOf = -t.z;
      if (northOf > -3 && northOf < 100) expect(Math.abs(t.x)).toBeGreaterThan(4);
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

  it('a good straight shot down the lane gets close', () => {
    const results = [1, 2, 3, 4, 5, 6].map((seed) =>
      simulateThrow(
        { discId: 'birthday-boy', style: 'backhand', hand: 'right', power: 0.95, aimDeg: 0, hyzerDeg: 0, from: { x: 0, y: 1.1, z: 0 }, seed },
        hole.world,
      ),
    );
    const best = Math.min(...results.map((r) => Math.hypot(r.rest.x - hole.world.basket.x, r.rest.z - hole.world.basket.z)));
    expect(best).toBeLessThan(20);
  });
});
