import * as THREE from 'three';
import { buildHole, loadCourse, loadHoleDef, type EnvironmentDef, type Hole } from './content/hole';
import { Sound } from './audio/sound';
import { Game } from './game/game';
import { Session } from './game/session';
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
  const { scene, sun } = createScene(course.environment);
  // Phones: a smaller shadow map is plenty at that screen size and saves GPU time.
  if (Math.min(window.innerWidth, window.innerHeight) < 600) sun.shadow.mapSize.set(1024, 1024);
  const sunDir = sun.position.clone().sub(sun.target.position).normalize();

  // Everything that belongs to one hole lives in one group, so moving to the next hole swaps it.
  let file = course.holes[0];
  let def = await loadHoleDef('seatac', file);
  let hole = buildHole(def);
  let parts = buildHoleScene(hole, course.environment, sunDir);
  let sign = buildTeeSign(hole);
  scene.add(parts.group, sign);

  const game = new Game(hole, course, scene, camera, sun, ui, canvas, parts.basket);
  const debug = new URLSearchParams(location.search).has('debug');

  /** Show hole `number` of a round, played on hole file `next`. Rebuilds the scene if the file changed. */
  const showHole = async (next: string, number: number) => {
    if (next !== file) {
      const nextDef = await loadHoleDef('seatac', next);
      file = next;
      def = nextDef;
      hole = buildHole(def);
      scene.remove(parts.group);
      disposeTree(parts.group);
      parts = buildHoleScene(hole, course.environment, sunDir);
      scene.add(parts.group);
      game.setHole(hole, parts.basket);
    }
    scene.remove(sign);
    disposeTree(sign);
    sign = buildTeeSign(hole, number);
    scene.add(sign);
  };
  const session = new Session(game, course, showHole, ui, (t) => game.toast(t), debug);
  // Debug builds expose the renderer so draw calls and triangles can be checked from the console.
  if (debug) (window as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer;

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
    parts.trees.userData.update?.(t);
    parts.flag.update(t, game.windNow);
    parts.sky.update(t, game.windNow);
    parts.jets.update(dt);
    sound.update(dt);
    sound.setJetProximity(parts.jets.proximity(camera.position));
    renderer.render(scene, camera);
  });

  document.getElementById('loading')?.remove();
  session.start();
}

/** The scenery of one hole: ground, trees, basket, tee, flag, sky dressing and the jets over it. */
function buildHoleScene(hole: Hole, env: EnvironmentDef, sunDir: THREE.Vector3) {
  const trees = buildTrees(hole.trees);
  const basket = placeBasket(hole);
  const flag = buildWindFlag(hole);
  const sky = buildSkyDressing(env, hole.def.tees[0].pos);
  const b = hole.world.basket;
  const jets = new JetFlyovers(new THREE.Vector3(b.x / 2, 0, b.z / 2), sunDir);
  const group = new THREE.Group();
  group.add(
    buildOuterGround(hole),
    buildGround(hole),
    buildPath(hole),
    trees,
    buildDecor(hole),
    basket,
    buildTee(hole),
    buildOBStakes(hole),
    flag.object,
    sky.object,
    jets.object,
  );
  return { group, trees, basket, flag, sky, jets };
}

/** Free the GPU memory of a group that is leaving the scene (nothing here shares geometry). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
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
