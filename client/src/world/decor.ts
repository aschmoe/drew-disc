// Set dressing: everything that makes the hole feel like a place but doesn't change play.
// Grass tufts, wildflowers, blackberries on the brambles, rocks, the fence and houses past the
// west OB line, road markings, drifting clouds, Mount Rainier to the southeast, the tee sign and a
// wind flag. All seeded, all instanced where there are many.

import * as THREE from 'three';
import type { EnvironmentDef, Hole } from '../content/hole';
import { headingToDir, mapToWorld, type MapPoint } from '../sim/frame';
import { createRng } from '../sim/rng';
import type { Wind } from '../sim/flight';

export interface Animated {
  object: THREE.Object3D;
  update(time: number, wind: Wind): void;
}

const lambert = (color: string, opts: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

interface Placement {
  x: number;
  y: number;
  z: number;
  s: number;
  sy?: number;
  rot: number;
  color: string;
}

function instances(geo: THREE.BufferGeometry, material: THREE.Material, items: Placement[], shadows = false): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  mesh.count = items.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
    m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.sy ?? it.s, it.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(it.color));
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** Three crossed blades: a grass tuft. */
function tuftGeometry(): THREE.BufferGeometry {
  const blade = (angle: number, lean: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.04, 0, 0, 0.04, 0, 0, lean, 1, 0], 3));
    g.rotateY(angle);
    return g;
  };
  const parts = [blade(0, 0.05), blade(2.1, -0.06), blade(4.2, 0.03)];
  const pos: number[] = [];
  for (const p of parts) pos.push(...(p.attributes.position.array as Float32Array));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildDecor(hole: Hole): THREE.Group {
  const group = new THREE.Group();
  const rng = createRng(2024);
  const { bounds } = hole.def;
  const w = hole.world;
  const inPlay = (mx: number, my: number) => !w.isOB(mx, -my);
  const surface = (mx: number, my: number) => w.surfaceAt(mx, -my);
  const ground = (mx: number, my: number) => w.groundHeight(mx, -my);
  const nearTrunk = (mx: number, my: number, r: number) =>
    w.treesNear(mx, -my).some((t) => t.trunkHeight > 0 && Math.hypot(mx - t.x, -my - t.z) < t.trunkRadius + r);

  // Grass tufts: thick in the rough, a few along the fairway edges, none on the path or tee.
  const tufts: Placement[] = [];
  const grassColors = ['#6aa443', '#7db552', '#5a9238', '#8cc05c'];
  for (let i = 0; i < 4200 && tufts.length < 2200; i++) {
    const mx = rng.range(bounds.minX, bounds.maxX);
    const my = rng.range(bounds.minY, bounds.maxY);
    const s = surface(mx, my);
    if (s === 'path' || s === 'tee' || s === 'green' || !inPlay(mx, my)) continue;
    if (s === 'fairway' && rng.next() > 0.12) continue;
    tufts.push({ x: mx, y: ground(mx, my), z: -my, s: rng.range(0.18, 0.38), rot: rng.range(0, 6.3), color: grassColors[i % grassColors.length] });
  }
  group.add(instances(tuftGeometry(), lambert('#ffffff', { side: THREE.DoubleSide }), tufts));

  // Wildflowers in the rough.
  const flowers: Placement[] = [];
  const flowerColors = ['#ffffff', '#ffe14d', '#f5f0ff', '#c9a6ff', '#ffd1e6'];
  for (let i = 0; i < 2000 && flowers.length < 320; i++) {
    const mx = rng.range(bounds.minX, bounds.maxX);
    const my = rng.range(bounds.minY, bounds.maxY);
    if (surface(mx, my) !== 'rough' || !inPlay(mx, my)) continue;
    flowers.push({ x: mx, y: ground(mx, my) + rng.range(0.12, 0.22), z: -my, s: rng.range(0.045, 0.075), rot: 0, color: flowerColors[i % flowerColors.length] });
  }
  group.add(instances(new THREE.IcosahedronGeometry(1, 0), lambert('#ffffff'), flowers));

  // Blackberries on the bramble bushes.
  const berries: Placement[] = [];
  for (const t of hole.trees) {
    if (t.kind !== 'bush') continue;
    const br = createRng(t.seed * 31 + 7);
    for (let k = 0; k < 5; k++) {
      const a = br.range(0, Math.PI * 2);
      const up = br.range(0.1, 0.8);
      berries.push({
        x: t.x + Math.cos(a) * t.canopyRx * 0.95 * Math.cos(up),
        y: t.base + t.canopyY * 0.8 + t.canopyRy * Math.sin(up) * 0.9,
        z: t.z + Math.sin(a) * t.canopyRx * 0.95 * Math.cos(up),
        s: 0.05,
        rot: 0,
        color: br.next() < 0.6 ? '#2a1330' : '#7a1f3d',
      });
    }
  }
  group.add(instances(new THREE.IcosahedronGeometry(1, 0), lambert('#ffffff'), berries));

  // Rocks scattered off the fairway.
  const rocks: Placement[] = [];
  for (let i = 0; i < 400 && rocks.length < 28; i++) {
    const mx = rng.range(-40, 40);
    const my = rng.range(-4, 130);
    const s = surface(mx, my);
    if (s === 'fairway' || s === 'path' || s === 'tee' || s === 'green' || !inPlay(mx, my) || nearTrunk(mx, my, 1)) continue;
    const size = rng.range(0.15, 0.55);
    rocks.push({ x: mx, y: ground(mx, my) + size * 0.25, z: -my, s: size, sy: size * 0.6, rot: rng.range(0, 6.3), color: rng.next() < 0.5 ? '#9a9c95' : '#85887f' });
  }
  group.add(instances(new THREE.DodecahedronGeometry(1, 0), lambert('#ffffff'), rocks, true));

  group.add(buildFenceAndHouses(hole, rng), buildRoadMarkings(hole));
  return group;
}

