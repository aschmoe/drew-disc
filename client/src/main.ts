import * as THREE from 'three';
import { buildHole, loadCourse, loadHoleDef } from './content/hole';
import { Game } from './game/game';
import { createScene } from './world/scene';
import { buildGround, buildPath } from './world/terrain';
import { buildTrees } from './world/trees';
import { buildOBStakes, buildTee, placeBasket } from './world/props';

async function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);

  const course = await loadCourse('seatac');
  const def = await loadHoleDef('seatac', course.holes[0]);
  const hole = buildHole(def);

  const { scene, sun } = createScene(course.environment);
  scene.add(buildGround(hole), buildPath(hole), buildTrees(hole.trees), placeBasket(hole), buildTee(hole), buildOBStakes(hole));

  const game = new Game(hole, course, scene, camera, sun, ui, canvas);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones get a wider vertical field of view so the fairway still fits.
    camera.fov = w < h ? 70 : 55;
    // Shift the picture up a little so the thrower sits above the throw pad.
    camera.setViewOffset(w, h, 0, h * 0.12, w, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.tick(dt);
    renderer.render(scene, camera);
  });

  document.getElementById('loading')?.remove();
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = `Something went wrong: ${err.message}`;
});
