import * as THREE from 'three';
import { buildHole, loadCourse, loadHoleDef } from './content/hole';
import { Sound } from './audio/sound';
import { Game } from './game/game';
import { createScene } from './world/scene';
import { buildDecor, buildSkyDressing, buildTeeSign, buildWindFlag } from './world/decor';
import { buildGround, buildOuterGround, buildPath } from './world/terrain';
import { buildTrees } from './world/trees';
import { JetFlyovers } from './world/jets';
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
  const trees = buildTrees(hole.trees);
  const basket = placeBasket(hole);
  const flag = buildWindFlag(hole);
  const sky = buildSkyDressing(course.environment, def.tees[0].pos);
  scene.add(
    buildOuterGround(hole),
    buildGround(hole),
    buildPath(hole),
    trees,
    buildDecor(hole),
    basket,
    buildTee(hole),
    buildTeeSign(hole),
    buildOBStakes(hole),
    flag.object,
    sky.object,
  );

  const b = hole.world.basket;
  const jets = new JetFlyovers(new THREE.Vector3(b.x / 2, 0, b.z / 2), sun.position.clone().sub(sun.target.position).normalize());
  scene.add(jets.object);

  const game = new Game(hole, course, scene, camera, sun, ui, canvas, basket);

  // Sound starts on the first tap or key (browsers require a gesture).
  const sound = new Sound();
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  game.onFlightEvent = (e, speed) => sound.event(e.kind, speed);
  game.onCelebrate = (ace) => sound.fanfare(ace);
  ui.append(muteButton(sound));

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
    const t = now / 1000;
    trees.userData.update?.(t);
    flag.update(t, game.windNow);
    sky.update(t, game.windNow);
    jets.update(dt);
    sound.update(dt);
    sound.setJetProximity(jets.proximity(camera.position));
    renderer.render(scene, camera);
  });

  document.getElementById('loading')?.remove();
}

const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function muteButton(sound: Sound): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'mute-btn';
  const render = () => {
    b.innerHTML = sound.isMuted ? SPEAKER_OFF : SPEAKER_ON;
    b.setAttribute('aria-label', sound.isMuted ? 'Turn sound on' : 'Turn sound off');
  };
  b.onclick = () => {
    sound.unlock();
    sound.setMuted(!sound.isMuted);
    render();
  };
  render();
  return b;
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = `Something went wrong: ${err.message}`;
});
