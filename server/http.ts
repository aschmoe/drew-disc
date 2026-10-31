// The scoreboard's HTTP API. nginx is the only way in (the backend listens on localhost) and it
// sets X-Real-IP, which the post rate limit keys on.

import http from 'node:http';
import { BOARD_RE, parseSubmission } from '../shared/scores';
import type { ScoreStore } from './store';

/** Posts allowed per IP per window. A round of golf posts once per hole. */
const RATE = { posts: 30, windowMs: 10 * 60_000 };
const BODY_LIMIT = 1024;

export class RateLimit {
  private recent = new Map<string, number[]>();
  constructor(private posts = RATE.posts, private windowMs = RATE.windowMs) {}

  allow(ip: string, now = Date.now()): boolean {
    const list = (this.recent.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.posts) {
      this.recent.set(ip, list);
      return false;
    }
    list.push(now);
    this.recent.set(ip, list);
    if (this.recent.size > 5000) this.recent.clear();
    return true;
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createApi(store: ScoreStore, limit = new RateLimit()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/api/health') return send(res, 200, { ok: true });
      const m = url.pathname.match(/^\/api\/boards\/([^/]+)$/);
      if (!m) return send(res, 404, { error: 'not found' });
      const board = m[1];
      if (!BOARD_RE.test(board)) return send(res, 400, { error: 'bad board' });

      if (req.method === 'GET') return send(res, 200, store.board(board));
      if (req.method === 'POST') {
        const ip = String(req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? '');
        if (!limit.allow(ip)) return send(res, 429, { error: 'slow down' });
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return send(res, 400, { error: 'bad body' });
        }
        const s = parseSubmission(body);
        if ('error' in s) return send(res, 400, s);
        return send(res, 200, store.submit(board, s));
      }
      send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      console.error(e);
      send(res, 500, { error: 'server error' });
    }
  });
}
