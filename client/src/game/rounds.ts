// Rounds: a single hole, the front 9, the back 9 or all 18. The course lists 18 hole slots (for
// now every slot is hole 1); a round plays its slots in order and adds up the strokes. Progress is
// saved on the phone after each hole, so a reload or a closed tab picks the round back up.

import type { CourseDef } from '../content/hole';
import { hashSeed } from '../sim/rng';

export type RoundFormat = 'one' | 'front' | 'back' | 'full';

export const FORMATS: Record<RoundFormat, { label: string; first: number; count: number }> = {
  full: { label: '18 holes', first: 0, count: 18 },
  front: { label: 'Front 9', first: 0, count: 9 },
  back: { label: 'Back 9', first: 9, count: 9 },
  one: { label: 'Single hole', first: 0, count: 1 },
};

/** One finished hole of a round. */
export interface HoleScore {
  strokes: number;
  par: number;
  /** False when picked up at the stroke limit (the strokes still count). */
  holed: boolean;
}

export interface RoundState {
  v: 1;
  course: string;
  format: RoundFormat;
  /** Posting id for the round's total, so a retry (or a reload) posts it once. */
  id: string;
  scores: HoleScore[];
}

/** The course slots (0-based) a format plays, cut to the holes the course has. */
export function roundSlots(course: CourseDef, format: RoundFormat): number[] {
  const f = FORMATS[format];
  const slots: number[] = [];
  for (let i = f.first; i < f.first + f.count && i < course.holes.length; i++) slots.push(i);
  return slots;
}

/**
 * The leaderboard for a kind of round, e.g. `seatac-front-1k2x9a`. The tail is a hash of the hole
 * files the round plays, so when real holes replace the copies of hole 1 the round gets a fresh
 * board instead of mixing old scores with new holes. A single hole has no round board.
 */
export function roundBoardId(course: CourseDef, format: RoundFormat): string | null {
  if (format === 'one') return null;
  const files = roundSlots(course, format).map((i) => course.holes[i]);
  const tag = hashSeed(files.join(',')).toString(36).slice(0, 6);
  return `${course.id}-${format}-${tag}`;
}

/**
 * The leaderboard for one hole slot, e.g. `seatac-04-1k2x9a`: the slot number, then a hash of the
 * hole file in it, so a slot gets a fresh board when its hole changes.
 */
export function holeBoardId(course: CourseDef, slot: number): string {
  const tag = hashSeed(course.holes[slot]).toString(36).slice(0, 6);
  return `${course.id}-${String(slot + 1).padStart(2, '0')}-${tag}`;
}

/** Strokes, par and score against par over the holes played so far. */
export function roundTotals(scores: HoleScore[]): { strokes: number; par: number; diff: number; thru: number } {
  const strokes = scores.reduce((a, s) => a + s.strokes, 0);
  const par = scores.reduce((a, s) => a + s.par, 0);
  return { strokes, par, diff: strokes - par, thru: scores.length };
}

/** "E", "+2", "-1". */
export const relText = (diff: number) => (diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`);

/** The slot the round plays next, or null when it is over. */
export function nextSlot(course: CourseDef, r: RoundState): number | null {
  return roundSlots(course, r.format)[r.scores.length] ?? null;
}

const KEY = 'drewdisc.round';

export function loadRound(course: CourseDef): RoundState | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as RoundState | null;
    if (!r || r.v !== 1 || r.course !== course.id || !(r.format in FORMATS) || !Array.isArray(r.scores)) return null;
    return nextSlot(course, r) === null ? null : r;
  } catch {
    return null;
  }
}

export function saveRound(r: RoundState | null): void {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the round just won't survive a reload.
  }
}
