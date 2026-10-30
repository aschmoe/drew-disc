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
  /** Direction of the forearm, the same way. The elbow is a hinge, so the upper arm turns about
   *  its own axis (as the humerus does in its socket) to bend toward it: that is what lets a
   *  forehand lay the forearm back behind a leading elbow. */
  faz: number;
  fel: number;
  /** Shoulder rolled forward and in, 0..1: what lets a backhand reach cross in front of the
   *  chest instead of through it. */
  pro: number;
}

interface Pose {
  hips: number; // yaw, radians, + = turned left
  torso: number; // extra yaw of the chest over the hips
  lean: number; // forward lean, radians
  tilt: number; // side bend of the chest, + = right shoulder down
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
  tilt: number,
  crouch: number,
  r: ArmPose,
  l: ArmPose,
  rLeg: number,
  lLeg: number,
  spread: number,
): Pose => ({ hips, torso, lean, tilt, crouch, r, l, rLeg, lLeg, spread });
const A = (az: number, el: number, faz: number, fel: number, pro = 0): ArmPose => ({ az, el, faz, fel, pro });

// Key poses, right-handed, modeled on real throwers:
// - Backhand reach-back: a wide, low lunge with the right foot toward the target, hips and chest
//   turned so the back faces the target, torso bent forward, the throwing arm reaching straight
//   back away from the target at chest height, the off arm out toward the target for balance.
// - Forehand: plant on the right foot, chest opened to the right and the right shoulder dropped,
//   the arm reaching back behind the hip. Then the hips fire and drag the arm through elbow first:
//   the elbow stays near the hip while the forearm lies back, hand trailing out to the side (the
//   pull). Only then does the forearm whip around the elbow to release out in front of the right
//   hip, low and flat, and the arm wraps across to the left as the hips finish turning.
// Arm directions are in the chest's frame, so a turned chest carries the arm with it.
const REST = P(0, 0, 0.05, 0, 0.08, A(15, 72, 2, 21), A(-10, 82, -3, 68), 0, 0, 0.05);
const PUTT_REST = P(0, 0, 0.25, 0, 0.35, A(5, 55, 1, -8), A(-15, 72, -5, 44), 0.2, -0.1, 0.22);

interface ThrowKeys {
  rest: Pose;
  /** Fully wound up: as far as a full pull takes the reach-back. */
  reach: Pose;
  /** The swing from the reach as [time, pose]: the release at RELEASE_AT, the top of the
   *  follow-through at 1. Rest follows at 1.6. */
  swing: [number, Pose][];
}

/** Fraction of the throw animation at which the disc leaves the hand. */
export const RELEASE_AT = 0.35;

const THROWS: Record<ThrowAnim, ThrowKeys> = {
  backhand: {
    rest: REST,
    reach: P(1.15, 0.55, 0.6, 0, 0.8, A(-68, 15, -65, 14, 1), A(5, 35, 4, 24), 0.1, -0.1, 0.45),
    swing: [
      [RELEASE_AT, P(0.15, -0.05, 0.5, 0, 0.6, A(25, 15, 24, 12, 0.3), A(-70, 45, -39, 30), 0.1, -0.1, 0.4)],
      [1, P(-0.7, -0.4, 0.25, 0, 0.3, A(85, 25, 63, 22), A(-100, 60, -56, 56), 0.05, 0.35, 0.2)],
    ],
  },
  forehand: {
    rest: REST,
    reach: P(-0.7, -0.4, 0.45, 0.25, 0.7, A(95, 25, 105, 30), A(-75, 30, -60, 25), 0.35, -0.4, 0.3),
    swing: [
      [0.2, P(0, -0.45, 0.45, 0.3, 0.65, A(50, 60, 110, 0), A(-90, 45, -70, 40), 0.3, -0.35, 0.32)],
      [RELEASE_AT, P(0.25, 0, 0.4, 0.25, 0.55, A(40, 50, 25, 15), A(-110, 55, -90, 55), 0.3, -0.25, 0.32)],
      [0.5, P(0.6, 0.2, 0.35, 0.1, 0.45, A(20, 50, -40, 20), A(-120, 55, -100, 50), 0.2, 0, 0.32)],
      [1, P(0.85, 0.35, 0.3, 0.05, 0.35, A(5, 40, -70, 10), A(-130, 55, -110, 50), 0.15, 0.2, 0.25)],
    ],
  },
  putt: {
    rest: PUTT_REST,
    reach: P(0, 0, 0.3, 0, 0.6, A(0, 72, 0, -25), A(-20, 70, -6, 36), 0.2, -0.1, 0.25),
    swing: [
      [RELEASE_AT, P(0, 0, 0.15, 0, 0.05, A(0, 22, 0, 18), A(-25, 65, -10, 38), 0.2, -0.1, 0.22)],
      [1, P(0, 0, 0.1, 0, 0, A(0, -20, 0, -26), A(-25, 65, -10, 38), 0.2, -0.1, 0.2)],
    ],
  },
};

