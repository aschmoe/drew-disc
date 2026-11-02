// Entry point for the scoreboard server. Built to one file (dist-server/server.mjs) that runs on a
// plain Node 22+ with no packages installed:
//
//   PORT=8787 DB_PATH=.data/scores.db node dist-server/server.mjs
//
// `npm run server` does that for local development; Vite proxies /api to it.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApi } from './http';
import { ScoreStore } from './store';

const PORT = Number(process.env.PORT) || 8787;
const DB_PATH = process.env.DB_PATH || '.data/scores.db';

mkdirSync(dirname(DB_PATH), { recursive: true });
const store = new ScoreStore(DB_PATH);
const server = createApi(store);
server.listen(PORT, () => console.log(`scoreboard listening on ${PORT}, db ${DB_PATH}`));

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close();
    store.close();
    process.exit(0);
  });
}
