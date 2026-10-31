// The leaderboard API, shared by the game and the server so both agree on what a valid score is.
//
//   GET  /api/boards/<board>                       -> BoardResponse
//   POST /api/boards/<board>  ScoreSubmission      -> BoardResponse (with `you`)
//   GET  /api/health                               -> { ok: true }
//
// A board is one hole (later also a full round). Each name appears once, with its best score;
// ties go to whoever got there first.

/** Board ids: lowercase words and dashes, e.g. `seatac-01`. */
export const BOARD_RE = /^[a-z0-9-]{1,32}$/;
/** Made by the game per finished hole, so a retried upload is not counted twice. */
export const SCORE_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const NAME_MAX = 16;
/** Above this a "score" is not a real hole. Matches nothing the game can produce. */
export const MAX_STROKES = 30;
/** How many entries a board returns. */
export const BOARD_SIZE = 10;

export interface ScoreSubmission {
  id: string;
  name: string;
  strokes: number;
}

export interface BoardEntry {
  name: string;
  strokes: number;
  /** When this best score was posted, ms since epoch (server clock). */
  at: number;
}

export interface BoardResponse {
  entries: BoardEntry[];
  /** Players on the board (each name once). */
  players: number;
  /** After a post: where the poster's best score ranks, 1-based. */
  you?: { name: string; strokes: number; rank: number };
}

/**
 * A display name, tidied: trimmed, inner runs of spaces collapsed. Letters (any language),
 * digits, spaces and a little punctuation. Null when nothing usable is left.
 */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || [...name].length > NAME_MAX) return null;
  return /^[\p{L}\p{N} .'_-]+$/u.test(name) ? name : null;
}

/** The key a name is compared by, so "Drew" and "drew " are the same player. */
export const nameKey = (name: string) => name.toLocaleLowerCase('en-US');

/** Checks a posted body. Returns the cleaned submission, or an error to send back. */
export function parseSubmission(body: unknown): ScoreSubmission | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.id !== 'string' || !SCORE_ID_RE.test(b.id)) return { error: 'bad id' };
  const name = cleanName(b.name);
  if (!name) return { error: 'bad name' };
  const strokes = b.strokes;
  if (typeof strokes !== 'number' || !Number.isInteger(strokes) || strokes < 1 || strokes > MAX_STROKES) return { error: 'bad strokes' };
  return { id: b.id, name, strokes };
}
