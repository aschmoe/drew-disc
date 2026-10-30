# Drew Disc: design and architecture

A browser disc golf game for Drew's birthday (**December 11, 2026**). Mobile first, works on a
computer, low-poly 3D, one real hole to start (North SeaTac Park, hole 1), shareable scores with
leaderboards, and real-time multiplayer as the last milestone.

Ships as a static site plus a small backend later (see [Deploy](#11-deploy)).

Status: **approved direction, in progress.** Items marked **(decide)** need an answer; items marked **(verify)**
are estimates that need a ground-level check.

---

## 1. Goals and non-goals

**Goals**

- Feels right to people who play a lot: discs fly to their flight numbers, angle and power matter,
  the basket catches like a basket.
- One great hole before a second one. Polish beats breadth.
- Plays well on a phone in portrait, one-handed, on a mediocre connection.
- Content is data: a new hole or course is a JSON file plus assets, no engine changes.
- Real-time multiplayer for a small group of friends (2 to 6 players).

**Non-goals (for the birthday)**

- Accounts, logins, anti-cheat. Players type a name.
- A full 27-hole course. Hole 1 ships; more holes only if time allows.
- Physically perfect aerodynamics. "Feels like a real disc" is the bar.

## 2. Art direction (suggestion)

**"Cozy Pacific Northwest, flat-shaded."** Think *A Short Hike* meets *Alto*: low-poly, flat
shading, soft gradient sky, light fog that layers the tree lines, warm late-afternoon light.

- **Trees:** mostly leafy deciduous (alder, bigleaf maple, cottonwood) as clustered low-poly
  blobs on thin trunks, which is what hole 1 actually looks like from the tee, with a few tall
  Douglas firs (stacked, jittered cones) in the background tree line. Chest-high blackberry bramble
  as lumpy hedges along the edges. Instanced, so hundreds cost almost nothing.
- **Palette:** deep greens and teal shadows, a warm sunlight color, accents in disc colors (hot
  pink, orange, lime) so discs are always easy to spot.
- **Ground:** gently rolling terrain with vertex-color patches (mown fairway, longer grass, dirt
  around the tee pad and basket).
- **The airport:** North SeaTac Park sits under the SEA approach path, so a big cartoon jet
  crosses low overhead every 40 to 90 seconds with a rumble, a moving shadow and a little camera
  shake. A rare "golden jet" flyover could be an easter egg.
- **Birthday touches:** "Drew Disc" title card, tee sign reading *Hole 1, Par 3, 360 ft, Happy
  Birthday Drew*, discs with made-up names (see [Discs](#6-discs)), confetti and a chain "ching"
  on an ace.
- **UI:** big rounded buttons, chunky readable type, everything reachable by a thumb in the bottom
  third of the screen.

Assets: procedural geometry for terrain, trees and the basket; CC0 packs (Quaternius, Kenney) for
the character, props and jet. No paid assets, no licensing questions.

## 3. Hole 1 (North SeaTac Park)

From the UDisc map: **Par 3, 360 ft (~110 m)**, tee at the south end by the road, throwing north
toward the C pin. The layout is traced from a satellite view Alex marked up (open space, the two
big trees, the row of little trees and the two lines round them), scaled off the 360 ft tee-to-C
line at about 0.089 m per pixel. The look comes from the tee shot in the Santtu Disc Golf
playthrough (youtube.com/watch?v=3KfmGowbGio, 0:23). Numbers are estimates.

**What the tee view shows:**

- A **concrete tee pad** with room for an x-step run-up.
- A **mown grass lane** that opens out as it goes: narrow by the tee, then about 25 m wide from
  25 m out, offset to the right of the tee line. A worn **gravel and dirt path** runs up it.
- **Left:** a wall of chest-high blackberry bramble and young trees. Missing left means a scramble
  out of the brush.
- **Right:** big leafy deciduous trees right at the edge of the lane. Near the tee their branches
  lean out over the right side of the lane, so a high anhyzer line gets clipped early.
- **The feature: two big trees** stand between the lane and the basket, 65 to 90 m out. The left
  one is square on the tee line, so the straight shot is blocked. A **row of little trees** runs
  off to the left of it, closing that side, and a third big tree stands right of the right one,
  so from the tee there are **two gaps to hit**: the ~5 m gap between the big trees (an anhyzer
  that turns through and fades back in works well), or the ~5 m gap between the right big tree
  and the tree right of it, then back left to the basket (longer).
- **Around the basket:** a big open space, roughly 24 m left to 30 m right of the pin.
- **Flat**, as far as the video shows. Overcast PNW sky.
- The video confirms **multiple pin positions** for this hole.

```
              N  (+z)
   woods     open  [C]  open   ### z 90-130  open space round the basket
   ####       .    .     .   ####
   ###  ....  (L)  :  (R)  . (T) z 65-90   two gaps: (L)-(R) or (R)-(T)
   ##  oooo    .   :   ##   .  ##  z 64-72   row of little trees (o) closes the left side
   bramble    :|:          ######
   ,,,,,,,    :|:  lane     #####  z 20-60   bramble left, wide open lane, path up the middle
   ,,,,,,,    :|:  (O)  ####       z ~17     big leafy tree, branches overhang the right edge
  OB fence     |       ####
  (houses)    [T]                  z 0       tee pad
  ======= road (OB) =========      z -6 to -15
```

Coordinates (MAP frame, as in the hole JSON): meters, origin at the tee, x = east, y = north.
The sim and renderer use Three.js's WORLD frame (x = east, y = up, north = -z); the conversion
lives in `client/src/sim/frame.ts`.

| Feature | Estimate |
|---|---|
| Tee pad | (0, 0), facing north |
| Basket (pin C) | (0, 109.7) |
| Big round tree near tee | (+10.7, 16.5), canopy radius ~7 m |
| Mown lane (open space) | x -9 to +17, z 25 to 63; narrow by the tee |
| Left big tree | (-0.9, 73.6), on the tee line |
| Right big tree | (+7.8, 83.8); ~5 m gap to the left tree |
| Row of little trees | (-15, 64) to (-5, 72) |
| Tree right of the second gap | (+22, 72) |
| Second gap | x +13 to +17, z 66 to 90 |
| Open space round the basket | x -24 to +30, z 72 to 129 |
| Gravel path | up the lane, through the gap, to the basket |
| Left bramble and brush (heavy rough) | x -46 to -7, z 2 to 60 |
| West property line (OB) | x < -59 |
| Road behind tee (OB) | z -6 to -15 |

Still open **(verify)**: where the A and B pins sit (C ships first), whether the brush or the
property edge is OB or just rough (assumed: brush is heavy rough, the property edge and road are
OB), and a look at the green around the basket. More frames from later in the same video would
settle all three.

**Hole authoring tool.** A dev-only editor page lays the satellite screenshot on the ground plane
so trees, OB lines and pins can be placed by clicking, then exports the hole JSON. The screenshot
is used locally only and never committed or shipped (map imagery is copyrighted).

## 4. Controls

Mobile first, portrait. Inspired by the Disc Golf Masters style of drag-to-throw with a visible
line, adapted for one thumb.

### Shot setup (before throwing)

- **Aim:** drag left or right anywhere in the scene to turn the thrower. A faint **flight preview**
  shows the first part of the predicted line (about the first 40%), so aiming means something but
  the finish is still a read. "Pro mode" in settings turns the preview off.
- **Disc:** tap the bag button (bottom left) for a radial picker of discs with flight numbers.
- **Throw type:** backhand / forehand toggle (bottom right).
- **Release angle:** a vertical slider on the right edge, hyzer at the bottom, flat in the middle,
  anhyzer at the top. The thrower's arm and the preview tilt live as it moves.
- **Camera:** a "look" button flies the camera down the fairway to the basket and back, so you can
  read the gap.

### The throw: pull and flick

1. Put a thumb on the **throw pad** (bottom center) and **pull down**. Distance pulled sets power.
   The thrower winds into the reach-back as you pull.
2. The power ring has a **sweet spot band**. Pulling past it ("muscling it") adds a little more
   distance but also off-axis torque: wobble, extra turn, maybe a flip.
3. **Flick up** to release. The angle of the flick against straight up is your **pull or push**:
   a crooked flick sends the disc off the aim line. A faster flick gets a cleaner release (more
   spin), a lazy flick loses a bit of spin and fades early.

Two skills to master, power and a straight flick, and both are readable after every throw.

### Putting

Inside **Circle 1 (10 m, 33 ft)** the game switches to putting: the camera drops to eye level on
the chains, the angle slider hides, and the pull sets a softer power range. Circle 2 (10 to 20 m)
keeps normal controls but suggests the putter.

### Desktop

Same gestures with the mouse. Keyboard: A/D or arrows to aim, W/S for angle, 1 to 4 for discs,
F for backhand/forehand, hold and release space as an alternative throw (power on hold, release
timing for accuracy).

## 5. Flight model

A simplified rigid-disc simulation, not a canned curve, so trees, wind and angles all interact
naturally.

- **State:** position, velocity, disc orientation (normal vector), spin rate.
- **Forces:** gravity, lift and drag from angle of attack (simplified Hummel model:
  `CL = CL0 + CLa*a`, `CD = CD0 + CDa*(a - a0)^2`).
- **Turn and fade:** the aerodynamic pitching moment `CM = CM0 + CMa*a` is turned into roll by
  gyroscopic precession (`roll rate = M / (I * spin)`). High speed rolls the disc right (turn),
  low speed rolls it left (fade), for a right-handed backhand.
- **Flight numbers drive the coefficients:**
  - *Speed:* drag and the arm speed needed to "get the disc up to speed". Under-thrown drivers fade
    early, exactly like real life.
  - *Glide:* lift.
  - *Turn:* how negative the moment gets at high speed.
  - *Fade:* how positive it gets as the disc slows.
- **Power to arm speed:** 0 to 100% maps to roughly 15 to 30 m/s, tuned so a full, clean drive
  with the distance driver goes about 400 to 450 ft. (Hole 1 at 360 ft should need a controlled
  throw, not a max one.)
- **Wind:** light, random per hole, shown on a flag and windsock; acts on relative airspeed, so a
  headwind makes discs flip and a tailwind makes them fade, for free.
- **Fixed timestep** (240 Hz) with a **seeded random generator** for anything random (bark
  bounces, chain catches). The same inputs and seed always give the same flight on the same
  device, which is what makes replays work.
- **Tuning harness:** a dev page that throws every disc at a sweep of powers and angles and draws
  top-down and side-view paths, so tuning is "make the picture look like a real flight chart".

### Collisions and landing

- **Trunks:** capsules. Hard bounce, lots of energy lost.
- **Canopy:** soft volumes. Each step inside one has a seeded chance of a branch hit (deflect and
  slow). Thick firs are denser than deciduous trees. This is the "tree luck" every disc golfer
  knows.
- **Ground:** height-field terrain with skip and roll on landing. Rough and brush stop the disc
  faster than fairway.
- **Basket:** pole, cage and chain volumes. A disc entering the chains below a speed threshold is
  caught. Faster, it has a growing chance to spit out or blow through. Hitting the cage or the
  band bounces off.

### Rules

Strokes counted per throw. OB is +1, played from where the disc last crossed into OB (per
PDGA). Each lie is marked with a mini marker disc. Max strokes per hole: par + 4, then picked up.

## 6. Discs

Discs are pure data, so Drew's real bag can be dropped in later. Each disc is one entry in
`shared/discs.ts`:

```ts
{
  id: 'birthday-boy',
  name: 'The Birthday Boy',
  type: 'driver',            // putter | midrange | fairway | driver
  flight: { speed: 12, glide: 5, turn: -1, fade: 3 },
  color: '#ff3d8b',
  stamp: 'drew',             // optional decal
}
```

The flight model reads only the four flight numbers, so "add Drew's Destroyer" means typing its
numbers (and a name of your choosing). A bag is a list of disc ids.

Placeholder bag, with made-up names and real-feeling numbers:

| Slot | Name | Type | Numbers |
|---|---|---|---|
| 1 | The Birthday Boy | Distance driver | 12 / 5 / -1 / 3 |
| 2 | Red-Eye 737 | Fairway driver | 7 / 5 / -1 / 2 |
| 3 | Puddle Jumper | Midrange | 5 / 5 / 0 / 1 |
| 4 | Chain Seeker | Putter | 3 / 3 / 0 / 1 |

## 7. The thrower

A low-poly rigged character (CC0 base) with a short set of animations: idle, an x-step run-up into a backhand reach-back
and release, forehand, putt, a celebration, a sad head-shake. The reach-back is driven by the pull
amount and the release by the flick, so the body moves with your thumb. Each player picks a shirt
color; Drew's player gets a birthday hat if his name matches.

No walking between shots: after the disc settles, the camera follows it in, then cuts to the
thrower standing at the new lie. Fast pacing matters for multiplayer.

Fallback if the rigged character fights back: a stylized "bean" thrower with procedural
animation. Decide by the end of milestone 2.

## 8. Scores and leaderboards

- After each hole: score against par, a short replay of your best throw, and **Share** (Web Share
  API on phones, copy link on desktop) with a little score card: *"Drew Disc, SeaTac #1: Birdie
  (2). Beat it: <game link>"*.
- **Leaderboards:** per hole (best score, ties broken by earliest) and per course (total strokes
  over a full round, once there's more than one hole). Name only, no accounts.
- Stored in SQLite on the backend (see below). Submissions are lightly sanity checked
  (`strokes >= 1`), nothing more; it's for friends.

## 9. Multiplayer (last milestone)

Real time, MVP as you described: everyone sees the same scene; when it's not your turn the
controls are hidden and a banner says **"Drew is throwing"**.

- **Rooms:** create a room, get a 4-letter code and a share link
  (`<game URL>/r/ABCD`). Friends open it, type a name, done. 2 to 6 players.
- **Turn order:** tee order is join order on hole 1, then by best score on the previous hole.
  After the tee, the player farthest from the basket throws next, as in real disc golf.
- **What spectators see:** the thrower's aim, angle and disc choice stream live (throttled to
  about 10 updates a second), so you watch them line up the shot. Then the throw.
- **Who decides where a disc lands:** the **thrower's client runs the flight** and sends its
  inputs, seed and a compact sampled path (landing spot included). Spectators play back that path
  instead of re-simulating. This avoids desync from browsers doing floating point math slightly
  differently, and trusting friends is fine.
- **The server** owns the room: players, turn order, strokes, and the "whose turn" clock. It
  forwards messages and writes the final scores to the leaderboard.
- **Disconnects:** a player who drops keeps their slot for a couple of minutes; rejoining with the
  same name and room code restores them. If it's their turn, the others can "skip turn" (counts a
  stroke) so the round isn't stuck.

Message sketch (JSON over WebSocket):

```
client -> server   join {room, name, color} | aim {yaw, angle, discId, power} | throw {inputs, seed, path, result} | skip
server -> client   room {players, turn, hole, scores} | aim {...} | throw {...} | holeDone {scores} | roundDone {scores}
```

Building single player on top of a "local room" from the start means multiplayer later is a
transport swap, not a rewrite.

## 10. Architecture

### Stack

- **Client:** Vite + TypeScript + **Three.js**. Custom flight sim and collisions (no physics
  engine: we need a disc model, not general rigid bodies, and it keeps the bundle small). UI as a
  plain HTML/CSS overlay. Web Audio for sound.
- **Server:** Node 24, `node:http` and `node:sqlite`, plus the `ws` package for WebSockets
  bundled into a single file with esbuild at build time, so the server still runs on the plain
  `node` image with no package installs on the server. Memory capped small.

### Repo layout

```
drew-disc/
  client/
    index.html
    src/
      main.ts             boot, renderer, loop
      sim/                flight model, collisions, frames, seeded RNG (pure TS, no Three.js)
      content/            course and hole JSON -> sim world + render data (seeded generation)
      world/              terrain, instanced trees, basket, props, sky, palette
      game/               play loop: aim -> flight -> settle -> score; camera
      ui/                 HUD and controls overlay
      (later) player/     touch, mouse and keyboard input; thrower character
      (later) net/        room transport: LocalRoom (single player) and WsRoom (multiplayer)
    public/courses/seatac/
      course.json         name, hole list, environment (sky, fog, sun, wind range)
      holes/01.json       tees, pins, par, terrain bumps, surfaces, OB, trees, tree fields
    tools/
      flight-lab.html     dev only: flight tuning harness (npm run dev, /tools/flight-lab.html)
      (later) hole-editor dev only: trace a hole over a local satellite image, export JSON
  server/                 (milestone 4) http + ws rooms + SQLite
  shared/
    discs.ts              disc catalog and default bag
    (later) protocol.ts   message types used by both client and server
  test/                   vitest: flight model, collisions, hole data
  deploy/                 setup-server.sh (one-time server setup)
  .github/workflows/deploy.yml
```

The `sim/` folder has no rendering dependency, so the server could re-simulate a throw later if
we ever want it, and the flight lab and unit tests run it headless.

### Hole data

See `client/public/courses/seatac/holes/01.json` for a full example. In short (MAP frame):

- `tees`, `pins` (with a `default`), `par`, `lengthFt`, `bounds`.
- `terrain.bumps`: gentle gaussian hills, so elevation is a few numbers rather than a heightmap.
- `surfaces`: polygons, polylines (with a width) or circles of `fairway`, `path`, `rough`,
  `bramble`, `tee`, `green`; later entries win, anything uncovered is `defaultSurface`. Surfaces
  set ground friction.
- `ob`: labeled polygons.
- `trees`: individually placed trees that matter to play (`leafy`, `young`, `fir`, `bush`).
- `treeFields`: seeded jittered grids of one kind inside a polygon, for the background forest, so
  nobody hand-places 400 trees; `clearings` keep them out of the lane.

Adding a hole = a new JSON file and an entry in `course.json`.

### Performance budget (mid-range phone)

- 60 fps target, 30 fps acceptable floor. Device pixel ratio capped at 2.
- Under ~150 draw calls: instancing for trees, one merged mesh for terrain.
- First load under ~5 MB, compressed glTF (Draco/Meshopt) and Opus audio.
- No real-time shadows from every tree; one shadow-casting light limited to the play area, baked
  ambient darkening under canopies.

## 11. Deploy

A push to `main` builds the site in GitHub Actions and rsyncs it to a small server, where nginx
serves it straight from disk. Each deploy lands in its own release folder and a symlink swap makes
it live, so a rollback is one symlink. `deploy/setup-server.sh` prepares a server once; the host,
deploy key and known-hosts entry come from GitHub secrets (`DEPLOY_HOST`, `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS`), and until they exist the workflow only builds.

Server specifics (addresses, ports, what else runs there) are kept out of this repo on purpose.

Static site first (milestones 1 to 3), backend added later behind nginx on a local-only port;
its proxy block will also need the WebSocket upgrade headers (`Upgrade`, `Connection`) for
multiplayer.

The repo stays public (decided); the link is shared with Drew when it's ready.

## 12. Milestones (about 6 weeks)

| # | Target | What ships |
|---|---|---|
| 1 | Nov 5 | Repo scaffold, static deploy live, greybox hole 1, first flight model with the flight lab (**built**, deploy waiting on server setup) |
| 2 | Nov 12 | Controls (pull and flick, angle, bag), basket catching, putting, OB, scoring: **playable greybox**, first playtest with you (**built**; debug sliders at `?debug`) |
| 3 | Nov 19 | Art pass: terrain, firs, sky and fog, thrower and animations, jets, sound (**built**; all procedural, no asset files) |
| 4 | Nov 26 | Backend: leaderboards, share cards, results screen |
| 5 | Dec 3 | Real-time multiplayer rooms |
| 6 | Dec 10 | Polish, phone testing across devices, bug fixes, freeze. **Send the link Dec 11.** |

If anything slips, multiplayer is the flex item; the single-player hole with leaderboards stands
on its own.

## 13. Open questions

1. A and B pin positions, OB lines and the basket area for hole 1. **(verify)**
2. Drew's real bag: fill in `shared/discs.ts` whenever it's known.

Settled: art direction and pull-and-flick controls approved; the repo stays public.