/** A wooden fence along the west property line, with backyards and houses beyond it. */
function buildFenceAndHouses(hole: Hole, rng: ReturnType<typeof createRng>): THREE.Group {
  const g = new THREE.Group();
  const property = hole.def.ob.find((o) => o.label === 'Private property');
  if (!property) return g;
  const fenceX = Math.max(...property.polygon.map((p) => p[0]));
  const y0 = hole.def.bounds.minY + 24;
  const y1 = hole.def.bounds.maxY - 4;
  const posts: Placement[] = [];
  const rails: Placement[] = [];
  for (let y = y0; y <= y1; y += 2.4) {
    const h = hole.world.groundHeight(fenceX, -y);
    posts.push({ x: fenceX, y: h + 0.6, z: -y, s: 1, rot: 0, color: '#8a6a4c' });
    if (y + 2.4 <= y1) {
      for (const ry of [0.45, 0.95]) rails.push({ x: fenceX, y: h + ry, z: -(y + 1.2), s: 1, rot: 0, color: '#9c7a58' });
    }
  }
  g.add(instances(new THREE.BoxGeometry(0.12, 1.2, 0.12), lambert('#ffffff'), posts, true));
  g.add(instances(new THREE.BoxGeometry(0.06, 0.1, 2.4), lambert('#ffffff'), rails, true));

  const walls = ['#e9dcc8', '#c9d7e3', '#e7cfc4', '#d9e3cf', '#f0e6c2'];
  for (let i = 0; i < 6; i++) {
    const y = y0 + 12 + i * 22 + rng.range(-3, 3);
    const x = fenceX - rng.range(16, 24);
    const wdt = rng.range(8, 11);
    const dep = rng.range(9, 12);
    const h = rng.range(3.4, 4.6);
    const base = hole.world.groundHeight(x, -y);
    const house = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(wdt, h, dep), lambert(walls[i % walls.length]));
    body.position.y = h / 2;
    const roofGeo = new THREE.CylinderGeometry(0.01, wdt * 0.72, 2.6, 4, 1).rotateY(Math.PI / 4);
    roofGeo.scale(1, 1, dep / wdt);
    const roof = new THREE.Mesh(roofGeo, lambert(i % 2 ? '#5b4a44' : '#4c5560'));
    roof.position.y = h + 1.3;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 1), lambert('#6d4c3d'));
    door.position.set(wdt / 2 + 0.03, 1, 0);
    house.add(body, roof, door);
    for (const dz of [-dep / 3.2, dep / 3.2]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.3), lambert('#9cc3d6'));
      win.position.set(wdt / 2 + 0.03, h * 0.58, dz);
      house.add(win);
    }
    house.position.set(x, base, -y);
    house.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.add(house);
  }
  return g;
}

