// Dev only: the jet model from below-front (as seen from the tee) and from the side.
import * as THREE from 'three';
import { buildJet, LIVERIES } from '../src/world/jets';

const W = 1000;
const H = 420;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc1db');
scene.add(new THREE.HemisphereLight('#dfefff', '#4a6b3a', 1.1));
const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
sun.position.set(-60, 80, 90);
scene.add(sun);
const jet = buildJet(LIVERIES[0]);
jet.rotation.y = Math.PI;
scene.add(jet);
const cam = new THREE.PerspectiveCamera(35, W / 2 / H, 1, 1000);
for (const [i, pos] of [new THREE.Vector3(-25, -45, 70), new THREE.Vector3(80, 4, 0)].entries()) {
  cam.position.copy(pos);
  cam.lookAt(0, 0, 0);
  renderer.setViewport((i * W) / 2, 0, W / 2, H);
  renderer.setScissor((i * W) / 2, 0, W / 2, H);
  renderer.render(scene, cam);
}
