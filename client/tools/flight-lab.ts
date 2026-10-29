// Flight tuning harness. Run `npm run dev` and open /tools/flight-lab.html.
// Top view: lateral drift vs distance. Side view: height vs distance. Distances in feet.

import { DISCS } from '@shared/discs';
import { simulateThrow, TUNING, M_TO_FT, type FlightResult, type ThrowStyle } from '../src/sim/flight';
import { flatWorld } from '../src/sim/world';

const state = {
  discs: new Set(Object.keys(DISCS)),
  powers: '0.6, 0.8, 1.0',
  hyzer: 0,
  style: 'backhand' as ThrowStyle,
  hand: 'right' as 'right' | 'left',
  launch: 9,
  nose: -1.5,
  windSpeed: 0,
  windToward: 0,
};

const controls = document.getElementById('controls')!;
const tuningKeys = Object.keys(TUNING) as (keyof typeof TUNING)[];

function field(parent: HTMLElement, label: string, value: number, step: number, onInput: (v: number) => void) {
  const l = document.createElement('label');
  l.textContent = label;
  const i = document.createElement('input');
  i.type = 'number';
  i.step = String(step);
  i.value = String(value);
  i.oninput = () => {
    onInput(Number(i.value));
    draw();
  };
  l.append(i);
  parent.append(l);
}

function build() {
  const discs = document.createElement('fieldset');
  discs.innerHTML = '<legend>Discs</legend>';
  for (const d of Object.values(DISCS)) {
    const l = document.createElement('label');
    l.style.gridTemplateColumns = '20px 1fr';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = state.discs.has(d.id);
    c.onchange = () => {
      if (c.checked) state.discs.add(d.id);
      else state.discs.delete(d.id);
      draw();
    };
    l.append(c, `${d.name} (${d.flight.speed}/${d.flight.glide}/${d.flight.turn}/${d.flight.fade})`);
    discs.append(l);
  }

  const shot = document.createElement('fieldset');
  shot.innerHTML = '<legend>Shot</legend>';
  const powers = document.createElement('label');
  powers.textContent = 'Powers';
  const pi = document.createElement('input');
  pi.value = state.powers;
  pi.oninput = () => {
    state.powers = pi.value;
    draw();
  };
  powers.append(pi);
  shot.append(powers);
  field(shot, 'Hyzer (deg)', state.hyzer, 1, (v) => (state.hyzer = v));
  field(shot, 'Launch (deg)', state.launch, 0.5, (v) => (state.launch = v));
  field(shot, 'Nose (deg)', state.nose, 0.5, (v) => (state.nose = v));
  field(shot, 'Wind (m/s)', state.windSpeed, 0.5, (v) => (state.windSpeed = v));
  field(shot, 'Wind toward (deg)', state.windToward, 15, (v) => (state.windToward = v));
  const style = document.createElement('div');
  style.className = 'row';
  for (const [s, h] of [['backhand', 'right'], ['forehand', 'right'], ['backhand', 'left']] as const) {
    const b = document.createElement('button');
    b.textContent = `${h === 'right' ? 'RH' : 'LH'} ${s}`;
    b.onclick = () => {
      state.style = s;
      state.hand = h;
      draw();
    };
    style.append(b);
  }
  shot.append(style);

  const tuning = document.createElement('fieldset');
  tuning.innerHTML = '<legend>Tuning (sim/flight.ts TUNING)</legend>';
  for (const k of tuningKeys) {
    field(tuning, k, Number((TUNING[k] as number).toFixed(4)), 0.001, (v) => ((TUNING as Record<string, number>)[k] = v));
  }
  controls.append(discs, shot, tuning);
}

