// One player's turn state on one hole: the lie, the strokes and what each throw did. No Three.js,
// so tests (and later the server) run it headless.

import type { FlightResult } from '../sim/flight';
import { dirToHeading } from '../sim/frame';
import { v3, type V3 } from '../sim/vec';
import { formatFeet, maxStrokes, scoreName } from './score';

/** Putting range, meters from the basket. */
export const CIRCLE_1 = 10;

export interface ThrowRecord {
  disc: string;
  color: string;
  /** Meters traveled. */
  distance: number;
  outcome: string;
}

export interface Scorecard {
  title: string;
  strokes: number;
  par: number;
  holeName: string;
  throws: ThrowRecord[];
}

/** What a finished flight did to the round, for the screen to show. */
export interface ThrowOutcome {
  toast: { text: string; ms?: number } | null;
  /** Set when the hole is over: in the basket, or picked up at the stroke limit. */
  done: 'holed' | 'picked-up' | null;
}

export class Round {
  lie: V3 = v3();
  strokes = 0;
  throws: ThrowRecord[] = [];
  /** Where the throw now in the air started, for the distance and the lie marker. */
  private throwFrom: V3 = v3();
  private holed = false;

  constructor(
    readonly par: number,
    private basket: { x: number; z: number },
  ) {}

  /** Start the hole over from this lie (the tee). */
  reset(lie: V3): void {
    this.lie = lie;
    this.strokes = 0;
    this.throws = [];
    this.holed = false;
  }

  basketDistance(): number {
    return Math.hypot(this.basket.x - this.lie.x, this.basket.z - this.lie.z);
  }

  /** Compass heading from the lie to the basket. */
  basketHeading(): number {
    return dirToHeading(v3(this.basket.x - this.lie.x, 0, this.basket.z - this.lie.z));
  }

  isPutt(): boolean {
    return this.basketDistance() <= CIRCLE_1;
  }

  /** A throw leaves the lie: count the stroke. */
  throwStarted(): void {
    this.throwFrom = this.lie;
    this.strokes++;
  }

  /** The disc has stopped: record the throw and move the lie. */
  throwFinished(r: FlightResult, disc: { name: string; color: string }): ThrowOutcome {
    const from = this.throwFrom;
    const record: ThrowRecord = {
      disc: disc.name,
      color: disc.color,
      distance: Math.hypot(r.rest.x - from.x, r.rest.z - from.z),
      outcome: '',
    };
    this.throws.push(record);

    if (r.inBasket) {
      record.outcome = this.strokes === 1 ? 'Ace!' : 'In';
      this.holed = true;
      return { toast: null, done: 'holed' };
    }

    let toast: ThrowOutcome['toast'] = null;
    if (r.ob) {
      this.strokes++;
      record.outcome = 'OB +1';
      this.lie = v3(r.lastInBounds.x, r.lastInBounds.y, r.lastInBounds.z);
      toast = { text: 'Out of bounds: +1, play from where it went out' };
    } else {
      this.lie = v3(r.rest.x, r.rest.y - 0.012, r.rest.z);
      const hit = r.events.find((e) => e.kind === 'spit-out' || e.kind === 'blow-through' || e.kind === 'band' || e.kind === 'cage');
      const trees = r.events.filter((e) => e.kind === 'branch' || e.kind === 'trunk').length;
      record.outcome = hit ? 'Chains' : r.restSurface === 'bramble' ? 'Brambles' : trees ? 'Trees' : '';
      if (hit) toast = { text: hit.kind === 'spit-out' ? 'Spit out!' : hit.kind === 'blow-through' ? 'Blew through the chains' : 'Off the cage' };
      else if (r.restSurface === 'bramble') toast = { text: 'In the blackberries...' };
      else if (this.isPutt()) toast = { text: `Circle 1, ${formatFeet(this.basketDistance())}` };
    }
    if (this.strokes >= maxStrokes(this.par)) {
      return { toast: { text: `Picked up at ${this.strokes}`, ms: 2000 }, done: 'picked-up' };
    }
    return { toast, done: null };
  }

  scorecard(holeName: string): Scorecard {
    return {
      title: this.holed ? scoreName(this.strokes, this.par) : 'Picked up',
      strokes: this.strokes,
      par: this.par,
      holeName,
      throws: this.throws,
    };
  }
}
