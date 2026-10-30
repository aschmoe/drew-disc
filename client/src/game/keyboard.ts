// Desktop keys: arrows / WASD aim and tilt, 1-n pick a disc, F switches backhand and forehand,
// L looks down the hole, R restarts, and holding space charges a clean throw.

import { DEFAULT_BAG } from '@shared/discs';
import { MAX_POWER, type ShotSettings } from './settings';

const CHARGE_PER_SECOND = 0.75;

export interface KeyboardHandlers {
  settings: () => ShotSettings;
  update: (patch: Partial<ShotSettings>) => void;
  /** Whether a charge may start now (aiming, not mid-flight). */
  canCharge: () => boolean;
  throwDisc: (power: number) => void;
  look: () => void;
  restart: () => void;
}

export class Keyboard {
  /** Power charged so far while space is held, or null. */
  charge: number | null = null;

  constructor(private h: KeyboardHandlers) {
    window.addEventListener('keydown', (e) => this.down(e));
    window.addEventListener('keyup', (e) => this.up(e));
  }

  /** Grow the charge while space is held. Returns true when it changed. */
  tick(dt: number): boolean {
    if (this.charge === null) return false;
    this.charge = Math.min(MAX_POWER, this.charge + CHARGE_PER_SECOND * dt);
    return true;
  }

  private down(e: KeyboardEvent): void {
    const s = this.h.settings();
    const bag = DEFAULT_BAG;
    if (e.key === ' ') {
      e.preventDefault();
      // Hold space to charge, release to throw (a clean release; the flick is touch/mouse only).
      if (!e.repeat && this.h.canCharge() && this.charge === null) this.charge = 0;
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a') this.h.update({ aimOffsetDeg: s.aimOffsetDeg - 0.5 });
    else if (e.key === 'ArrowRight' || e.key === 'd') this.h.update({ aimOffsetDeg: s.aimOffsetDeg + 0.5 });
    else if (e.key === 'ArrowUp' || e.key === 'w') this.h.update({ hyzerDeg: s.hyzerDeg - 1 });
    else if (e.key === 'ArrowDown' || e.key === 's') this.h.update({ hyzerDeg: s.hyzerDeg + 1 });
    else if (e.key === 'f') this.h.update({ style: s.style === 'backhand' ? 'forehand' : 'backhand' });
    else if (e.key === 'l') this.h.look();
    else if (e.key >= '1' && e.key <= String(bag.length)) this.h.update({ discId: bag[Number(e.key) - 1] });
    else if (e.key === 'r') this.h.restart();
  }

  private up(e: KeyboardEvent): void {
    if (e.key !== ' ' || this.charge === null) return;
    const power = this.charge;
    this.charge = null;
    this.h.throwDisc(power);
  }
}
