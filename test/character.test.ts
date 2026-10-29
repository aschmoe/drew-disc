import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Character, RELEASE_AT, type ThrowAnim } from '../client/src/world/character';

// Torso and head as the character builds them, in the chest's frame.
const TORSO_BOTTOM = 0;
const TORSO_TOP = 0.52;
const torsoRadius = (y: number) => 0.165 + (0.2 - 0.165) * (y / TORSO_TOP);
const HEAD = new THREE.Vector3(0, 0.73, 0);
const HEAD_RADIUS = 0.15;
const ARM_RADIUS = 0.05;

/** How deep an arm segment sinks into the torso or head (0 = clear). Skips the bit at the shoulder. */
function intrusion(a: THREE.Vector3, b: THREE.Vector3, skipStart: number): number {
  let worst = 0;
  for (let i = 0; i <= 20; i++) {
    const t = skipStart + (1 - skipStart) * (i / 20);
    const p = a.clone().lerp(b, t);
    if (p.y > TORSO_BOTTOM && p.y < TORSO_TOP) {
      worst = Math.max(worst, torsoRadius(p.y) + ARM_RADIUS - Math.hypot(p.x, p.z));
    }
    worst = Math.max(worst, HEAD_RADIUS + ARM_RADIUS - p.distanceTo(HEAD));
  }
  return worst;
}

describe('thrower poses', () => {
  const c = new Character();
  const frames: { label: string; style: ThrowAnim; reach: number; follow: number | null }[] = [];
  for (const style of ['backhand', 'forehand', 'putt'] as const) {
    for (let r = 0; r <= 1; r += 0.125) frames.push({ label: `${style} reach ${r}`, style, reach: r, follow: null });
    for (let f = 0; f <= 1.6; f += 0.05) frames.push({ label: `${style} swing ${f.toFixed(2)}`, style, reach: 0, follow: f });
  }

  it('keeps both arms out of the torso and head through every pose and swing', () => {
    const bad: string[] = [];
    for (const fr of frames) {
      c.pose(fr.style, fr.reach, fr.follow, 0);
      const s = c.armSegments();
      for (const [side, [shoulder, elbow, hand]] of Object.entries(s)) {
        const depth = Math.max(intrusion(shoulder, elbow, 0.3), intrusion(elbow, hand, 0));
        if (depth > 0.02) bad.push(`${fr.label} ${side} arm ${depth.toFixed(3)} m`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('releases at the point the game starts the flight', () => {
    expect(RELEASE_AT).toBeGreaterThan(0);
    expect(RELEASE_AT).toBeLessThan(1);
  });
});
