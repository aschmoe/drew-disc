import * as THREE from 'three';
import type { TreeInstance, TreeKind } from '../content/hole';
import { createRng } from '../sim/rng';
import { COLORS } from './palette';

interface Part {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  color: string;
}

/** Every tree on the hole as a handful of instanced meshes (a few draw calls for hundreds of trees). */
export function buildTrees(trees: TreeInstance[]): THREE.Group {
  const trunks: Part[] = [];
  const blobs: Part[] = [];
  const cones: Part[] = [];

  for (const t of trees) {
    const rng = createRng(t.seed * 9973 + 17);
    const pick = (list: string[]) => list[Math.floor(rng.next() * list.length)];
    const y0 = t.base;
    switch (t.kind as TreeKind) {
      case 'leafy':
      case 'young': {
        const r = t.kind === 'leafy' ? t.trunkRadius : t.trunkRadius * 1.4;
        trunks.push({ x: t.x, y: y0, z: t.z, sx: r, sy: t.canopyY, sz: r, rotY: 0, color: COLORS.trunk });
        const colors = t.kind === 'leafy' ? COLORS.leafy : COLORS.young;
        const n = t.kind === 'leafy' ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const main = i === 0;
          const s = main ? 1 : rng.range(0.55, 0.75);
          const a = rng.range(0, Math.PI * 2);
          const off = main ? 0 : t.canopyRx * rng.range(0.35, 0.6);
          blobs.push({
            x: t.x + Math.cos(a) * off,
            y: y0 + t.canopyY + (main ? 0 : rng.range(-0.3, 0.45) * t.canopyRy),
            z: t.z + Math.sin(a) * off,
            sx: t.canopyRx * s,
            sy: t.canopyRy * s,
            sz: t.canopyRx * s * rng.range(0.85, 1.1),
            rotY: rng.range(0, Math.PI * 2),
            color: pick(colors),
          });
        }
        break;
      }
      case 'fir': {
        trunks.push({ x: t.x, y: y0, z: t.z, sx: t.trunkRadius, sy: t.height * 0.5, sz: t.trunkRadius, rotY: 0, color: COLORS.trunk });
        const color = pick(COLORS.fir);
        const bottom = y0 + t.trunkHeight;
        const tiers = 4;
        const span = t.height - t.trunkHeight;
        for (let i = 0; i < tiers; i++) {
          const f = i / tiers;
          const r = t.canopyRx * (1 - f * 0.7);
          const h = (span / tiers) * 1.7;
          cones.push({ x: t.x, y: bottom + f * span * 0.85 + h / 2, z: t.z, sx: r, sy: h, sz: r, rotY: rng.range(0, Math.PI), color });
        }
        break;
      }
      case 'bush': {
        const n = rng.next() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2);
          const off = i === 0 ? 0 : t.canopyRx * 0.6;
          blobs.push({
            x: t.x + Math.cos(a) * off,
            y: y0 + t.canopyY * 0.8,
            z: t.z + Math.sin(a) * off,
            sx: t.canopyRx * (i === 0 ? 1 : 0.7),
            sy: t.canopyRy,
            sz: t.canopyRx * (i === 0 ? 1.1 : 0.75),
            rotY: rng.range(0, Math.PI * 2),
            color: pick(COLORS.bush),
          });
        }
        break;
      }
    }
  }

  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0);
  const blobGeo = new THREE.IcosahedronGeometry(1, 1);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  group.add(instanced(trunkGeo, trunks), instanced(blobGeo, blobs), instanced(coneGeo, cones));
  return group;
}

function instanced(geo: THREE.BufferGeometry, parts: Part[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(parts.length, 1));
  mesh.count = parts.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  parts.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx, p.sy, p.sz));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(p.color));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
