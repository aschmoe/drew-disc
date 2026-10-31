import { describe, expect, it } from 'vitest';
import { Round } from '../client/src/game/round';
import type { FlightEvent, FlightResult } from '../client/src/sim/flight';
import { v3 } from '../client/src/sim/vec';

const disc = { name: 'Red Eye', color: '#d33' };
const basket = { x: 0, z: -100 };

/** A flight that comes to rest at (x, z), with whatever overrides a case needs. */
const flight = (x: number, z: number, over: Partial<FlightResult> = {}): FlightResult => ({
  path: [],
  events: [],
  rest: v3(x, 0, z),
  inBasket: false,
  ob: false,
  lastInBounds: v3(x, 0, z),
  restSurface: 'fairway',
  flightTime: 3,
  ...over,
});
const event = (kind: FlightEvent['kind']): FlightEvent => ({ t: 1, kind, x: 0, y: 0, z: 0 });

const fresh = (par = 3) => {
  const r = new Round(par, basket);
  r.reset(v3(0, 0, 0));
  return r;
};
const play = (r: Round, result: FlightResult) => {
  r.throwStarted();
  return r.throwFinished(result, disc);
};

describe('round', () => {
  it('moves the lie to where the disc stopped and records the throw', () => {
    const r = fresh();
    const out = play(r, flight(3, -60));
    expect(out).toEqual({ toast: null, done: null });
    expect(r.strokes).toBe(1);
    expect(r.lie.z).toBe(-60);
    expect(r.throws[0].distance).toBeCloseTo(Math.hypot(3, 60));
    expect(r.basketDistance()).toBeCloseTo(Math.hypot(3, 40));
  });

  it('calls Circle 1 and switches to putting inside 10 m', () => {
    const r = fresh();
    expect(r.isPutt()).toBe(false);
    const out = play(r, flight(0, -94));
    expect(out.toast?.text).toBe('Circle 1, 20 ft');
    expect(r.isPutt()).toBe(true);
  });

  it('an ace is holed in one and named on the card', () => {
    const r = fresh();
    const out = play(r, flight(0, -100, { inBasket: true }));
    expect(out.done).toBe('holed');
    expect(r.throws[0].outcome).toBe('Ace!');
    expect(r.scorecard('Hole 1').title).toBe('ACE!');
  });

  it('out of bounds costs a stroke and plays from where it went out', () => {
    const r = fresh();
    const out = play(r, flight(30, -50, { ob: true, lastInBounds: v3(12, 0, -45) }));
    expect(r.strokes).toBe(2);
    expect(r.lie.x).toBe(12);
    expect(r.throws[0].outcome).toBe('OB +1');
    expect(out.toast?.text).toMatch(/Out of bounds/);
  });

  it('names what the disc hit', () => {
    const r = fresh();
    play(r, flight(0, -40, { events: [event('branch')] }));
    play(r, flight(0, -99, { events: [event('spit-out')] }));
    expect(r.throws.map((t) => t.outcome)).toEqual(['Trees', 'Chains']);
  });

  it('picks up at par + 4, with a Picked up card', () => {
    const r = fresh(3);
    let out = play(r, flight(0, -10));
    for (let i = 2; i < 7; i++) out = play(r, flight(0, -10 - i));
    expect(out.done).toBeNull();
    out = play(r, flight(0, -30));
    expect(out.done).toBe('picked-up');
    expect(out.toast?.text).toBe('Picked up at 7');
    expect(r.scorecard('Hole 1').title).toBe('Picked up');
  });

  it('reset starts the hole over', () => {
    const r = fresh();
    play(r, flight(0, -100, { inBasket: true }));
    r.reset(v3(1, 0, 2));
    expect(r.strokes).toBe(0);
    expect(r.throws).toEqual([]);
    expect(r.lie.x).toBe(1);
    expect(r.scorecard('Hole 1').title).toBe('Picked up');
  });
});
