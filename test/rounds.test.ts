import { describe, expect, it } from 'vitest';
import type { CourseDef } from '../client/src/content/hole';
import { holeBoardId, nextSlot, roundBoardId, roundSlots, roundTotals, type RoundState } from '../client/src/game/rounds';
import course from '../client/public/courses/seatac/course.json';

const seatac = course as unknown as CourseDef;

describe('rounds', () => {
  it('splits 18 slots into a front and a back nine', () => {
    expect(seatac.holes).toHaveLength(18);
    expect(roundSlots(seatac, 'full')).toEqual([...Array(18).keys()]);
    expect(roundSlots(seatac, 'front')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(roundSlots(seatac, 'back')).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(roundSlots(seatac, 'one')).toEqual([0]);
  });

  it('cuts a round to the holes a shorter course has', () => {
    const short = { ...seatac, holes: ['01', '01', '01'] };
    expect(roundSlots(short, 'front')).toEqual([0, 1, 2]);
    expect(roundSlots(short, 'back')).toEqual([]);
  });

  it('gives each kind of round its own board, and a new one when the holes change', () => {
    const front = roundBoardId(seatac, 'front')!;
    expect(front).toMatch(/^seatac-front-[a-z0-9]{1,6}$/);
    expect(roundBoardId(seatac, 'back')).not.toBe(front);
    expect(roundBoardId(seatac, 'full')).toMatch(/^seatac-full-/);
    expect(roundBoardId(seatac, 'one')).toBeNull();
    const realHoles = { ...seatac, holes: seatac.holes.map((_, i) => String(i + 1).padStart(2, '0')) };
    expect(roundBoardId(realHoles, 'front')).not.toBe(front);
    for (const f of ['front', 'back', 'full'] as const) expect(roundBoardId(realHoles, f)!.length).toBeLessThanOrEqual(32);
  });

  it('gives every hole slot its own board', () => {
    expect(holeBoardId(seatac, 0)).toMatch(/^seatac-01-[a-z0-9]{1,6}$/);
    expect(holeBoardId(seatac, 17)).toMatch(/^seatac-18-/);
    expect(holeBoardId(seatac, 1)).not.toBe(holeBoardId(seatac, 0));
  });

  it('adds up the round and knows what is next', () => {
    const r: RoundState = { v: 1, course: 'seatac', format: 'back', id: 'x', scores: [
      { strokes: 2, par: 3, holed: true },
      { strokes: 7, par: 3, holed: false },
    ] };
    expect(roundTotals(r.scores)).toEqual({ strokes: 9, par: 6, diff: 3, thru: 2 });
    expect(nextSlot(seatac, r)).toBe(11);
    r.scores.push(...Array(7).fill({ strokes: 3, par: 3, holed: true }));
    expect(nextSlot(seatac, r)).toBeNull();
  });
});
