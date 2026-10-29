// The thrower: a procedural low-poly character with real joints (hips, spine, head, two-segment
// arms, legs with knees), posed by blending a few key poses. Built in code so it costs no asset
// download and every player can get their own colors (and a party hat, it's a birthday).
//
// The character stands at its root's origin facing -z (the throw direction once the game turns
// the root toward the aim).

import * as THREE from 'three';

export type ThrowAnim = 'backhand' | 'forehand' | 'putt';

export interface CharacterLook {
  shirt: string;
  shorts: string;
  skin: string;
  hair: string;
  shoes: string;
  hat: 'party' | 'cap' | 'none';
  hatColor: string;
}

export const DEFAULT_LOOK: CharacterLook = {
  shirt: '#2f7de1',
  shorts: '#5d6670',
  skin: '#e2b48f',
  hair: '#6b4a2f',
  shoes: '#f2f2ee',
  hat: 'party',
  hatColor: '#ff3d8b',
};

interface ArmPose {
  /** Direction of the upper arm in the torso's frame: azimuth (0 ahead, +90 right), degrees. */
  az: number;
  /** Degrees below horizontal (90 = hanging straight down). */
  el: number;
  /** Elbow bend, radians. */
  elbow: number;
}

interface Pose {
  hips: number; // yaw, radians, + = turned left
  torso: number; // extra yaw of the chest over the hips
  lean: number; // forward lean, radians
  crouch: number; // knee bend, radians
  r: ArmPose;
  l: ArmPose;
  rLeg: number; // hip swing, + = forward
  lLeg: number;
  spread: number; // each leg out to the side, radians (a wide stance)
}

const P = (
  hips: number,
  torso: number,
  lean: number,
  crouch: number,
  r: ArmPose,
  l: ArmPose,
  rLeg: number,
  lLeg: number,
  spread: number,
): Pose => ({ hips, torso, lean, crouch, r, l, rLeg, lLeg, spread });
const A = (az: number, el: number, elbow: number): ArmPose => ({ az, el, elbow });

// Key poses, right-handed, modeled on real throwers:
// - Backhand reach-back: a wide, low lunge with the right foot toward the target, hips and chest
//   turned so the back faces the target, torso bent forward, the throwing arm reaching straight
//   back away from the target at chest height, the off arm out toward the target for balance.
// - Forehand reach-back: the same wide lunge with the left foot forward, chest opened to the right,
//   the throwing arm straight back on the right side, the off arm out in front.
// Arm azimuths are in the chest's frame, so a turned chest carries the arm with it.
const POSES = {
  rest: P(0, 0, 0.05, 0.08, A(15, 72, 0.9), A(-10, 82, 0.25), 0, 0, 0.05),
  backhand: {
    reach: P(1.15, 0.55, 0.6, 0.8, A(-80, 15, 0.05), A(95, 30, 0.4), 0.1, -0.1, 0.45),
    release: P(0.15, -0.05, 0.5, 0.6, A(25, 15, 0.05), A(-70, 45, 0.5), 0.1, -0.1, 0.4),
    follow: P(-0.7, -0.4, 0.25, 0.3, A(85, 25, 0.35), A(-100, 60, 0.4), 0.05, 0.35, 0.2),
  },
  forehand: {
    reach: P(-0.75, -0.45, 0.55, 0.7, A(110, 10, 0.25), A(-80, 25, 0.3), -0.1, 0.1, 0.45),
    release: P(0.15, 0.15, 0.5, 0.55, A(30, 15, 0.35), A(-90, 45, 0.5), -0.1, 0.1, 0.4),
    follow: P(0.6, 0.45, 0.25, 0.3, A(-20, 35, 0.6), A(-110, 60, 0.4), 0.35, 0.05, 0.2),
  },
  putt: {
    rest: P(0, 0, 0.25, 0.35, A(5, 55, 1.1), A(-15, 72, 0.5), 0.2, -0.1, 0.22),
    reach: P(0, 0, 0.3, 0.6, A(0, 72, 1.7), A(-20, 70, 0.6), 0.2, -0.1, 0.25),
    release: P(0, 0, 0.15, 0.05, A(0, -5, 0.05), A(-25, 65, 0.5), 0.2, -0.1, 0.22),
    follow: P(0, 0, 0.1, 0, A(0, -20, 0.1), A(-25, 65, 0.5), 0.2, -0.1, 0.2),
  },
};