/** A pose whose every value is `f` of that value across `keys`. */
function blend(keys: Pose[], f: (values: number[]) => number): Pose {
  const n = (get: (p: Pose) => number) => f(keys.map(get));
  const arm = (side: 'r' | 'l'): ArmPose => ({
    az: n((p) => p[side].az),
    el: n((p) => p[side].el),
    faz: n((p) => p[side].faz),
    fel: n((p) => p[side].fel),
    pro: n((p) => p[side].pro),
  });
  return {
    hips: n((p) => p.hips),
    torso: n((p) => p.torso),
    lean: n((p) => p.lean),
    tilt: n((p) => p.tilt),
    crouch: n((p) => p.crouch),
    r: arm('r'),
    l: arm('l'),
    rLeg: n((p) => p.rLeg),
    lLeg: n((p) => p.lLeg),
    spread: n((p) => p.spread),
  };
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return blend([a, b], ([x, y]) => x + (y - x) * t);
}

/**
 * Monotone cubic through (times, values) at t: the motion keeps speeding up into a key it carries
 * on through (so the hand is fastest at the release, not stopped there) and eases in and out of
 * turning points without overshooting them.
 */
function monotoneCubic(times: number[], values: number[], t: number): number {
  const last = times.length - 1;
  let i = 0;
  while (i < last - 1 && t > times[i + 1]) i++;
  const slope = (k: number) => (values[k + 1] - values[k]) / (times[k + 1] - times[k]);
  const tangent = (k: number) => {
    if (k === 0 || k === last) return 0;
    const a = slope(k - 1);
    const b = slope(k);
    if (a * b <= 0) return 0;
    return Math.sign(a) * Math.min(2 * Math.abs(a), 3 * Math.abs(b));
  };
  const h = times[i + 1] - times[i];
  const s = Math.min(1, Math.max(0, (t - times[i]) / h));
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * values[i] +
    (s3 - 2 * s2 + s) * h * tangent(i) +
    (-2 * s3 + 3 * s2) * values[i + 1] +
    (s3 - s2) * h * tangent(i + 1)
  );
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const FORWARD = new THREE.Vector3(0, 0, -1);

// Scratch objects for posing, reused every frame.
const upperDir = new THREE.Vector3();
const foreDir = new THREE.Vector3();
const basisX = new THREE.Vector3();
const basisY = new THREE.Vector3();
const basisZ = new THREE.Vector3();
const basis = new THREE.Matrix4();
const rootQ = new THREE.Quaternion();
const parentQ = new THREE.Quaternion();

/** Sets `out` to an arm direction (azimuth, degrees below horizontal) in the chest's frame. */
function armDirection(out: THREE.Vector3, azDeg: number, elDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return out.set(Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el));
}
const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

/** Segment endpoints in the chest's frame, for checking that the arms clear the body. */
export interface ArmSegments {
  right: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  left: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
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

