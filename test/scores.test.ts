import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanName, parseSubmission } from '../shared/scores';
import { createApi, RateLimit } from '../server/http';
import { ScoreStore } from '../server/store';

describe('names', () => {
  it('tidies spaces and keeps letters from any language', () => {
    expect(cleanName('  Drew   M ')).toBe('Drew M');
    expect(cleanName('Zoë')).toBe('Zoë');
    expect(cleanName("O'Neil-2")).toBe("O'Neil-2");
  });

  it('refuses empty, too long, and markup', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('a'.repeat(17))).toBeNull();
    expect(cleanName('<b>hi</b>')).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});

describe('submissions', () => {
  it('accepts a real hole and refuses nonsense', () => {
    expect(parseSubmission({ id: 'abcdefgh12', name: 'Drew', strokes: 3 })).toEqual({ id: 'abcdefgh12', name: 'Drew', strokes: 3 });
    expect(parseSubmission({ id: 'short', name: 'Drew', strokes: 3 })).toEqual({ error: 'bad id' });
    expect(parseSubmission({ id: 'abcdefgh12', name: 'Drew', strokes: 0 })).toEqual({ error: 'bad strokes' });
    expect(parseSubmission({ id: 'abcdefgh12', name: 'Drew', strokes: 2.5 })).toEqual({ error: 'bad strokes' });
    expect(parseSubmission({ id: 'abcdefgh12', name: 'Drew', strokes: 31 })).toEqual({ error: 'bad strokes' });
    expect(parseSubmission(null)).toEqual({ error: 'bad id' });
  });
});

describe('board', () => {
  it('lists each player once at their best, ties to whoever got there first', () => {
    const s = new ScoreStore(':memory:');
    s.submit('h1', { id: 'aaaaaaaa1', name: 'Drew', strokes: 4 }, 1000);
    s.submit('h1', { id: 'aaaaaaaa2', name: 'Sam', strokes: 3 }, 2000);
    s.submit('h1', { id: 'aaaaaaaa3', name: 'drew', strokes: 3 }, 3000);
    s.submit('h1', { id: 'aaaaaaaa4', name: 'Drew', strokes: 5 }, 4000);
    s.submit('h2', { id: 'aaaaaaaa5', name: 'Kim', strokes: 2 }, 5000);
    const b = s.board('h1');
    expect(b.entries.map((e) => [e.name, e.strokes])).toEqual([['Sam', 3], ['drew', 3]]);
    expect(b.players).toBe(2);
    s.close();
  });

  it('says where the poster ranks, and a retried post counts once', () => {
    const s = new ScoreStore(':memory:');
    s.submit('h1', { id: 'bbbbbbbb1', name: 'Sam', strokes: 3 }, 1000);
    s.submit('h1', { id: 'bbbbbbbb2', name: 'Kim', strokes: 2 }, 2000);
    const first = s.submit('h1', { id: 'bbbbbbbb3', name: 'Drew', strokes: 3 }, 3000);
    expect(first.you).toEqual({ name: 'Drew', strokes: 3, rank: 3 });
    const retry = s.submit('h1', { id: 'bbbbbbbb3', name: 'Drew', strokes: 3 }, 9000);
    expect(retry.you?.rank).toBe(3);
    // A worse round later keeps the best one.
    const worse = s.submit('h1', { id: 'bbbbbbbb4', name: 'Drew', strokes: 6 }, 10_000);
    expect(worse.you).toEqual({ name: 'Drew', strokes: 3, rank: 3 });
    expect(worse.players).toBe(3);
    s.close();
  });

  it('moves a score to a corrected name when the same id is posted again', () => {
    const s = new ScoreStore(':memory:');
    s.submit('h1', { id: 'dddddddd1', name: 'Dreww', strokes: 3 }, 1000);
    const fixed = s.submit('h1', { id: 'dddddddd1', name: 'Drew', strokes: 1 }, 5000);
    expect(fixed.entries).toEqual([{ name: 'Drew', strokes: 3, at: 1000 }]);
    expect(fixed.you).toEqual({ name: 'Drew', strokes: 3, rank: 1 });
    // The id can't be used to move a score onto another board.
    s.submit('h2', { id: 'dddddddd1', name: 'Kim', strokes: 1 }, 6000);
    expect(s.board('h2').entries).toEqual([]);
    expect(s.board('h1').entries[0].name).toBe('Drew');
    s.close();
  });
});

describe('rate limit', () => {
  it('lets a burst through, then waits out the window', () => {
    const r = new RateLimit(2, 1000);
    expect(r.allow('ip', 0)).toBe(true);
    expect(r.allow('ip', 10)).toBe(true);
    expect(r.allow('ip', 20)).toBe(false);
    expect(r.allow('other', 20)).toBe(true);
    expect(r.allow('ip', 1011)).toBe(true);
  });
});

describe('http api', () => {
  const store = new ScoreStore(':memory:');
  const server = createApi(store);
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    store.close();
  });

  const post = (board: string, body: unknown) =>
    fetch(`${base}/api/boards/${board}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('posts a score and reads the board back', async () => {
    const r = await post('seatac-01', { id: 'cccccccc1', name: 'Drew', strokes: 2 });
    expect(r.status).toBe(200);
    expect((await r.json()).you).toMatchObject({ name: 'Drew', rank: 1 });
    const g = await (await fetch(`${base}/api/boards/seatac-01`)).json();
    expect(g.entries).toHaveLength(1);
    expect(g.players).toBe(1);
  });

  it('refuses a bad board, a bad body and an unknown path', async () => {
    expect((await fetch(`${base}/api/boards/Bad_Board`)).status).toBe(400);
    expect((await post('seatac-01', { id: 'cccccccc2', name: '', strokes: 2 })).status).toBe(400);
    expect((await fetch(`${base}/api/boards/seatac-01`, { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await fetch(`${base}/api/elsewhere`)).status).toBe(404);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });
});
