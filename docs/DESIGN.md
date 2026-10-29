# Drew Disc: design and architecture

A browser disc golf game for Drew's birthday (**December 11, 2026**). Mobile first, works on a
computer, low-poly 3D, one real hole to start (North SeaTac Park, hole 1), shareable scores with
leaderboards, and real-time multiplayer as the last milestone.

Live at `drew-disc.elliotsoft.com` once deploys are set up (see [Deploy](#deploy)).

Status: **draft for review.** Items marked **(decide)** need an answer; items marked **(verify)**
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

- **Trees:** tall Douglas firs as stacked, slightly jittered cones (the signature look of the hole),
  mixed with round deciduous blobs and blackberry bramble clumps on the left. Instanced, so
  hundreds cost almost nothing.
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
toward the C pin, dead straight. Measured off the satellite view at ~0.19 m per pixel, so every
number below is **(verify)**.

```
              N  (+z)
      woods   [C]   woods          z ~110 m  basket C, trees close behind and left
      ####     |    #######
     #####     |    ########       z 75-110  tall firs both sides, tightening near the pin
      ###    (*?*)  #######        z 60-80   canopy over the line: gap or obstacle? (verify)
   meadow      |     #######
  brush/grass  |      ######       z 20-60   left opens into brushy meadow, right is a solid wall
   ,,,,,,,     |   (O)  ####       z ~17     big round tree, ~11 m right of the line
  OB fence     |       ####
  (houses)    [T]                  z 0       tee pad
  ======= road (OB) =========      z -6 to -15
```

Coordinates: origin at the tee, +z toward the basket, +x to the right (east), meters.

| Feature | Estimate |
|---|---|
| Tee pad | (0, 0), facing north |
| Basket (pin C) | (0, 109.7) |
| Right tree wall | starts x +5 to +8 m along most of the hole |
| Big round tree near tee | (+10.7, 16.5), canopy radius ~8 m |
| Mid-fairway canopy | x -5 to +5, z 60 to 80 |
| Left meadow (brush, rough) | x -51 to -6, z 2 to 58 |
| Left woods near basket | x -17 to -2, z 75 to 110 |
| West property line (OB) | x < -59 |
| Road behind tee (OB) | z -6 to -15 |

What I need to lock this down **(verify)**:

1. **Ground-level photos or a short video from the tee**, plus a couple from the fairway. The
   satellite view can't show whether the mid-fairway canopy is a gap you throw under or a tree you
   throw around. That decides the whole shot.
2. **Elevation:** flat, uphill or downhill to the basket?
3. **OB lines:** is the meadow or the property edge OB, or just rough? Any mandatory?
4. **Pins:** hole 1 shows a C position. Do A and B exist for this hole? (Multiple pins are cheap in
   the data model and add replay value.)

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

Made-up names (no brand trademarks), real-feeling numbers. Players start with a four-disc bag:

| Slot | Name | Type | Numbers |
|---|---|---|---|
| 1 | The Birthday Boy | Distance driver | 12 / 5 / -1 / 3 |
| 2 | Red-Eye 737 | Fairway driver | 7 / 5 / -1 / 2 |
| 3 | Puddle Jumper | Midrange | 5 / 5 / 0 / 1 |
| 4 | Chain Seeker | Putter | 3 / 3 / 0 / 1 |

**(decide)** Do you know Drew's real bag or favorite disc? The names, colors and numbers could
mirror it.

## 7. The thrower

A low-poly rigged character (CC0 base) with a short set of animations: idle, backhand reach-back
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
  (2). Beat it: drew-disc.elliotsoft.com"*.
- **Leaderboards:** per hole (best score, ties broken by earliest) and per course (total strokes
  over a full round, once there's more than one hole). Name only, no accounts.
- Stored in SQLite on the backend (see below). Submissions are lightly sanity checked
  (`strokes >= 1`), nothing more; it's for friends.

## 9. Multiplayer (last milestone)

Real time, MVP as you described: everyone sees the same scene; when it's not your turn the
controls are hidden and a banner says **"Drew is throwing"**.

- **Rooms:** create a room, get a 4-letter code and a share link
  (`drew-disc.elliotsoft.com/r/ABCD`). Friends open it, type a name, done. 2 to 6 players.
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
  `node:24-alpine` image with no installs on the droplet (per `SERVER.md`). Memory capped at 128 MB.

### Repo layout

```
drew-disc/
  client/
    index.html
    src/
      main.ts             boot, loader, screen routing
      game/               state machine: menu -> room -> hole -> turn -> aim -> flight -> settle -> score
      sim/                flight model, collisions, rules, seeded RNG (pure TS, no Three.js)
      world/              terrain builder, foliage instancing, basket, sky, fog, jets
      player/             input (touch, mouse, keyboard), thrower character and animation
      camera/             aim cam, chase cam, basket cam, flyover
      ui/                 HUD, bag, angle slider, scorecard, leaderboard, share
      net/                room transport: LocalRoom (single player) and WsRoom (multiplayer)
      content/            loaders and schema validation for courses and holes
    public/
      courses/seatac/
        course.json       name, hole list, environment preset (sky, fog, wind range, jet paths)
        holes/01.json     tees, pins, par, terrain, trees, OB, mandos, decorations
      models/  audio/
    tools/
      hole-editor.html    dev only: trace a hole over a local satellite image, export JSON
      flight-lab.html     dev only: flight tuning harness
  server/
    src/index.ts          http routes (/api/health, /api/scores) + ws rooms
    src/rooms.ts          room state, turn order, scoring
    src/db.ts             SQLite: rounds, hole scores
  shared/
    protocol.ts           message types used by both client and server
    discs.ts              disc catalog
  deploy/
    setup-server.sh       adapted from sequim-games
  .github/workflows/deploy.yml
  docs/DESIGN.md
```

The `sim/` folder has no rendering dependency, so the server could re-simulate a throw later if
we ever want it, and the flight lab and unit tests run it headless.

### Hole data (sketch)

```jsonc
{
  "id": "seatac-01",
  "name": "Hole 1",
  "par": 3,
  "lengthFt": 360,
  "tees": [{ "id": "main", "pos": [0, 0, 0], "facing": 0 }],
  "pins": [{ "id": "C", "pos": [0, 0, 109.7], "default": true }],
  "terrain": { "size": [160, 180], "heightmap": "heights-01.png", "maxHeight": 4, "surfaces": "surfaces-01.png" },
  "trees": [
    { "kind": "fir", "pos": [8.2, 0, 34], "height": 28, "seed": 17 },
    { "kind": "round", "pos": [10.7, 0, 16.5], "canopyRadius": 8, "seed": 4 }
  ],
  "treeFields": [
    { "kind": "fir", "polygon": [[6, 20], [40, 20], [40, 120], [6, 120]], "density": 0.035, "seed": 9 }
  ],
  "ob": [{ "polygon": [[-80, -6], [80, -6], [80, -20], [-80, -20]], "label": "Road" }],
  "mandos": [],
  "decorations": [{ "kind": "teeSign", "pos": [-2.5, 0, -1.5] }]
}
```

Individual trees for the ones that matter to play, `treeFields` for the background forest so
nobody hand-places 400 firs. Adding a hole = a new JSON file and an entry in `course.json`.

### Performance budget (mid-range phone)

- 60 fps target, 30 fps acceptable floor. Device pixel ratio capped at 2.
- Under ~150 draw calls: instancing for trees, one merged mesh for terrain.
- First load under ~5 MB, compressed glTF (Draco/Meshopt) and Opus audio.
- No real-time shadows from every tree; one shadow-casting light limited to the play area, baked
  ambient darkening under canopies.

## 11. Deploy

Per `SERVER.md` (the Sequim Games pattern):

| Name | Value |
|---|---|
| Project slug | `drew-disc` |
| Hostname | `drew-disc.elliotsoft.com` |
| Internal port | `3101` (backend arrives in milestone 4) |
| Deploy key | `~/.ssh/drew-disc_deploy` |

Static site first (milestones 1 to 3), backend added later. The nginx `/api/` snippet will also
need the WebSocket upgrade headers (`Upgrade`, `Connection`) for multiplayer.

Surprise note: the URL is only shared when ready, but a **public** repo is visible to anyone who
looks at your GitHub profile. **(decide)** Keep the repo private until the birthday? (If so, the
setup script is pasted rather than `curl`ed, as `SERVER.md` describes.)

## 12. Milestones (about 6 weeks)

| # | Target | What ships |
|---|---|---|
| 1 | Nov 5 | Repo scaffold, static deploy live, greybox hole 1, first flight model with the flight lab |
| 2 | Nov 12 | Controls (pull and flick, angle, bag), basket catching, putting, OB, scoring: **playable greybox**, first playtest with you |
| 3 | Nov 19 | Art pass: terrain, firs, sky and fog, thrower and animations, jets, sound |
| 4 | Nov 26 | Backend: leaderboards, share cards, results screen |
| 5 | Dec 3 | Real-time multiplayer rooms |
| 6 | Dec 10 | Polish, phone testing across devices, bug fixes, freeze. **Send the link Dec 11.** |

If anything slips, multiplayer is the flex item; the single-player hole with leaderboards stands
on its own.

## 13. Open questions

1. Ground-level photos or video of hole 1, elevation, OB lines, other pin positions. **(verify)**
2. Drew's real bag or favorite disc? **(decide)**
3. Private repo until the birthday? **(decide)**
4. Is the "Cozy PNW, flat-shaded" direction right? **(decide)**
5. Is pull and flick the right throw feel, or did you mean something specific from Disc Golf
   Masters? I couldn't load its store page from my sandbox. **(decide)**
