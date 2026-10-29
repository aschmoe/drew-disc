import * as THREE from 'three';
import type { Hole } from '../content/hole';
import type { Disc } from '@shared/discs';
import { mapToWorld, type MapPoint } from '../sim/frame';
import { BASKET } from '../sim/world';
import { COLORS, SURFACE_COLOR } from './palette';

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** A standard disc golf target, built to the same dimensions the simulation uses. */
export function buildBasket(): THREE.Group {
  const g = new THREE.Group();
  const metal = lambert(COLORS.basketMetal);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, BASKET.bandTop + 0.05, 8), metal);
  pole.position.y = (BASKET.bandTop + 0.05) / 2;
  g.add(pole);

  // Tray: a shallow open cylinder with a floor.
  const trayH = BASKET.trayTop - BASKET.trayBottom;
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(BASKET.trayRadius, BASKET.trayRadius * 0.92, trayH, 16, 1, true), metal);
  tray.material.side = THREE.DoubleSide;
  tray.position.y = BASKET.trayBottom + trayH / 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(BASKET.trayRadius * 0.92, 16).rotateX(-Math.PI / 2), metal);
  floor.position.y = BASKET.trayBottom;
  g.add(tray, floor);

  // Yellow band at the top, with a little cap.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(BASKET.bandRadius, BASKET.bandRadius, 0.08, 16, 1, true), lambert(COLORS.basketBand));
  band.material.side = THREE.DoubleSide;
  band.position.y = BASKET.bandTop - 0.04;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.08, 10), lambert(COLORS.basketBand));
  cap.position.y = BASKET.bandTop + 0.06;
  g.add(band, cap);

  // Chains: two rings of drooping strands from the band to the pole. Each vertex remembers how far
  // down its strand it is and which strand, so the chains can swing when a disc hits them.
  const pts: number[] = [];
  const along: number[] = [];
  const strand: number[] = [];
  let strandIndex = 0;
  for (const [count, r] of [
    [16, BASKET.chainRadius],
    [10, BASKET.chainRadius * 0.55],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r;
      const segs = 6;
      for (let s = 0; s < segs; s++) {
        for (const k of [s, s + 1]) {
          const f = k / segs;
          const rr = r * (1 - f) + 0.04 * f;
          const y = BASKET.bandTop - 0.06 - f * (BASKET.bandTop - 0.06 - BASKET.chainBottom) - Math.sin(f * Math.PI) * 0.04;
          pts.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
          along.push(Math.sin(f * Math.PI));
          strand.push(strandIndex);
        }
      }
      strandIndex++;
    }
  }
  const chainGeo = new THREE.BufferGeometry();
  chainGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(chainGeo, new THREE.LineBasicMaterial({ color: COLORS.chain })));

  const rest = Float32Array.from(pts);
  let energy = 0;
  let push = new THREE.Vector2(1, 0);
  let clock = 0;
  /** Swing the chains: strength 0..1, pushed along a horizontal direction (basket-local x, z). */
  g.userData.hitChains = (strength: number, dx = 1, dz = 0) => {
    energy = Math.min(1.2, energy + strength);
    push = new THREE.Vector2(dx, dz).normalize();
  };
  g.userData.update = (dt: number) => {
    if (energy <= 0.001) return;
    clock += dt;
    energy *= Math.exp(-dt * 2.2);
    const pos = chainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const w = Math.sin(clock * 16 + strand[i] * 1.7) * 0.06 * energy * along[i];
      const swing = Math.sin(clock * 7) * 0.05 * energy * along[i];
      pos.setXYZ(i, rest[i * 3] + push.x * swing + w * 0.6, rest[i * 3 + 1], rest[i * 3 + 2] + push.y * swing + w * 0.4);
    }
    pos.needsUpdate = true;
  };

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

export function placeBasket(hole: Hole): THREE.Group {
  const b = buildBasket();
  b.position.set(hole.world.basket.x, hole.world.basket.base, hole.world.basket.z);
  return b;
}

/** Tee pad (the sign is in decor.ts). */
export function buildTee(hole: Hole): THREE.Group {
  const g = new THREE.Group();
  const tee = hole.def.tees[0];
  const base = mapToWorld(tee.pos, hole.world.groundHeight(tee.pos[0], -tee.pos[1]));
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 4.2), lambert(SURFACE_COLOR.tee));
  pad.position.set(base.x, base.y + 0.04, base.z + 1.5);
  pad.receiveShadow = true;
  g.add(pad);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** White stakes along the OB lines that border play. */
export function buildOBStakes(hole: Hole): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.08, 0.7, 0.08);
  const mat = lambert(COLORS.obStake);
  const { minX, maxX, minY, maxY } = hole.def.bounds;
  for (const ob of hole.def.ob) {
    const poly = ob.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a: MapPoint = poly[i];
      const b: MapPoint = poly[(i + 1) % poly.length];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6);
      for (let k = 0; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        const y = a[1] + ((b[1] - a[1]) * k) / n;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        // Only stakes on lines that border in-bounds ground.
        const inBoundsNearby = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([dx, dy]) => !hole.world.isOB(x + dx, -(y + dy)));
        if (!inBoundsNearby) continue;
        const s = new THREE.Mesh(geo, mat);
        s.position.set(x, hole.world.groundHeight(x, -y) + 0.35, -y);
        s.castShadow = true;
        g.add(s);
      }
    }
  }
  return g;
}

/** Paint a disc mesh: its color, a darker rim, and a white stamp off-center on top so you can see
 *  it spin. */
export function paintDisc(mesh: THREE.Mesh, color: string): void {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color);
  const rim = base.clone().multiplyScalar(0.72);
  const stamp = new THREE.Color('#ffffff');
  for (let f = 0; f < pos.count; f += 3) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += pos.getX(f + k) / 3;
      y += pos.getY(f + k) / 3;
      z += pos.getZ(f + k) / 3;
    }
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    let c = base;
    if (r > 0.094) c = rim;
    else if (y > 0.012 && r > 0.022 && r < 0.078 && a > 0.2 && a < 1.5) c = stamp;
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** A disc: a lathe profile, slightly domed. */
export function buildDiscMesh(disc: Disc): THREE.Mesh {
  const profile = [
    [0, 0.016],
    [0.06, 0.017],
    [0.092, 0.012],
    [0.105, 0.0],
    [0.1, -0.009],
    [0.088, -0.011],
    [0.07, -0.004],
    [0, -0.004],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 28).toNonIndexed();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  paintDisc(mesh, disc.color);
  mesh.castShadow = true;
  return mesh;
}