/** Center and edge lines on the road behind the tee. */
function buildRoadMarkings(hole: Hole): THREE.Group {
  const g = new THREE.Group();
  const road = hole.def.ob.find((o) => o.label === 'Road');
  if (!road) return g;
  const top = Math.max(...road.polygon.map((p) => p[1]));
  const { minX, maxX } = hole.def.bounds;
  const dashes: Placement[] = [];
  for (let x = minX; x < maxX; x += 6) dashes.push({ x: x + 1.5, y: 0.02, z: -(top - 7.5), s: 1, rot: 0, color: '#f2c230' });
  const edges: Placement[] = [];
  for (const y of [top - 1.2, top - 13.8]) edges.push({ x: (minX + maxX) / 2, y: 0.02, z: -y, s: 1, rot: 0, color: '#eeeeea' });
  g.add(instances(new THREE.BoxGeometry(3, 0.02, 0.14), lambert('#ffffff'), dashes));
  const edge = instances(new THREE.BoxGeometry(maxX - minX, 0.02, 0.12), lambert('#ffffff'), edges);
  g.add(edge);
  return g;
}

/** Sky dressing: drifting low-poly clouds and Mount Rainier on the southeast horizon. */
export function buildSkyDressing(env: EnvironmentDef, origin: MapPoint): Animated {
  const group = new THREE.Group();
  const rng = createRng(77);
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false, emissive: '#c9d6e0', emissiveIntensity: 0.55 });
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rng.next() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(blob, cloudMat);
      const s = rng.range(14, 26);
      m.scale.set(s * 1.4, s * 0.55, s);
      m.position.set(k * s * 1.3 - n * s * 0.6, rng.range(-3, 4), rng.range(-6, 6));
      c.add(m);
    }
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(150, 650);
    c.position.set(origin[0] + Math.cos(a) * r, rng.range(130, 210), -origin[1] + Math.sin(a) * r);
    c.rotation.y = rng.range(0, Math.PI);
    clouds.push(c);
    group.add(c);
  }

  // Mount Rainier. Really about 130 degrees from SeaTac; nudged south (and not to scale) so it
  // shows up behind the basket in the Look view, which faces back down the fairway.
  const dir = headingToDir(165);
  const mountain = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.ConeGeometry(520, 330, 11, 3), new THREE.MeshLambertMaterial({ color: '#8fa3b8', flatShading: true, fog: false }));
  const shoulder = new THREE.Mesh(new THREE.ConeGeometry(300, 200, 9, 2), new THREE.MeshLambertMaterial({ color: '#9aaec2', flatShading: true, fog: false }));
  shoulder.position.set(260, -60, 60);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(205, 132, 11, 1), new THREE.MeshLambertMaterial({ color: '#f4f8fc', flatShading: true, fog: false }));
  snow.position.y = 100;
  mountain.add(rock, shoulder, snow);
  mountain.position.set(origin[0] + dir.x * 1050, 40, -origin[1] + dir.z * 1050);
  group.add(mountain);
  void env;

  return {
    object: group,
    update(time, wind) {
      const drift = headingToDir(wind.towardDeg);
      clouds.forEach((c, i) => {
        c.position.x += drift.x * (0.6 + wind.speed * 0.4) * 0.016 * (1 + (i % 3) * 0.2);
        c.position.z += drift.z * (0.6 + wind.speed * 0.4) * 0.016 * (1 + (i % 3) * 0.2);
        // Wrap around so the sky never empties.
        const dx = c.position.x - origin[0];
        const dz = c.position.z + origin[1];
        if (Math.hypot(dx, dz) > 750) c.position.set(origin[0] - dx * 0.9, c.position.y, -origin[1] - dz * 0.9);
      });
      void time;
    },
  };
}

