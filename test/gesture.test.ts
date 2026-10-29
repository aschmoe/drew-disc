import { describe, expect, it } from 'vitest';
import { FlickGesture, type GestureEvent } from '../client/src/ui/gesture';

const FULL = 200; // px of pull for 100%

/** Play a path of [ms, x, y] points; returns every event plus the release result. */
function play(points: [number, number, number][], release = true): GestureEvent[] {
  const g = new FlickGesture(FULL);
  const [t0, x0, y0] = points[0];
  g.down(t0, x0, y0);
  const out: GestureEvent[] = [];
  for (const [t, x, y] of points.slice(1)) {
    const ev = g.move(t, x, y);
    if (ev) out.push(ev);
  }
  if (release) {
    const ev = g.up();
    if (ev) out.push(ev);
  }
  return out;
}

/** A path from (y0) to (y1) over ms milliseconds, one sample per 16 ms frame. */
function stroke(t0: number, y0: number, y1: number, ms: number, x0 = 0, x1 = x0, frameMs = 16): [number, number, number][] {
  const n = Math.max(1, Math.round(ms / frameMs));
  return Array.from({ length: n }, (_, i) => {
    const f = (i + 1) / n;
    return [t0 + f * ms, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f] as [number, number, number];
  });
}

describe('pull and flick', () => {
  const pull = (): [number, number, number][] => [[0, 0, 0], ...stroke(0, 0, 180, 500)];

  it('power follows the current pull, including easing back up', () => {
    const events = play([...pull(), ...stroke(500, 180, 90, 900)], false);
    const powers = events.filter((e) => e.kind === 'pull').map((e) => (e as { power: number }).power);
    expect(Math.max(...powers)).toBeCloseTo(0.9, 2);
    expect(powers[powers.length - 1]).toBeCloseTo(0.45, 2);
  });

  it('a slow drag back up does not throw, and letting go cancels with a hint', () => {
    const events = play([...pull(), ...stroke(500, 180, 0, 1200)]);
    expect(events.some((e) => e.kind === 'throw')).toBe(false);
    expect(events[events.length - 1]).toEqual({ kind: 'cancel', hint: true });
  });

  it('letting go at the bottom of the pull cancels', () => {
    const events = play(pull());
    expect(events.some((e) => e.kind === 'throw')).toBe(false);
    expect(events[events.length - 1]).toMatchObject({ kind: 'cancel' });
  });

  it('a quick flick throws with the power from the bottom of the pull', () => {
    const events = play([...pull(), ...stroke(500, 180, 60, 90)]);
    const t = events.find((e) => e.kind === 'throw');
    expect(t).toMatchObject({ kind: 'throw' });
    expect((t as { power: number }).power).toBeCloseTo(0.9, 2);
  });

  it('easing back up and then flicking uses the lowered power', () => {
    const events = play([...pull(), ...stroke(500, 180, 100, 900), ...stroke(1400, 100, 0, 80)]);
    const t = events.find((e) => e.kind === 'throw') as { power: number };
    expect(t.power).toBeCloseTo(0.5, 2);
  });

  it('still catches a flick on a phone that only sends input at 30 fps', () => {
    const slowPull: [number, number, number][] = [[0, 0, 0], ...stroke(0, 0, 160, 500, 0, 0, 33)];
    const events = play([...slowPull, ...stroke(500, 160, 40, 100, 0, 0, 33)]);
    const t = events.find((e) => e.kind === 'throw') as { power: number } | undefined;
    expect(t?.power).toBeCloseTo(0.8, 2);
  });

  it('a crooked flick pushes the throw and a faster flick spins cleaner', () => {
    const right = play([...pull(), ...stroke(500, 180, 60, 90, 0, 60)]).find((e) => e.kind === 'throw') as { flickDeg: number };
    expect(right.flickDeg).toBeGreaterThan(2);
    const slowish = play([...pull(), ...stroke(500, 180, 60, 140)]).find((e) => e.kind === 'throw') as { spin: number };
    const fast = play([...pull(), ...stroke(500, 180, 60, 50)]).find((e) => e.kind === 'throw') as { spin: number };
    expect(fast.spin).toBeGreaterThan(slowish.spin);
  });
});
