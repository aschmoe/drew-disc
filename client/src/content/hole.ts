// Hole and course data: the JSON shapes, and turning a hole into something the simulation and the
// renderer can use. All generation (tree fields, terrain) is seeded, so every player, and every
// client in a multiplayer room, gets the identical hole.

import { mapToWorld, pointInPolygon, type MapPoint } from '../sim/frame';
import { createRng } from '../sim/rng';
import { TreeGrid, type SimBasket, type SimTree, type SimWorld, type Surface } from '../sim/world';

export type TreeKind = 'leafy' | 'young' | 'fir' | 'bush';

export interface CourseDef {
  id: string;
  name: string;
  location?: string;
  holes: string[];
  environment: EnvironmentDef;
}

export interface EnvironmentDef {
  skyTop: string;
  skyHorizon: string;
  fog: { color: string; near: number; far: number };
  sun: { color: string; intensity: number; elevationDeg: number; headingDeg: number };
  wind: { minSpeed: number; maxSpeed: number };
}

export interface TreeDef {
  kind: TreeKind;
  pos: MapPoint;
  height?: number;
  canopyRadius?: number;
}

export type SurfaceDef =
  | { kind: Surface; polygon: MapPoint[] }
  | { kind: Surface; polyline: MapPoint[]; width: number }
  | { kind: Surface; circle: { pos: MapPoint; radius: number } };

export interface HoleDef {
  id: string;
  number: number;
  name: string;
  par: number;
  lengthFt: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  defaultSurface: Surface;
  terrain?: { bumps?: { pos: MapPoint; radius: number; height: number }[] };
  tees: { id: string; pos: MapPoint; headingDeg: number }[];
  pins: { id: string; pos: MapPoint; default?: boolean }[];
  surfaces: SurfaceDef[];
  ob: { label: string; polygon: MapPoint[] }[];
  trees: TreeDef[];
  treeFields: { kind: TreeKind; polygon: MapPoint[]; spacing: number; seed: number }[];
  clearings?: { polygon: MapPoint[] }[];
}

/** A placed tree in the WORLD frame, carrying both its physics and its look. */
export interface TreeInstance extends SimTree {
  kind: TreeKind;
  height: number;
  /** Per-tree variation for the renderer. */
  seed: number;
}

export interface Hole {
  def: HoleDef;
  pinId: string;
  trees: TreeInstance[];
  world: SimWorld;
}

/** Default sizes by kind, scaled from a tree's height. */
function makeTree(kind: TreeKind, x: number, z: number, base: number, height: number, canopy: number, seed: number): TreeInstance {
  switch (kind) {
    case 'fir':
      return { kind, x, z, base, height, seed, trunkRadius: 0.35, trunkHeight: height * 0.22, canopyY: height * 0.55, canopyRx: canopy, canopyRy: height * 0.45, density: 0.9 };
    case 'young':
      return { kind, x, z, base, height, seed, trunkRadius: 0.09, trunkHeight: height * 0.45, canopyY: height * 0.66, canopyRx: canopy, canopyRy: height * 0.32, density: 0.35 };
    case 'bush':
      return { kind, x, z, base, height, seed, trunkRadius: 0, trunkHeight: 0, canopyY: height * 0.5, canopyRx: canopy, canopyRy: height * 0.55, density: 1.2 };
    case 'leafy':
    default:
      return { kind: 'leafy', x, z, base, height, seed, trunkRadius: 0.3, trunkHeight: height * 0.42, canopyY: height * 0.66, canopyRx: canopy, canopyRy: height * 0.33, density: 0.6 };
  }
}

const SIZE: Record<TreeKind, { height: [number, number]; canopy: [number, number] }> = {
  leafy: { height: [13, 20], canopy: [3.8, 5.5] },
  young: { height: [5, 9], canopy: [1.4, 2.4] },
  fir: { height: [22, 34], canopy: [3, 4.2] },
  bush: { height: [1.0, 1.7], canopy: [0.9, 1.6] },
};

