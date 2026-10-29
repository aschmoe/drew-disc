// The pull-and-flick gesture as pure logic (no DOM), so it can be tested with exact timings.
//
// Power follows the current pull: down to set it, easing back up lowers it. A throw fires only on
// a flick, an upward move faster than FLICK_SPEED over the last FLICK_WINDOW_MS that has come up
// at least FLICK_MIN_RISE from where the quick upward run began. Power is the pull at that point,
// so easing back up and then flicking throws with the eased power. Letting go without a flick
// cancels.

import { MAX_POWER } from '../game/settings';

export const FLICK_SPEED = 700; // px/s upward
export const FLICK_WINDOW_MS = 80;
export const FLICK_MIN_RISE = 30; // px
/** Frame-to-frame upward speed (px/s) that counts as part of the flick's run. */
const RUN_SPEED = 250;
const HISTORY_MS = 400;

export type GestureEvent =
  | { kind: 'pull'; power: number; dx: number; dy: number }
  | { kind: 'throw'; power: number; flickDeg: number; spin: number }
  | { kind: 'cancel'; hint: boolean };

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class FlickGesture {
  private start: Sample | null = null;
  private samples: Sample[] = [];
  private pulled = false;

  /** fullPull: pixels of pull that make 100% power. */
  constructor(private fullPull: number) {}

  get active(): boolean {
    return this.start !== null;
  }

  private powerAt(y: number): number {
    return Math.min(MAX_POWER, Math.max(0, y - (this.start?.y ?? y)) / this.fullPull);
  }

  down(t: number, x: number, y: number, fullPull = this.fullPull): void {
    this.fullPull = fullPull;
    this.start = { t, x, y };
    this.samples = [{ t, x, y }];
    this.pulled = false;
  }

  move(t: number, x: number, y: number): GestureEvent | null {
    const start = this.start;
    if (!start) return null;
    const now = { t, x, y };
    const s = this.samples;
    s.push(now);
    while (s.length > 2 && now.t - s[0].t > HISTORY_MS) s.shift();

    // Speed over the last FLICK_WINDOW_MS.
    const ref = s.find((p) => now.t - p.t <= FLICK_WINDOW_MS) ?? s[s.length - 2];
    const dt = Math.max(8, now.t - ref.t) / 1000;
    const vy = (now.y - ref.y) / dt; // negative = moving up

    // Where the current quick upward run began: walk back while each step was moving up fast.
    let runStart = s.length - 1;
    while (runStart > 0) {
      const a = s[runStart - 1];
      const b = s[runStart];
      const up = (a.y - b.y) / Math.max(1, b.t - a.t) * 1000;
      if (up < RUN_SPEED) break;
      runStart--;
    }
    const from = s[runStart];
    const rise = from.y - now.y;
    if (rise >= FLICK_MIN_RISE && -vy >= FLICK_SPEED) {
      const power = this.powerAt(from.y);
      const flickAngle = (Math.atan2(now.x - from.x, rise) * 180) / Math.PI;
      const speed = Math.hypot((now.x - ref.x) / dt, vy);
      this.start = null;
      if (power < 0.05) return { kind: 'cancel', hint: false };
      return {
        kind: 'throw',
        power,
        flickDeg: Math.max(-10, Math.min(10, flickAngle * 0.3)),
        spin: Math.max(0.55, Math.min(1, 0.55 + (speed - FLICK_SPEED) / 2000)),
      };
    }
    const power = this.powerAt(now.y);
    if (power > 0.05 || rise >= FLICK_MIN_RISE) this.pulled = true;
    return { kind: 'pull', power, dx: now.x - start.x, dy: Math.max(0, now.y - start.y) };
  }

  /** Finger lifted without a flick. hint: they pulled, so tell them how to throw. */
  up(): GestureEvent | null {
    if (!this.start) return null;
    this.start = null;
    return { kind: 'cancel', hint: this.pulled };
  }

  cancel(): void {
    this.start = null;
  }
}
