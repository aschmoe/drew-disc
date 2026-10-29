# Drew Disc

Browser disc golf game for Drew's birthday (Dec 11, 2026). Vite + TypeScript + Three.js.
Design, decisions and milestones: `docs/DESIGN.md`.

## Commands

```bash
npm install          # .npmrc sets legacy-peer-deps (npm's peer resolver trips on vitest 4)
npm run dev          # http://localhost:5173 ; flight lab at /tools/flight-lab.html
npm test             # vitest: flight model, collisions, hole data
npm run build        # typecheck + build to dist/
```

## Layout

- `client/src/sim/` is the simulation: flight model, collisions, seeded RNG. Pure TypeScript, no
  Three.js, so tests and the flight lab (and later the server) run it headless. Keep it that way.
- `client/src/content/` turns course and hole JSON (`client/public/courses/`) into a sim world and
  render data.
- `client/src/world/` builds the Three.js scene; `client/src/game/` is the play loop;
  `client/src/ui/` is the DOM overlay.
- `shared/` holds code for both client and (future) server: the disc catalog in `shared/discs.ts`.
- `client/tools/` holds dev-only pages, served by `npm run dev` and not built for production.

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
