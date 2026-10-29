import type { ThrowStyle } from '../sim/flight';

/** Everything the player has set up for the next throw. */
export interface ShotSettings {
  discId: string;
  style: ThrowStyle;
  /** Last power used (the preview shows this until the player starts pulling). */
  power: number;
  /** Degrees off the line to the basket. Positive aims right. */
  aimOffsetDeg: number;
  /** Release angle: positive hyzer, negative anhyzer. */
  hyzerDeg: number;
  /** Show the whole predicted flight instead of the first part (debug). */
  fullPreview: boolean;
}

export const AIM_LIMIT = 60;
export const HYZER_LIMIT = 35;
export const MAX_POWER = 1.15;
