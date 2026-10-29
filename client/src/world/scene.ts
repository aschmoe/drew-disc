import * as THREE from 'three';
import type { EnvironmentDef } from '../content/hole';

export interface SceneParts {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
}

/** Sky dome, fog and lights. */
export function createScene(env: EnvironmentDef): SceneParts {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(env.skyHorizon);
  scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);

  // Sky dome with a vertical gradient, unaffected by fog.
  const skyGeo = new THREE.SphereGeometry(900, 24, 12);
  const top = new THREE.Color(env.skyTop);
  const horizon = new THREE.Color(env.skyHorizon);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 900);
    c.copy(horizon).lerp(top, Math.pow(h, 0.6));
    c.toArray(colors, i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight('#dfefff', '#4a6b3a', 1.1));

  const sun = new THREE.DirectionalLight(env.sun.color, env.sun.intensity);
  const el = THREE.MathUtils.degToRad(env.sun.elevationDeg);
  const hd = THREE.MathUtils.degToRad(env.sun.headingDeg);
  sun.position.set(Math.sin(hd) * Math.cos(el), Math.sin(el), -Math.cos(hd) * Math.cos(el)).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -70;
  cam.right = 70;
  cam.top = 70;
  cam.bottom = -70;
  cam.near = 1;
  cam.far = 400;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  return { scene, sun };
}

/** Keep the shadow box centered on what the camera is looking at. */
export function followSun(sun: THREE.DirectionalLight, focus: THREE.Vector3, offset: THREE.Vector3): void {
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(offset);
}