/** Fraction of the throw animation at which the disc leaves the hand. */
export const RELEASE_AT = 0.35;

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const l = (x: number, y: number) => x + (y - x) * t;
  const arm = (x: ArmPose, y: ArmPose): ArmPose => ({ az: l(x.az, y.az), el: l(x.el, y.el), elbow: l(x.elbow, y.elbow) });
  return {
    hips: l(a.hips, b.hips),
    torso: l(a.torso, b.torso),
    lean: l(a.lean, b.lean),
    crouch: l(a.crouch, b.crouch),
    r: arm(a.r, b.r),
    l: arm(a.l, b.l),
    rLeg: l(a.rLeg, b.rLeg),
    lLeg: l(a.lLeg, b.lLeg),
    spread: l(a.spread, b.spread),
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

export class Character {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private rArm: Limb;
  private lArm: Limb;
  private rLeg: Limb;
  private lLeg: Limb;
  private handDisc: THREE.Mesh;
  private discMat = new THREE.MeshLambertMaterial({ color: '#ff8a1f', flatShading: true });

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    const shirt = mat(look.shirt);
    const skin = mat(look.skin);
    const shorts = mat(look.shorts);

    this.hips.position.y = 0.92;
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.2, 7), shorts);
    pelvis.position.y = -0.02;
    this.hips.add(pelvis);

    // Legs.
    const leg = (side: number): Limb => {
      const upper = new THREE.Group();
      upper.position.set(0.095 * side, -0.08, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.42, 6), shorts);
      thigh.position.y = -0.21;
      const lower = new THREE.Group();
      lower.position.y = -0.42;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.4, 6), skin);
      shin.position.y = -0.2;
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 6), mat('#ffffff'));
      sock.position.y = -0.37;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.22), mat(look.shoes));
      shoe.position.set(0, -0.415, -0.04);
      lower.add(shin, sock, shoe);
      upper.add(thigh, lower);
      this.hips.add(upper);
      return { upper, lower };
    };
    this.rLeg = leg(1);
    this.lLeg = leg(-1);

    // Torso.
    this.chest.position.y = 0.08;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.165, 0.52, 7), shirt);
    torso.position.y = 0.26;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.06, 7), skin);
    collar.position.y = 0.55;
    this.chest.add(torso, collar);
    this.hips.add(this.chest);

    // Head, hair, face, hat.
    this.head.position.y = 0.6;
    const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), skin);
    face.position.y = 0.13;
    const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.145, 1), mat(look.hair));
    hair.scale.set(1, 0.75, 1);
    hair.position.set(0, 0.18, 0.025);
    const eye = new THREE.SphereGeometry(0.018, 6, 4);
    const eyes = mat('#1d1d1d');
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eye, eyes);
      e.position.set(0.05 * side, 0.14, -0.125);
      this.head.add(e);
    }
    this.head.add(face, hair);
    if (look.hat === 'party') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), mat(look.hatColor));
      hat.position.set(0.02, 0.38, 0.01);
      hat.rotation.z = -0.18;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 8), mat('#ffe14d'));
      band.position.set(0.012, 0.3, 0.01);
      band.rotation.z = -0.18;
      const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), mat('#ffe14d'));
      pom.position.set(0.045, 0.51, 0.01);
      this.head.add(hat, band, pom);
    } else if (look.hat === 'cap') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.hatColor));
      cap.position.y = 0.17;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.14), mat(look.hatColor));
      brim.position.set(0, 0.18, -0.15);
      this.head.add(cap, brim);
    }
    this.chest.add(this.head);

    // Arms.
    const arm = (side: number): Limb => {
      const upper = new THREE.Group();
      upper.position.set(0.24 * side, 0.47, 0);
      const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), shirt);
      const bicep = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.28, 6), shirt);
      bicep.position.y = -0.14;
      const lower = new THREE.Group();
      lower.position.y = -0.28;
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.04, 0.25, 6), skin);
      forearm.position.y = -0.125;
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.052, 0), skin);
      hand.position.y = -0.28;
      lower.add(forearm, hand);
      upper.add(shoulder, bicep, lower);
      this.chest.add(upper);
      return { upper, lower };
    };
    this.rArm = arm(1);
    this.lArm = arm(-1);

    // The disc in the right hand: a flattened cylinder gripped at its rim.
    this.handDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 16), this.discMat);
    this.handDisc.position.set(0, -0.33, -0.06);
    this.rArm.lower.add(this.handDisc);

    this.root.add(this.hips);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.apply(POSES.rest, 0);
  }

  setDiscColor(color: string): void {
    this.discMat.color.set(color);
  }

  showHandDisc(on: boolean): void {
    this.handDisc.visible = on;
  }

  /**
   * Pose for this frame.
   * - reach (0..1): winding up while the player pulls.
   * - follow (null, or 0..1.6): the throw itself; the disc leaves the hand at RELEASE_AT, the
   *   follow-through peaks at 1, and 1..1.6 eases back to standing.
   * time (seconds) drives the idle breathing.
   */
  pose(style: ThrowAnim, reach: number, follow: number | null, time: number): void {
    const set = POSES[style];
    const rest = style === 'putt' ? POSES.putt.rest : POSES.rest;
    let p: Pose;
    if (follow === null) {
      p = lerpPose(rest, set.reach, smooth(Math.min(1, reach)));
    } else if (follow < RELEASE_AT) {
      p = lerpPose(set.reach, set.release, smooth(follow / RELEASE_AT));
    } else if (follow < 1) {
      p = lerpPose(set.release, set.follow, smooth((follow - RELEASE_AT) / (1 - RELEASE_AT)));
    } else {
      p = lerpPose(set.follow, rest, smooth(Math.min(1, (follow - 1) / 0.6)));
    }
    this.apply(p, follow === null && reach === 0 ? time : 0);
  }

  private apply(p: Pose, idleTime: number): void {
    const breathe = idleTime ? Math.sin(idleTime * 1.6) * 0.012 : 0;
    // Knees bend (thigh forward by half, shin back by the full bend) and legs swing and spread.
    // The hips sit at the height of the shorter leg, so both feet stay on the ground.
    const knee = p.crouch;
    const legHeight = (swing: number) => {
      const thigh = swing + knee * 0.5;
      return (0.42 * Math.cos(thigh) + 0.42 * Math.cos(thigh - knee)) * Math.cos(p.spread);
    };
    this.hips.position.y = 0.08 + Math.min(legHeight(p.rLeg), legHeight(p.lLeg));
    this.hips.rotation.y = p.hips;
    this.chest.rotation.set(-p.lean + breathe, p.torso, 0);
    // The head stays on the target while the body turns.
    this.head.rotation.set(p.lean * 0.6, -(p.hips + p.torso) * 0.75, 0);

    for (const [leg, swing, side] of [
      [this.rLeg, p.rLeg, 1],
      [this.lLeg, p.lLeg, -1],
    ] as const) {
      leg.upper.rotation.set(swing + knee * 0.5, 0, side * p.spread);
      leg.lower.rotation.set(-knee, 0, 0);
    }

    const aim = (limb: Limb, a: ArmPose) => {
      const az = THREE.MathUtils.degToRad(a.az);
      const el = THREE.MathUtils.degToRad(a.el);
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el));
      limb.upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      limb.lower.rotation.set(a.elbow, 0, 0);
    };
    aim(this.rArm, p.r);
    aim(this.lArm, p.l);

    // Keep the held disc flat (level with the character), whatever the arm is doing.
    this.root.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = this.rArm.lower.getWorldQuaternion(new THREE.Quaternion());
    this.handDisc.quaternion.copy(parentQ.invert().multiply(rootQ));
  }
}
