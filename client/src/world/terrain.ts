import * as THREE from 'three';
import type { Hole } from '../content/hole';
import { pointInPolygon } from '../sim/frame';
import { createRng } from '../sim/rng';
import { COLORS, SURFACE_COLOR } from './palette';

const CELL = 1.25;

/** Flat-shaded ground with one color per triangle, picked from the surface under it. */
export function buildGround(hole: Hole): THREE.Mesh {
  const { bounds } = hole.def;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const nx = Math.ceil(w / CELL);
  const ny = Math.ceil(h / CELL);
  const rng = createRng(7);

  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();

  const surfaceColor = (mx: number, my: number) => {
    const ob = hole.def.ob.find((o) => pointInPolygon(mx, my, o.polygon));
    if (ob) return ob.label === 'Road' ? COLORS.asphalt : COLORS.obLawn;
    return SURFACE_COLOR[hole.world.surfaceAt(mx, -my)];
  };

  const vert = (mx: number, my: number) => {
    // Map (x east, y north) to world (x, height, -y).
    positions.push(mx, hole.world.groundHeight(mx, -my), -my);
  };

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = bounds.minX + i * CELL;
      const y0 = bounds.minY + j * CELL;
      const x1 = x0 + CELL;
      const y1 = y0 + CELL;
      const tris: [number, number][][] = [
        [[x0, y0], [x1, y0], [x1, y1]],
        [[x0, y0], [x1, y1], [x0, y1]],
      ];
      for (const tri of tris) {
        // These are counter-clockwise in the map frame, and map -> world (z = -y) mirrors them to
        // clockwise, so emit them reversed to face up.
        vert(tri[0][0], tri[0][1]);
        vert(tri[1][0], tri[1][1]);
        vert(tri[2][0], tri[2][1]);
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        color.set(surfaceColor(cx, cy));
        color.offsetHSL(rng.range(-0.01, 0.01), 0, rng.range(-0.03, 0.03));
        for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

/** The gravel path as a slightly raised ribbon, so it stays crisp at any ground resolution. */
export function buildPath(hole: Hole): THREE.Object3D {
  const group = new THREE.Group();
  for (const s of hole.def.surfaces) {
    if (!('polyline' in s)) continue;
    const pts = s.polyline;
    const positions: number[] = [];
    const steps: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
      for (let k = 0; k < n; k++) steps.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    steps.push(pts[pts.length - 1]);
    const half = s.width / 2;
    for (let i = 0; i < steps.length - 1; i++) {
      const [ax, ay] = steps[i];
      const [bx, by] = steps[i + 1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const px = (-(by - ay) / len) * half;
      const py = ((bx - ax) / len) * half;
      const quad = [
        [ax - px, ay - py],
        [ax + px, ay + py],
        [bx + px, by + py],
        [bx - px, by - py],
      ];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const [mx, my] = quad[idx];
        positions.push(mx, hole.world.groundHeight(mx, -my) + 0.03, -my);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: SURFACE_COLOR[s.kind], flatShading: true }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