function distToSegment(px: number, py: number, a: MapPoint, b: MapPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function inSurface(s: SurfaceDef, x: number, y: number): boolean {
  if ('polygon' in s) return pointInPolygon(x, y, s.polygon);
  if ('circle' in s) return Math.hypot(x - s.circle.pos[0], y - s.circle.pos[1]) <= s.circle.radius;
  for (let i = 0; i < s.polyline.length - 1; i++) {
    if (distToSegment(x, y, s.polyline[i], s.polyline[i + 1]) <= s.width / 2) return true;
  }
  return false;
}

export function buildHole(def: HoleDef, pinId?: string): Hole {
  const pin = def.pins.find((p) => p.id === pinId) ?? def.pins.find((p) => p.default) ?? def.pins[0];
  const bumps = def.terrain?.bumps ?? [];

  /** Height at a MAP point: gentle gaussian bumps. */
  const heightAtMap = (x: number, y: number) => {
    let h = 0;
    for (const b of bumps) {
      const d2 = (x - b.pos[0]) ** 2 + (y - b.pos[1]) ** 2;
      h += b.height * Math.exp(-d2 / (b.radius * b.radius));
    }
    return h;
  };
  const surfaceAtMap = (x: number, y: number): Surface => {
    let kind = def.defaultSurface;
    for (const s of def.surfaces) if (inSurface(s, x, y)) kind = s.kind;
    return kind;
  };
  const isOBMap = (x: number, y: number) => def.ob.some((o) => pointInPolygon(x, y, o.polygon));
  const cleared = (x: number, y: number) => (def.clearings ?? []).some((c) => pointInPolygon(x, y, c.polygon));

  const trees: TreeInstance[] = [];
  let treeSeed = 1;
  const place = (kind: TreeKind, p: MapPoint, height: number, canopy: number) => {
    const w = mapToWorld(p, heightAtMap(p[0], p[1]));
    trees.push(makeTree(kind, w.x, w.z, w.y, height, canopy, treeSeed++));
  };

  for (const t of def.trees) {
    const size = SIZE[t.kind];
    const height = t.height ?? (size.height[0] + size.height[1]) / 2;
    const canopy = t.canopyRadius ?? (t.kind === 'fir' ? height * 0.13 : (size.canopy[0] + size.canopy[1]) / 2);
    place(t.kind, t.pos, height, canopy);
  }

  // Tree fields: a jittered grid inside the polygon, skipping clearings and OB.
  for (const field of def.treeFields) {
    const rng = createRng(field.seed);
    const size = SIZE[field.kind];
    const xs = field.polygon.map((p) => p[0]);
    const ys = field.polygon.map((p) => p[1]);
    for (let gy = Math.min(...ys); gy < Math.max(...ys); gy += field.spacing) {
      for (let gx = Math.min(...xs); gx < Math.max(...xs); gx += field.spacing) {
        const x = gx + rng.range(0.1, 0.9) * field.spacing;
        const y = gy + rng.range(0.1, 0.9) * field.spacing;
        const height = rng.range(size.height[0], size.height[1]);
        const canopy = rng.range(size.canopy[0], size.canopy[1]);
        if (!pointInPolygon(x, y, field.polygon) || cleared(x, y) || isOBMap(x, y)) continue;
        place(field.kind, [x, y], height, canopy);
      }
    }
  }

  const grid = new TreeGrid(trees);
  const basketWorld = mapToWorld(pin.pos, heightAtMap(pin.pos[0], pin.pos[1]));
  const basket: SimBasket = { x: basketWorld.x, z: basketWorld.z, base: basketWorld.y };

  // The WORLD frame has north at -z, so map y = -z.
  const world: SimWorld = {
    groundHeight: (x, z) => heightAtMap(x, -z),
    surfaceAt: (x, z) => surfaceAtMap(x, -z),
    isOB: (x, z) => isOBMap(x, -z),
    treesNear: (x, z) => grid.near(x, z),
    basket,
  };

  return { def, pinId: pin.id, trees, world };
}

export async function loadCourse(courseId: string): Promise<CourseDef> {
  const res = await fetch(`courses/${courseId}/course.json`);
  if (!res.ok) throw new Error(`Could not load course ${courseId}`);
  return res.json();
}

export async function loadHoleDef(courseId: string, holeId: string): Promise<HoleDef> {
  const res = await fetch(`courses/${courseId}/holes/${holeId}.json`);
  if (!res.ok) throw new Error(`Could not load hole ${courseId}/${holeId}`);
  return res.json();
}
