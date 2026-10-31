// The camera: where it wants to be while aiming, looking down the hole, or chasing the disc, and
// the easing that gets it there without going through trees or the ground.

import * as THREE from 'three';
import { headingToDir } from '../sim/frame';
import type { V3 } from '../sim/vec';
import type { SimWorld } from '../sim/world';
import { followSun } from '../world/scene';

export interface CameraPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export class CameraRig {
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private sunOffset: THREE.Vector3;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private sun: THREE.DirectionalLight,
    private world: SimWorld,
  ) {
    this.sunOffset = sun.position.clone().sub(sun.target.position);
  }

  /**
   * Over the thrower's right shoulder, facing `aimDeg`. `liftDeg` is how far the launch is above
   * normal: the view tilts with it, so aiming high looks up the way aiming right looks right.
   */
  aimPose(lie: V3, aimDeg: number, putt: boolean, liftDeg = 0): CameraPose {
    const fwd = headingToDir(aimDeg);
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const at = new THREE.Vector3(lie.x, lie.y, lie.z);
    // Over the thrower's right shoulder, so they stand to one side of the view instead of in
    // front of the basket. Further to the side when putting, where the basket is close.
    const up = putt ? 1.55 : 2.6;
    const side = putt ? 1.15 : 0.9;
    let back = putt ? 2.6 : 5.5;
    const behind = (b: number, u: number) => at.clone().addScaledVector(right, side).add(new THREE.Vector3(-fwd.x * b, u, -fwd.z * b));
    // Back the camera off behind the thrower, but not into a tree.
    let pos = behind(back, up);
    while (back > 1.2 && this.insideTree(pos)) {
      back -= 0.5;
      pos = behind(back, up * 0.85);
    }
    if (putt) {
      const b = this.world.basket;
      const dist = Math.hypot(b.x - lie.x, b.z - lie.z);
      // Look at the chains, nudged toward the aim line so aiming still moves the view.
      const look = new THREE.Vector3(b.x, b.base + 0.55, b.z).lerp(at.clone().add(new THREE.Vector3(fwd.x * dist, 0.55, fwd.z * dist)), 0.5);
      return { pos, look };
    }
    const rise = 5 + 35 * Math.tan((liftDeg * Math.PI) / 180);
    return { pos, look: at.clone().add(new THREE.Vector3(fwd.x * 35, rise, fwd.z * 35)) };
  }

  /** From behind the basket, looking back down the fairway at the lie. */
  lookPose(lie: V3): CameraPose {
    const b = this.world.basket;
    const toBasket = new THREE.Vector3(b.x - lie.x, 0, b.z - lie.z).normalize();
    const pos = new THREE.Vector3(b.x, b.base + 3.2, b.z).addScaledVector(toBasket, 7);
    const look = new THREE.Vector3(lie.x, lie.y + 1, lie.z).lerp(new THREE.Vector3(b.x, b.base, b.z), 0.55);
    return { pos, look };
  }

  /** Behind and above the disc, looking at it. `vel` is its motion this frame. */
  chasePose(disc: THREE.Vector3, vel: THREE.Vector3): CameraPose {
    const dir = vel.clone().setY(0);
    if (dir.lengthSq() < 1e-6) dir.copy(this.camLook).sub(this.camPos).setY(0);
    dir.normalize();
    return { pos: disc.clone().addScaledVector(dir, -8).add(new THREE.Vector3(0, 3, 0)), look: disc };
  }

  /** Jump straight to a pose (a new hole or lie). */
  snap(p: CameraPose): void {
    this.camPos.copy(p.pos);
    this.camLook.copy(p.look);
    this.camera.position.copy(p.pos);
    this.camera.lookAt(p.look);
  }

  /** Ease toward a pose; `k` is how quickly. Keeps the sun's shadow box on the view. */
  moveTo(p: CameraPose, dt: number, k: number): void {
    const a = 1 - Math.exp(-dt * k);
    this.camPos.lerp(p.pos, a);
    this.camLook.lerp(p.look, Math.min(1, a * 2));
    const ground = this.world.groundHeight(this.camPos.x, this.camPos.z);
    if (this.camPos.y < ground + 0.6) this.camPos.y = ground + 0.6;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    followSun(this.sun, this.camLook, this.sunOffset);
  }

  private insideTree(p: THREE.Vector3): boolean {
    for (const t of this.world.treesNear(p.x, p.z)) {
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d < t.trunkRadius + 0.4 && p.y - t.base < t.trunkHeight) return true;
      const cy = p.y - t.base - t.canopyY;
      if ((d * d) / (t.canopyRx * t.canopyRx) + (cy * cy) / (t.canopyRy * t.canopyRy) < 1.15) return true;
    }
    return false;
  }
}
