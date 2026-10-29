/** Golf names for a hole score. */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'ACE!';
  const diff = strokes - par;
  const names: Record<number, string> = {
    [-3]: 'Albatross!',
    [-2]: 'Eagle!',
    [-1]: 'Birdie!',
    0: 'Par',
    1: 'Bogey',
    2: 'Double bogey',
    3: 'Triple bogey',
  };
  return names[diff] ?? `+${diff}`;
}

/** Strokes after which the hole is picked up. */
export const maxStrokes = (par: number) => par + 4;

export const formatFeet = (m: number) => `${Math.round(m * 3.28084)} ft`;
