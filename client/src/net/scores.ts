// Talks to the scoreboard (`/api/boards/...`, see shared/scores.ts). Every call can fail: offline,
// no backend (the preview build), or a slow phone connection. Callers get null and show the card
// without a board.

import type { BoardResponse, ScoreSubmission } from '@shared/scores';

const TIMEOUT_MS = 6000;

async function call(board: string, init?: RequestInit): Promise<BoardResponse | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/boards/${encodeURIComponent(board)}`, { ...init, signal: ctrl.signal });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    const body = (await res.json()) as BoardResponse;
    return Array.isArray(body?.entries) ? body : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export const fetchBoard = (board: string) => call(board);

export const postScore = (board: string, s: ScoreSubmission) =>
  call(board, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });

/** An id for one finished hole, so retrying the upload doesn't post it twice. */
export function newScoreId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

const NAME_KEY = 'drewdisc.name';

/** The name this phone last posted under, if any. */
export function savedName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function saveName(name: string | null): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Private mode: they type it again next time.
  }
}
