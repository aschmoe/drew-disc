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

  // Chains: two rings of drooping strands from the band to the pole.
  const pts: number[] = [];
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
        }
      }
    }
  }
  const chainGeo = new THREE.BufferGeometry();
  chainGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(chainGeo, new THREE.LineBasicMaterial({ color: COLORS.chain })));

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

/** Tee pad and tee sign. */
export function buildTee(hole: Hole): THREE.Group {
  const g = new THREE.Group();
  const tee = hole.def.tees[0];
  const base = mapToWorld(tee.pos, hole.world.groundHeight(tee.pos[0], -tee.pos[1]));
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 4.2), lambert(SURFACE_COLOR.tee));
  pad.position.set(base.x, base.y + 0.04, base.z + 1.5);
  pad.receiveShadow = true;
  g.add(pad);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), lambert(COLORS.trunk));
  post.position.set(base.x - 2.6, base.y + 0.6, base.z - 3);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), lambert('#2e5d3b'));
  board.position.set(base.x - 2.6, base.y + 1.35, base.z - 3);
  board.rotation.y = 0.5;
  g.add(post, board);
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
  const geo = new THREE.LatheGeometry(profile, 20);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: disc.color, flatShading: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  return mesh;
}

/** Placeholder thrower until the rigged character arrives in the art pass. The upper body and
 *  throwing arm are separate pivots so poseThrower can wind up and follow through. */
export function buildThrower(shirt: string = COLORS.shirt): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.55, 4, 8), lambert(COLORS.shorts));
  legs.position.y = 0.45;

  const upper = new THREE.Group();
  upper.name = 'upper';
  upper.position.y = 0.8;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.45, 4, 8), lambert(shirt));
  body.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), lambert(COLORS.skin));
  head.position.y = 0.82;
  const shoulder = new THREE.Group();
  shoulder.name = 'arm';
  shoulder.position.set(0.27, 0.55, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 6), lambert(shirt));
  arm.position.y = -0.3;
  shoulder.add(arm);
  upper.add(body, head, shoulder);

  g.add(legs, upper);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  poseThrower(g, 0, 0, 'backhand');
  return g;
}

/**
 * Pose the thrower. reach: 0 = standing, 1 = full reach-back. follow: 0..1 through the release
 * and follow-through. Backhand coils one way, forehand the other.
 */
export function poseThrower(g: THREE.Group, reach: number, follow: number, style: 'backhand' | 'forehand'): void {
  const upper = g.getObjectByName('upper')!;
  const arm = g.getObjectByName('arm')!;
  const dir = style === 'backhand' ? 1 : -1;
  // Coil, then unwind past square on the follow-through.
  const swing = follow > 0 ? Math.sin(Math.min(1, follow) * Math.PI * 0.5) : 0;
  const coil = reach * (1 - swing) - swing * 0.9;
  upper.rotation.y = dir * coil * 1.1;
  // Arm: hangs at rest, swings out level for the reach and the release.
  const lift = Math.max(reach, swing > 0 ? 1 - Math.abs(swing - 0.5) : 0);
  arm.rotation.z = lift * 1.45 * (style === 'backhand' ? 1 : 0.9);
  arm.rotation.x = -0.25 - lift * 0.2;
  arm.rotation.y = style === 'backhand' ? reach * 0.9 * (1 - swing) : -reach * 0.4;
}
