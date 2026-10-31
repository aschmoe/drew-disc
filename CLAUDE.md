# Drew Disc

Browser disc golf game for Drew's birthday (Dec 11, 2026). Vite + TypeScript + Three.js.
Design, decisions and milestones: `docs/DESIGN.md`.

## Commands

```bash
npm install          # .npmrc sets legacy-peer-deps (npm's peer resolver trips on vitest 4)
npm run dev          # http://localhost:5173 ; flight lab at /tools/flight-lab.html
npm run server       # scoreboard on :8787 (SQLite in .data/); npm run dev forwards /api to it
npm test             # vitest: flight model, collisions, hole data, scoreboard
npm run build        # typecheck + build to dist/ (game) and dist-server/ (scoreboard)
```

## Layout

- `client/src/sim/` is the simulation: flight model, collisions, seeded RNG. Pure TypeScript, no
  Three.js, so tests and the flight lab (and later the server) run it headless. Keep it that way.
- `client/src/content/` turns course and hole JSON (`client/public/courses/`) into a sim world and
  render data.
- `client/src/world/` builds the Three.js scene; `client/src/ui/` is the DOM overlay.
- `client/src/game/` is the play loop. `game.ts` wires it together; the parts beside it are
  `round.ts` (lie, strokes, what each throw did: no Three.js, tested headless, the part a server
  would run), `camera.ts`, `playback.ts` (disc and trail along a flight), `keyboard.ts`,
  `shot.ts` (release point, auto putt power), `session.ts` (start menu, single hole or a front 9 /
  back 9 / 18 round), `rounds.ts` (round formats, board ids, saved progress) and `finish.ts`
  (hole and round cards, posting, sharing). The course has 18 hole slots; for now all are hole 1.
- `server/` is the scoreboard: Node built-ins only (`node:http`, `node:sqlite`), bundled by
  esbuild to `dist-server/server.mjs`. `client/src/net/scores.ts` calls it; every call may fail
  (offline, or no backend), and the game must still work then.
- `shared/` holds code for both client and server: the disc catalog (`shared/discs.ts`) and the
  leaderboard API types and validation (`shared/scores.ts`).
- `client/tools/` holds dev-only pages, served by `npm run dev` and not built for production:
  `flight-lab.html` (flight tuning), `thrower.html` (every character pose; `?swing=forehand` for a
  frame-by-frame filmstrip of one throw, `?face` for the head close up), `jet.html` (the jet model).
- Art and sound are procedural (`client/src/world/`, `client/src/audio/sound.ts`): no asset files.
- `?debug` adds exact sliders, lie jumps (Putt 6 ft, Approach 60 ft) and exposes `window.renderer`
  for draw-call checks. Debug rounds never post to the leaderboard. Keep the scene near or under
  ~200k triangles (shadow pass included).

## Rules that matter

- **Two coordinate frames.** Hole JSON is the MAP frame (meters, x = east, y = north, top-down,
  tee at the origin). The sim and renderer use the WORLD frame (Three.js: x = east, y = up,
  z = south, so north is -z). Convert only through `client/src/sim/frame.ts`. Headings are compass
  degrees (0 = north, clockwise).
- **Determinism.** Every random thing in the sim and in hole generation goes through `createRng`
  with a seed. No `Math.random()` inside `sim/` or `content/`. Same inputs + seed = same flight.
- **Release angle sign.** `hyzerDeg` positive is hyzer for whoever throws; `fadeSide()` turns it
  into a world-frame roll. A right-hand backhand fades left (-x when throwing north).
- Flight tuning lives in `TUNING` in `client/src/sim/flight.ts`. Change it with the flight lab
  open, then check `test/flight.test.ts` still passes (it pins distance ranges and curve directions).
- Discs are data: add one to `shared/discs.ts` (name, type, flight numbers, color).
- Pushes to `main` deploy to the live site once the deploy secrets exist. It's a surprise gift;
  the link is shared only when it's ready.
- Keep server specifics (IP, hostnames, ports, other services on the box, key paths) out of the
  repo; it's public. Deploy config comes from GitHub secrets.
- Avoid em dashes in user-facing copy.
