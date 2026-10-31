// Leaderboard storage in SQLite (Node's built-in `node:sqlite`, so the server needs no packages).
// Every post is kept; a board shows each player's best, ties broken by whoever got there first.

import { DatabaseSync } from 'node:sqlite';
import { BOARD_SIZE, nameKey, type BoardEntry, type BoardResponse, type ScoreSubmission } from '../shared/scores';

// Each player's best row on a board: fewest strokes, then earliest.
const BEST = `
  WITH best AS (
    SELECT name, strokes, at,
           ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY strokes, at) AS rn
    FROM scores WHERE board = ?
  )`;

export class ScoreStore {
  private db: DatabaseSync;
  private topStmt;
  private countStmt;
  private insertStmt;
  private bestOfStmt;
  private aheadStmt;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS scores (
        id       TEXT PRIMARY KEY,
        board    TEXT NOT NULL,
        name     TEXT NOT NULL,
        name_key TEXT NOT NULL,
        strokes  INTEGER NOT NULL,
        at       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS scores_board ON scores (board, name_key, strokes, at);
    `);
    this.topStmt = this.db.prepare(`${BEST} SELECT name, strokes, at FROM best WHERE rn = 1 ORDER BY strokes, at LIMIT ${BOARD_SIZE}`);
    this.countStmt = this.db.prepare('SELECT COUNT(DISTINCT name_key) AS n FROM scores WHERE board = ?');
    // Posting the same id again is a retry, or the player fixing their name: the score and time
    // stay, the name follows.
    this.insertStmt = this.db.prepare(`
      INSERT INTO scores (id, board, name, name_key, strokes, at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, name_key = excluded.name_key WHERE scores.board = excluded.board`);
    this.bestOfStmt = this.db.prepare('SELECT name, strokes, at FROM scores WHERE board = ? AND name_key = ? ORDER BY strokes, at LIMIT 1');
    this.aheadStmt = this.db.prepare(`${BEST} SELECT COUNT(*) AS n FROM best WHERE rn = 1 AND (strokes < ? OR (strokes = ? AND at < ?))`);
  }

  board(board: string): BoardResponse {
    const entries = this.topStmt.all(board) as unknown as BoardEntry[];
    const players = Number((this.countStmt.get(board) as { n: number }).n);
    return { entries: entries.map((e) => ({ name: e.name, strokes: Number(e.strokes), at: Number(e.at) })), players };
  }

  /** Record a score and return the board, with where the poster's best now ranks. */
  submit(board: string, s: ScoreSubmission, now = Date.now()): BoardResponse {
    const key = nameKey(s.name);
    this.insertStmt.run(s.id, board, s.name, key, s.strokes, now);
    const best = this.bestOfStmt.get(board, key) as unknown as BoardEntry | undefined;
    // Nothing stored under this name here: the id already belongs to another board.
    if (!best) return this.board(board);
    const ahead = Number((this.aheadStmt.get(board, best.strokes, best.strokes, best.at) as { n: number }).n);
    return { ...this.board(board), you: { name: best.name, strokes: Number(best.strokes), rank: ahead + 1 } };
  }

  close(): void {
    this.db.close();
  }
}
