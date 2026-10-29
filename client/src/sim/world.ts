// What the simulation needs to know about a hole. Built from hole JSON by content/hole.ts, or by
// flatWorld() for tests and the flight lab.

import type { V3 } from './vec';

export type Surface = 'fairway' | 'path' | 'rough' | 'bramble' | 'tee' | 'green';

export interface SimTree {
  x: number;
  z: number;
  /** World y of the ground at the trunk. */
  base: number;
  trunkRadius: number;
  /** Trunk is solid from base to base + trunkHeight. */
  trunkHeight: number;
  /** Canopy ellipsoid, relative to base. */
  canopyY: number;
  canopyRx: number;
  canopyRy: number;
  /** Branch hits per meter flown through the canopy core. */
  density: number;
}

export interface SimBasket {
  x: number;
  z: number;
  /** World y of the ground under the basket. */
  base: number;
}

export interface SimWorld {
  groundHeight(x: number, z: number): number;
  surfaceAt(x: number, z: number): Surface;
  isOB(x: number, z: number): boolean;
  /** Trees whose bounds may touch a point. */
  treesNear(x: number, z: number): readonly SimTree[];
  basket: SimBasket;
}

/** Basket geometry, meters above the basket base (a standard target, roughly PDGA spec). */
export const BASKET = {
  poleRadius: 0.025,
  trayRadius: 0.33,
  trayBottom: 0.5,
  trayTop: 0.78,
  chainRadius: 0.29,
  chainBottom: 0.78,
  chainTop: 1.3,
  bandRadius: 0.33,
  bandTop: 1.38,
} as const;

/** Uniform grid so a flight only checks the trees near the disc. */
export class TreeGrid {
  private cells = new Map<string, SimTree[]>();
  constructor(
    trees: SimTree[],
    private cell = 8,
  ) {
    for (const t of trees) {
      const r = Math.max(t.trunkRadius, t.canopyRx) + 0.2;
      for (let cx = Math.floor((t.x - r) / cell); cx <= Math.floor((t.x + r) / cell); cx++) {
        for (let cz = Math.floor((t.z - r) / cell); cz <= Math.floor((t.z + r) / cell); cz++) {
          const key = `${cx},${cz}`;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(t);
        }
      }
    }
  }
  near(x: number, z: number): readonly SimTree[] {
    return this.cells.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`) ?? EMPTY;
  }
}
const EMPTY: SimTree[] = [];

/** An endless flat field with no trees and the basket far away, for tests and tuning. */
export function flatWorld(opts: { trees?: SimTree[]; basket?: SimBasket; surface?: Surface } = {}): SimWorld {
  const grid = new TreeGrid(opts.trees ?? []);
  return {
    groundHeight: () => 0,
    surfaceAt: () => opts.surface ?? 'fairway',
    isOB: () => false,
    treesNear: (x, z) => grid.near(x, z),
    basket: opts.basket ?? { x: 0, z: -10000, base: 0 },
  };
}

export type { V3 };