    // The disc in the right hand: a flattened cylinder gripped at its rim, so it sits out past the
    // fingers.
    this.handDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.02, 16), this.discMat);
    this.handDisc.position.set(0, -0.37, 0);
    this.rArm.lower.add(this.handDisc);

    this.root.add(this.hips);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.apply(REST, 0);
  }

  /** Shoulder, elbow and hand of each arm (after the last pose), in the chest's frame or the
   *  root's (facing -z, the throw direction). */
  armSegments(frame: 'chest' | 'root' = 'chest'): ArmSegments {
    this.root.updateMatrixWorld(true);
    const to = (frame === 'chest' ? this.chest : this.root).matrixWorld.clone().invert();
    const pt = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0)).applyMatrix4(to);
    const limb = (l: Limb): [THREE.Vector3, THREE.Vector3, THREE.Vector3] => [pt(l.upper), pt(l.lower), pt(l.lower, -0.28)];
    return { right: limb(this.rArm), left: limb(this.lArm) };
  }

  /** Center of the disc in the hand (after the last pose), in the root's frame. */
  handDiscPosition(): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(this.handDisc.getWorldPosition(new THREE.Vector3()));
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
    const set = THROWS[style];
    let p: Pose;
    if (follow === null) {
      p = lerpPose(set.rest, set.reach, smooth(Math.min(1, reach)));
    } else {
      const keys: [number, Pose][] = [[0, set.reach], ...set.swing, [1.6, set.rest]];
      const times = keys.map(([t]) => t);
      p = blend(
        keys.map(([, k]) => k),
        (values) => monotoneCubic(times, values, follow),
      );
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
    this.chest.rotation.set(-p.lean + breathe, p.torso, -p.tilt);
    // The head stays on the target, and roughly level, while the body turns and bends.
    this.head.rotation.set(p.lean * 0.6, -(p.hips + p.torso) * 0.75, p.tilt * 0.6);

    for (const [leg, swing, side] of [
      [this.rLeg, p.rLeg, 1],
      [this.lLeg, p.lLeg, -1],
    ] as const) {
      leg.upper.rotation.set(swing + knee * 0.5, 0, side * p.spread);
      leg.lower.rotation.set(-knee, 0, 0);
    }

    const aim = (limb: Limb, a: ArmPose, side: number) => {
      // The shoulder joint rolls forward and toward the middle as `pro` rises.
      limb.upper.position.set(side * (0.24 - 0.1 * a.pro), 0.47, -0.2 * a.pro);
      const upper = armDirection(upperDir, a.az, a.el);
      const fore = armDirection(foreDir, a.faz, a.fel);
      // The elbow hinges about the upper arm's x axis, swinging the forearm toward the upper arm's
      // -z. Turn the upper arm about its length so -z points where the forearm goes. (A nearly
      // straight arm leans on a little "forward" so the turn doesn't flip about.)
      const z = basisZ.copy(fore).addScaledVector(FORWARD, 0.02);
      z.addScaledVector(upper, -z.dot(upper)).normalize().negate();
      const y = basisY.copy(upper).negate();
      const x = basisX.crossVectors(y, z);
      limb.upper.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, z));
      limb.lower.rotation.set(upper.angleTo(fore), 0, 0);
    };
    aim(this.rArm, p.r, 1);
    aim(this.lArm, p.l, -1);

    // Keep the held disc flat (level with the character), whatever the arm is doing.
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(rootQ);
    this.rArm.lower.getWorldQuaternion(parentQ);
    this.handDisc.quaternion.copy(parentQ.invert().multiply(rootQ));
  }
}

let poser: Character | null = null;
const releasePoints = new Map<ThrowAnim, THREE.Vector3>();

/**
 * Where the disc leaves the hand, in the thrower's frame (x right, y up, -z toward the target),
 * so the flight can start right there instead of jumping at the release. Fixed per throw style,
 * so it costs one posing of a spare character and keeps replays deterministic.
 */
export function releasePoint(style: ThrowAnim): THREE.Vector3 {
  let p = releasePoints.get(style);
  if (!p) {
    poser ??= new Character();
    poser.pose(style, 0, RELEASE_AT, 0);
    p = poser.handDiscPosition();
    releasePoints.set(style, p);
  }
  return p.clone();
}
