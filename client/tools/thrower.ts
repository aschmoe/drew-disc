// Dev only: every key pose of the thrower, seen from behind (top row) and from above (bottom
// row). The target is away from the camera / up the screen (pink stick).

import * as THREE from 'three';
import { Character, RELEASE_AT, type ThrowAnim } from '../src/world/character';

const poses: { label: string; style: ThrowAnim; reach: number; follow: number | null }[] = [
  { label: 'Rest', style: 'backhand', reach: 0, follow: null },
  { label: 'BH reach', style: 'backhand', reach: 1, follow: null },
  { label: 'BH release', style: 'backhand', reach: 0, follow: RELEASE_AT },
  { label: 'BH follow', style: 'backhand', reach: 0, follow: 1 },
  { label: 'FH reach', style: 'forehand', reach: 1, follow: null },
  { label: 'FH release', style: 'forehand', reach: 0, follow: RELEASE_AT },
  { label: 'FH follow', style: 'forehand', reach: 0, follow: 1 },
  { label: 'Putt reach', style: 'putt', reach: 1, follow: null },
  { label: 'Putt release', style: 'putt', reach: 0, follow: RELEASE_AT },
];

const W = 1350;
const H = 560;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe8e4');
scene.add(new THREE.HemisphereLight('#ffffff', '#557755', 2));
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.position.set(3, 6, 4);
scene.add(sun);

const xs = poses.map((p, i) => {
  const c = new Character();
  c.pose(p.style, p.reach, p.follow, 0);
  c.root.position.x = i * 10;
  scene.add(c.root);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.2), new THREE.MeshBasicMaterial({ color: '#ff3d8b' }));
  stick.position.set(i * 10, 0.02, -1.4);
  scene.add(stick);
  return i * 10;
});

const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const cw = W / poses.length;
xs.forEach((x, i) => {
  for (const row of [0, 1]) {
    cam.aspect = cw / (H / 2);
    if (row === 0) cam.position.set(x + 1.2, 1.5, 4);
    else cam.position.set(x, 6.5, 0.01);
    cam.lookAt(x, row === 0 ? 0.95 : 0, 0);
    cam.updateProjectionMatrix();
    const y = row === 0 ? H / 2 : 0;
    renderer.setViewport(i * cw, y, cw, H / 2);
    renderer.setScissor(i * cw, y, cw, H / 2);
    renderer.render(scene, cam);
  }
});

const labels = document.createElement('div');
labels.style.cssText = `display:grid;grid-template-columns:repeat(${poses.length},1fr);width:${W}px;text-align:center;font:12px system-ui`;
labels.innerHTML = poses.map((p) => `<div>${p.label}</div>`).join('');
document.body.append(labels);