/** The tee sign: hole number, par, distance, and a birthday wish. */
export function buildTeeSign(hole: Hole): THREE.Group {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#24533a';
  c.fillRect(0, 0, 512, 384);
  c.strokeStyle = '#f2c230';
  c.lineWidth = 12;
  c.strokeRect(10, 10, 492, 364);
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.font = '900 150px system-ui, sans-serif';
  c.fillText(String(hole.def.number), 140, 190);
  c.textAlign = 'left';
  c.font = '800 46px system-ui, sans-serif';
  c.fillText(`Par ${hole.def.par}`, 260, 120);
  c.fillText(`${hole.def.lengthFt} ft`, 260, 180);
  c.fillStyle = '#f2c230';
  c.textAlign = 'center';
  c.font = '800 40px system-ui, sans-serif';
  c.fillText('Happy Birthday Drew!', 256, 290);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.font = '600 26px system-ui, sans-serif';
  c.fillText('North SeaTac Park', 256, 340);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const tee = hole.def.tees[0];
  const base = mapToWorld(tee.pos, hole.world.groundHeight(tee.pos[0], -tee.pos[1]));
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.06), [
    lambert('#3b2c22'),
    lambert('#3b2c22'),
    lambert('#3b2c22'),
    lambert('#3b2c22'),
    new THREE.MeshLambertMaterial({ map: tex }),
    lambert('#3b2c22'),
  ]);
  board.position.y = 1.35;
  const postGeo = new THREE.BoxGeometry(0.09, 1.4, 0.09);
  for (const dx of [-0.45, 0.45]) {
    const p = new THREE.Mesh(postGeo, lambert('#6d5440'));
    p.position.set(dx, 0.7, -0.05);
    g.add(p);
  }
  g.add(board);
  g.position.set(base.x - 2.6, base.y, base.z - 1.2);
  g.rotation.y = -0.45;
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** A pink flag on a pole beside the tee, streaming in the wind. */
export function buildWindFlag(hole: Hole): Animated {
  const tee = hole.def.tees[0];
  const base = mapToWorld(tee.pos, hole.world.groundHeight(tee.pos[0], -tee.pos[1]));
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.8, 6), lambert('#d9dde0'));
  pole.position.y = 1.4;
  pole.castShadow = true;
  const cloth = new THREE.PlaneGeometry(0.6, 0.38, 8, 3).translate(0.3, 0, 0);
  const flag = new THREE.Mesh(cloth, new THREE.MeshLambertMaterial({ color: '#ff3d8b', side: THREE.DoubleSide, flatShading: true }));
  flag.position.y = 2.6;
  flag.castShadow = true;
  const holder = new THREE.Group();
  holder.add(flag);
  g.add(pole, holder);
  // Ahead of the tee on the left, where the thrower sees it while lining up.
  g.position.set(base.x - 4.2, hole.world.groundHeight(base.x - 4.2, base.z - 9), base.z - 9);
  const rest = Float32Array.from(cloth.attributes.position.array as Float32Array);

  return {
    object: g,
    update(time, wind) {
      // Point the flag downwind; a calm day lets it hang.
      const toward = headingToDir(wind.towardDeg);
      holder.rotation.y = Math.atan2(-toward.z, toward.x);
      const strength = Math.min(1, wind.speed / 4);
      const pos = cloth.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        const y = rest[i * 3 + 1];
        const droop = (1 - strength) * x * 0.9;
        pos.setXYZ(i, x * (0.35 + 0.65 * strength), y - droop, Math.sin(time * 6 - x * 7) * 0.08 * x * (0.3 + strength));
      }
      pos.needsUpdate = true;
      cloth.computeVertexNormals();
    },
  };
}