function draw() {
  const world = flatWorld();
  const powers = state.powers.split(',').map(Number).filter((n) => !Number.isNaN(n));
  const runs: { disc: string; color: string; power: number; r: FlightResult }[] = [];
  for (const id of state.discs) {
    for (const power of powers) {
      const r = simulateThrow(
        {
          discId: id,
          style: state.style,
          hand: state.hand,
          power,
          aimDeg: 0,
          hyzerDeg: state.hyzer,
          launchDeg: state.launch,
          noseDeg: state.nose,
          from: { x: 0, y: 1.1, z: 0 },
          seed: 1,
        },
        world,
        { speed: state.windSpeed, towardDeg: state.windToward },
      );
      runs.push({ disc: id, color: DISCS[id].color, power, r });
    }
  }

  const maxDist = 500; // feet
  const top = document.getElementById('top') as HTMLCanvasElement;
  const tc = top.getContext('2d')!;
  const W = top.width;
  const H = top.height;
  tc.clearRect(0, 0, W, H);
  const sx = (ft: number) => 40 + (ft / maxDist) * (W - 60);
  const sy = (ft: number) => H / 2 - ft * ((H - 40) / 300);
  grid(tc, W, H, sx, (ft) => sy(ft), [-150, 150]);
  const side = document.getElementById('side') as HTMLCanvasElement;
  const sc = side.getContext('2d')!;
  sc.clearRect(0, 0, side.width, side.height);
  const hy = (m: number) => side.height - 20 - m * ((side.height - 30) / 25);
  grid(sc, side.width, side.height, sx, (m) => hy(m), [0, 25], 5);

  for (const run of runs) {
    const alpha = 0.35 + 0.65 * Math.min(1, run.power);
    tc.strokeStyle = sc.strokeStyle = run.color;
    tc.globalAlpha = sc.globalAlpha = alpha;
    tc.lineWidth = sc.lineWidth = 2;
    tc.beginPath();
    sc.beginPath();
    run.r.path.forEach((p, i) => {
      const dist = -p.p[2] * M_TO_FT;
      // Positive lateral = right of the line, drawn upward is LEFT so the plot reads like a map.
      const lat = -p.p[0] * M_TO_FT;
      if (i === 0) {
        tc.moveTo(sx(dist), sy(lat));
        sc.moveTo(sx(dist), hy(p.p[1]));
      } else {
        tc.lineTo(sx(dist), sy(lat));
        sc.lineTo(sx(dist), hy(p.p[1]));
      }
    });
    tc.stroke();
    sc.stroke();
  }
  tc.globalAlpha = sc.globalAlpha = 1;

  const table = document.getElementById('table')!;
  table.innerHTML =
    '<tr><th>Disc</th><th>Power</th><th>Distance (ft)</th><th>Finish (ft, + = right)</th><th>Max right (ft)</th><th>Max height (m)</th><th>Time (s)</th></tr>' +
    runs
      .map((run) => {
        const xs = run.r.path.map((p) => p.p[0]);
        const ys = run.r.path.map((p) => p.p[1]);
        return `<tr><td><span class="swatch" style="background:${run.color}"></span>${DISCS[run.disc].name}</td><td>${run.power}</td><td>${(-run.r.rest.z * M_TO_FT).toFixed(0)}</td><td>${(run.r.rest.x * M_TO_FT).toFixed(0)}</td><td>${(Math.max(...xs) * M_TO_FT).toFixed(0)}</td><td>${Math.max(...ys).toFixed(1)}</td><td>${run.r.flightTime.toFixed(1)}</td></tr>`;
      })
      .join('');
}

function grid(c: CanvasRenderingContext2D, W: number, H: number, sx: (ft: number) => number, sy: (v: number) => number, range: [number, number], vstep = 50) {
  c.strokeStyle = '#e3e8e1';
  c.fillStyle = '#7d8a7f';
  c.lineWidth = 1;
  c.font = '11px system-ui';
  for (let ft = 0; ft <= 500; ft += 50) {
    c.beginPath();
    c.moveTo(sx(ft), 0);
    c.lineTo(sx(ft), H);
    c.stroke();
    c.fillText(`${ft}`, sx(ft) + 2, H - 4);
  }
  for (let v = range[0]; v <= range[1]; v += vstep) {
    c.beginPath();
    c.moveTo(0, sy(v));
    c.lineTo(W, sy(v));
    c.strokeStyle = v === 0 ? '#9fb09c' : '#e3e8e1';
    c.stroke();
    c.fillText(range[0] < 0 ? `${v > 0 ? 'L' : v < 0 ? 'R' : ''}${Math.abs(v)}` : `${v} m`, 4, sy(v) - 2);
  }
  // 360 ft marker: hole 1.
  c.strokeStyle = '#ff3d8b';
  c.setLineDash([4, 4]);
  c.beginPath();
  c.moveTo(sx(360), 0);
  c.lineTo(sx(360), H);
  c.stroke();
  c.setLineDash([]);
}

build();
draw();
