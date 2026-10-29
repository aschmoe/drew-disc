import { describe, expect, it } from 'vitest';
import { simulateThrow, M_TO_FT, type ThrowInput } from '../client/src/sim/flight';
import { flatWorld, type SimTree } from '../client/src/sim/world';

const base: ThrowInput = {
  discId: 'red-eye',
  style: 'backhand',
  hand: 'right',
  power: 0.8,
  aimDeg: 0,
  hyzerDeg: 0,
  from: { x: 0, y: 1.1, z: 0 },
  seed: 42,
};
const throwIt = (over: Partial<ThrowInput> = {}, world = flatWorld()) => simulateThrow({ ...base, ...over }, world);
const feet = (m: number) => m * M_TO_FT;

describe('flight model', () => {
  it('is deterministic for the same inputs and seed', () => {
    const a = throwIt({ power: 1.1 });
    const b = throwIt({ power: 1.1 });
    expect(a.path).toEqual(b.path);
    expect(a.rest).toEqual(b.rest);
  });

  it('flies north when aimed north (world -z)', () => {
    const r = throwIt();
    expect(r.rest.z).toBeLessThan(-50);
  });

  it('hyzer finishes left and anhyzer finishes right, for a right-hand backhand', () => {
    const hyzer = throwIt({ hyzerDeg: 20 });
    const anhyzer = throwIt({ hyzerDeg: -20 });
    expect(hyzer.rest.x).toBeLessThan(-5);
    expect(anhyzer.rest.x).toBeGreaterThan(5);
  });

  it('a right-hand forehand mirrors the backhand', () => {
    const bh = throwIt({ discId: 'birthday-boy', power: 0.7 });
    const fh = throwIt({ discId: 'birthday-boy', power: 0.7, style: 'forehand' });
    expect(bh.rest.x).toBeLessThan(0);
    expect(fh.rest.x).toBeCloseTo(-bh.rest.x, 5);
  });

  it('an overstable driver thrown too slowly fades left right away', () => {
    const r = throwIt({ discId: 'birthday-boy', power: 0.5 });
    expect(r.rest.x).toBeLessThan(-10);
    expect(Math.max(...r.path.map((s) => s.p[0]))).toBeLessThan(1);
  });

  it('an understable-ish fairway overpowered on anhyzer turns hard right', () => {
    const r = throwIt({ power: 1, hyzerDeg: -15 });
    expect(r.rest.x).toBeGreaterThan(20);
  });

  it('distances are in a believable range for a strong amateur', () => {
    const full = (discId: string) => feet(-throwIt({ discId, power: 1 }).rest.z);
    expect(full('birthday-boy')).toBeGreaterThan(360);
    expect(full('birthday-boy')).toBeLessThan(460);
    expect(full('chain-seeker')).toBeGreaterThan(220);
    expect(full('chain-seeker')).toBeLessThan(310);
    expect(full('birthday-boy')).toBeGreaterThan(full('red-eye'));
    expect(full('red-eye')).toBeGreaterThan(full('chain-seeker'));
  });

  it('muscling it varies the result with the seed, a clean throw does not', () => {
    const lat = (seed: number, power: number) => throwIt({ seed, power }).rest.x;
    expect(lat(1, 0.9)).toBe(lat(2, 0.9));
    const spread = [1, 2, 3, 4, 5].map((s) => lat(s, 1.15));
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(3);
  });

  it('a headwind makes the disc turn more than a tailwind', () => {
    const headwind = simulateThrow({ ...base, power: 0.9, hyzerDeg: -5 }, flatWorld(), { speed: 6, towardDeg: 180 });
    const tailwind = simulateThrow({ ...base, power: 0.9, hyzerDeg: -5 }, flatWorld(), { speed: 6, towardDeg: 0 });
    expect(headwind.rest.x).toBeGreaterThan(tailwind.rest.x);
  });
});

describe('collisions', () => {
  const trunk: SimTree = {
    x: 0, z: -20, base: 0, trunkRadius: 0.4, trunkHeight: 12, canopyY: 14, canopyRx: 0.1, canopyRy: 0.1, density: 0,
  };

  it('a trunk in the line stops the disc short', () => {
    const r = throwIt({ power: 0.8 }, flatWorld({ trees: [trunk] }));
    expect(r.events.some((e) => e.kind === 'trunk')).toBe(true);
    expect(r.rest.z).toBeGreaterThan(-25);
  });

  it('a dense canopy catches branches', () => {
    const canopy: SimTree = { ...trunk, trunkHeight: 0.1, canopyY: 2, canopyRx: 4, canopyRy: 3, density: 2 };
    const r = throwIt({ power: 0.8, launchDeg: 4 }, flatWorld({ trees: [canopy] }));
    expect(r.events.some((e) => e.kind === 'branch')).toBe(true);
  });

  it('a soft putt from 6 m goes in the basket', () => {
    const world = flatWorld({ basket: { x: 0, z: -6, base: 0 } });
    let made = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateThrow(
        { ...base, discId: 'chain-seeker', mode: 'putt', power: 0.7, from: { x: 0, y: 1.0, z: 0 }, seed },
        world,
      );
      if (r.inBasket) made++;
    }
    expect(made).toBeGreaterThanOrEqual(14);
  });

  it('out of bounds is reported with the last in-bounds point', () => {
    const world = { ...flatWorld(), isOB: (_x: number, z: number) => z < -40 };
    const r = throwIt({ power: 0.8 }, world);
    expect(r.ob).toBe(true);
    expect(r.lastInBounds.z).toBeGreaterThanOrEqual(-40.5);
  });
});
