// Dev only: the thrower's poses side by side, seen from behind (top row) and from above (bottom
// row). Target is up the screen / away from the camera. Columns: BH reach, BH release, BH follow,
// FH reach, FH release, FH follow.

import * as THREE from 'three';
import { buildThrower, poseThrower } from '../src/world/props';

const W = 1200;
const H = 520;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe8e4');
scene.add(new THREE.HemisphereLight('#ffffff', '#557755', 2));
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const poses: [number, number, 'backhand' | 'forehand'][] = [
  [1, 0, 'backhand'],
  [0, 0.5, 'backhand'],
  [0, 1, 'backhand'],
  [1, 0, 'forehand'],
  [0, 0.5, 'forehand'],
  [0, 1, 'forehand'],
];
const throwers = poses.map(([r, f, s], i) => {
  const t = buildThrower();
  poseThrower(t, r, f, s);
  t.position.x = i * 10;
  scene.add(t);
  // A stick pointing at the target.
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.2), new THREE.MeshBasicMaterial({ color: '#ff3d8b' }));
  arrow.position.set(i * 10, 0.02, -1.2);
  scene.add(arrow);
  return t;
});

const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const cw = W / poses.length;
throwers.forEach((t, i) => {
  for (const [row, pos] of [
    [0, new THREE.Vector3(t.position.x, 1.6, 4)],
    [1, new THREE.Vector3(t.position.x, 6, 0.01)],
  ] as const) {
    cam.aspect = cw / (H / 2);
    cam.position.copy(pos);
    cam.lookAt(t.position.x, row === 0 ? 1.1 : 0, row === 0 ? 0 : 0);
    cam.updateProjectionMatrix();
    const y = row === 0 ? H / 2 : 0;
    renderer.setViewport(i * cw, y, cw, H / 2);
    renderer.setScissor(i * cw, y, cw, H / 2);
    renderer.render(scene, cam);
  }
});
