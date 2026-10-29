// The disc catalog. Discs are pure data: the flight model reads only the four flight numbers,
// so adding a real disc from Drew's bag is one new entry here.

export type DiscType = 'putter' | 'midrange' | 'fairway' | 'driver';

export interface FlightNumbers {
  /** 1 to 14. How fast the disc must be thrown to fly as rated, and how little drag it has. */
  speed: number;
  /** 1 to 7. Lift. */
  glide: number;
  /** +1 to -5. Negative turns right (RHBH) at high speed. */
  turn: number;
  /** 0 to 5. How hard it hooks left (RHBH) as it slows. */
  fade: number;
}

export interface Disc {
  id: string;
  name: string;
  type: DiscType;
  flight: FlightNumbers;
  /** Rim color, any CSS color. */
  color: string;
  /** Mass in grams. Defaults to 172. */
  mass?: number;
  /** Optional stamp decal id. */
  stamp?: string;
}

export const DISCS: Record<string, Disc> = {
  'birthday-boy': {
    id: 'birthday-boy',
    name: 'The Birthday Boy',
    type: 'driver',
    flight: { speed: 12, glide: 5, turn: -1, fade: 3 },
    color: '#ff3d8b',
    stamp: 'drew',
  },
  'red-eye': {
    id: 'red-eye',
    name: 'Red-Eye 737',
    type: 'fairway',
    flight: { speed: 7, glide: 5, turn: -1, fade: 2 },
    color: '#ff8a1f',
  },
  'puddle-jumper': {
    id: 'puddle-jumper',
    name: 'Puddle Jumper',
    type: 'midrange',
    flight: { speed: 5, glide: 5, turn: 0, fade: 1 },
    color: '#b6f23c',
  },
  'chain-seeker': {
    id: 'chain-seeker',
    name: 'Chain Seeker',
    type: 'putter',
    flight: { speed: 3, glide: 3, turn: 0, fade: 1 },
    color: '#3cc8f2',
  },
};

/** The bag every player starts with, in slot order. */
export const DEFAULT_BAG: string[] = ['birthday-boy', 'red-eye', 'puddle-jumper', 'chain-seeker'];

export function getDisc(id: string): Disc {
  const disc = DISCS[id];
  if (!disc) throw new Error(`Unknown disc: ${id}`);
  return disc;
}
