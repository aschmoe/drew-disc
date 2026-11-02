// The share card: a portrait picture of a hole's score (with its throws) or a round's (with every
// hole), over sky, firs, a jet and the basket, for sending to friends. Drawn on a 2D canvas, so it
// costs no asset files.

import { createRng, hashSeed } from '../sim/rng';
import type { ThrowRecord } from '../game/round';

export interface ShareInfo {
  course: string;
  holeNumber: number;
  holeName: string;
  par: number;
  strokes: number;
  /** "Birdie!", "Picked up"... */
  title: string;
  throws: ThrowRecord[];
  /** Set for a finished round: the round's name and every hole. Replaces the throws. */
  round?: { label: string; holes: { number: number; strokes: number; par: number; holed: boolean }[] };
  name?: string;
  rank?: number;
  players?: number;
  /** Where friends can play, shown at the bottom. */
  url: string;
}

const W = 1080;
const H = 1350;
const FONT = "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, -apple-system, sans-serif";
const INK = '#17301f';
const ACCENT = '#ff3d8b';
const MAX_THROWS = 5;

/** The words that go with the picture (and stand alone where a picture can't be shared). */
export function shareText(i: ShareInfo): string {
  if (i.round) return `Drew Disc, ${i.course} ${i.round.label}: ${i.strokes} (${relWord(i.strokes - i.par, 'E')}). Beat it:`;
  const label = i.title.replace(/!+$/, '');
  const score = i.title === 'Picked up' ? `Picked up (${i.strokes})` : `${label[0].toUpperCase()}${label.slice(1).toLowerCase()} (${i.strokes})`;
  return `Drew Disc, ${i.course} #${i.holeNumber}: ${score}. Beat it:`;
}

export function drawShareCard(i: ShareInfo): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rng = createRng(hashSeed(`${i.holeName}|${i.strokes}|${i.name ?? ''}`));

  drawLandscape(g, rng);

  // Masthead over the sky.
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.font = `900 64px ${FONT}`;
  spaced(g, 'DREW DISC', W / 2, 118, 10);
  g.font = `800 36px ${FONT}`;
  g.globalAlpha = 0.92;
  g.fillText(`${i.course} · ${i.round ? i.round.label : i.holeName} · Par ${i.par}`, W / 2, 176);
  g.globalAlpha = 1;

  // The score panel.
  const shown = i.throws.slice(0, MAX_THROWS);
  const more = i.throws.length - shown.length;
  const rowH = 62;
  const panelTop = 226;
  const listTop = panelTop + 330;
  const cells = i.round?.holes ?? [];
  const gridRows = Math.ceil(cells.length / 9);
  const listH = i.round ? gridRows * 110 : shown.length * rowH + (more > 0 ? 44 : 0);
  const panelH = listTop - panelTop + listH + (i.name ? 96 : 40);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.22)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 14;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  roundRect(g, 90, panelTop, W - 180, panelH, 54);
  g.fill();
  g.restore();

  const title = i.round ? `${i.strokes}` : i.title;
  g.fillStyle = ACCENT;
  g.font = `900 ${fitFont(g, title, 150, W - 260)}px ${FONT}`;
  g.fillText(title, W / 2, panelTop + 180);
  const d = i.strokes - i.par;
  g.fillStyle = INK;
  g.font = `800 46px ${FONT}`;
  g.fillText(
    i.round ? `${relWord(d, 'even')} · ${cells.length} holes` : `${i.strokes} ${i.strokes === 1 ? 'throw' : 'throws'} · ${relWord(d, 'even')}`,
    W / 2,
    panelTop + 262,
  );

  // A round: one cell per hole, nine to a row, tinted by how the hole went.
  cells.forEach((h, k) => {
    const x = 140 + (k % 9) * 90;
    const y = listTop + Math.floor(k / 9) * 110;
    const hd = h.strokes - h.par;
    g.fillStyle = hd < 0 ? ACCENT : hd > 0 ? '#dfe6ee' : '#f1f5f0';
    roundRect(g, x, y, 80, 96, 20);
    g.fill();
    g.fillStyle = hd < 0 ? '#fff' : INK;
    g.globalAlpha = 0.6;
    g.font = `800 22px ${FONT}`;
    g.fillText(`${h.number}`, x + 40, y + 30);
    g.globalAlpha = 1;
    g.font = `900 40px ${FONT}`;
    g.fillText(`${h.strokes}${h.holed ? '' : '*'}`, x + 40, y + 76);
  });

  // A hole: one line per throw: colored dot, disc, distance, what happened.
  if (!i.round) shown.forEach((t, k) => {
    const y = listTop + k * rowH;
    g.fillStyle = '#f1f5f0';
    roundRect(g, 140, y, W - 280, rowH - 12, 25);
    g.fill();
    g.fillStyle = t.color;
    g.beginPath();
    g.arc(184, y + 25, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.textAlign = 'left';
    g.font = `800 32px ${FONT}`;
    g.fillText(t.disc, 216, y + 37);
    g.textAlign = 'right';
    g.font = `700 30px ${FONT}`;
    g.globalAlpha = 0.6;
    if (t.outcome) g.fillText(t.outcome, W - 166, y + 36);
    g.globalAlpha = 1;
    g.font = `900 32px ${FONT}`;
    g.fillText(`${Math.round(t.distance * 3.28084)} ft`, W - 330, y + 37);
  });
  g.textAlign = 'center';
  if (more > 0 && !i.round) {
    g.fillStyle = INK;
    g.globalAlpha = 0.55;
    g.font = `800 28px ${FONT}`;
    g.fillText(`and ${more} more`, W / 2, listTop + shown.length * rowH + 22);
    g.globalAlpha = 1;
  }
  if (i.name) {
    g.fillStyle = INK;
    g.font = `800 38px ${FONT}`;
    const rank = i.rank ? ` · #${i.rank} of ${i.players ?? i.rank}` : '';
    g.fillText(`${i.name}${rank}`, W / 2, panelTop + panelH - 46);
  }

  // Call to action on the grass.
  g.fillStyle = '#fff';
  g.font = `900 44px ${FONT}`;
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 12;
  g.fillText('Beat it:', W / 2, H - 110);
  g.font = `800 38px ${FONT}`;
  g.fillText(i.url.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 58);
  g.shadowBlur = 0;
  return c;
}

const relWord = (d: number, zero: string) => (d === 0 ? zero : d > 0 ? `+${d}` : `${d}`);

export const cardBlob = (c: HTMLCanvasElement): Promise<Blob | null> => new Promise((r) => c.toBlob(r, 'image/png'));

// --- Scenery --------------------------------------------------------------------

type Rng = ReturnType<typeof createRng>;

function drawLandscape(g: CanvasRenderingContext2D, rng: Rng): void {
  const sky = g.createLinearGradient(0, 0, 0, H * 0.72);
  sky.addColorStop(0, '#6fa3cf');
  sky.addColorStop(0.55, '#a9c9de');
  sky.addColorStop(1, '#f3dcc0');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // Late sun, low and warm.
  const sun = g.createRadialGradient(820, 900, 10, 820, 900, 360);
  sun.addColorStop(0, 'rgba(255,241,214,0.95)');
  sun.addColorStop(1, 'rgba(255,241,214,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);

  // Top left, clear of the score panel.
  drawJet(g, 150, 150, 0.5);

  // Three tree lines, back to front, fading into the haze.
  treeLine(g, rng, 960, '#8fb0ad', 55, 120, 0.9);
  treeLine(g, rng, 1010, '#5d877b', 70, 160, 1);
  treeLine(g, rng, 1060, '#355e4e', 90, 200, 1);

  // The fairway.
  const grass = g.createLinearGradient(0, 1030, 0, H);
  grass.addColorStop(0, '#8cc46a');
  grass.addColorStop(1, '#5f9a4a');
  g.fillStyle = grass;
  g.beginPath();
  g.moveTo(0, 1090);
  g.bezierCurveTo(300, 1040, 700, 1070, W, 1050);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.closePath();
  g.fill();

  drawBasket(g, 930, 1180, 0.8);
}

function treeLine(g: CanvasRenderingContext2D, rng: Rng, base: number, color: string, minH: number, maxH: number, density: number): void {
  g.fillStyle = color;
  g.fillRect(0, base - 6, W, H - base + 6);
  for (let x = -40; x < W + 40; x += 34 / density) {
    const h = rng.range(minH, maxH);
    const w = h * rng.range(0.32, 0.42);
    const cx = x + rng.range(-10, 10);
    // A fir: three stacked, jittered triangles.
    for (let k = 0; k < 3; k++) {
      const top = base - h + k * h * 0.26;
      const half = (w / 2) * (0.6 + k * 0.25);
      g.beginPath();
      g.moveTo(cx, top);
      g.lineTo(cx + half, top + h * 0.42);
      g.lineTo(cx - half, top + h * 0.42);
      g.closePath();
      g.fill();
    }
  }
}

function drawJet(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  // Contrail first, so the jet sits on it.
  const trail = g.createLinearGradient(x - 600 * s, y + 140 * s, x, y);
  trail.addColorStop(0, 'rgba(255,255,255,0)');
  trail.addColorStop(1, 'rgba(255,255,255,0.75)');
  g.strokeStyle = trail;
  g.lineWidth = 9 * s;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 600 * s, y + 140 * s);
  g.lineTo(x - 40 * s, y + 9 * s);
  g.stroke();
  g.translate(x, y);
  g.rotate(-0.23);
  g.scale(s, s);
  g.fillStyle = '#f4f6f8';
  // Fuselage, wings, tail.
  roundRect(g, -80, -11, 160, 22, 11);
  g.fill();
  g.beginPath();
  g.moveTo(-10, 0);
  g.lineTo(30, 0);
  g.lineTo(-30, 62);
  g.lineTo(-48, 62);
  g.closePath();
  g.moveTo(-10, 0);
  g.lineTo(30, 0);
  g.lineTo(-30, -62);
  g.lineTo(-48, -62);
  g.closePath();
  g.moveTo(-62, 0);
  g.lineTo(-80, -40);
  g.lineTo(-92, -40);
  g.lineTo(-80, 0);
  g.closePath();
  g.fill();
  g.restore();
}

function drawBasket(g: CanvasRenderingContext2D, x: number, ground: number, s: number): void {
  g.save();
  g.translate(x, ground);
  g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(0, 0, 70, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9ced3';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -230);
  g.stroke();
  // Tray.
  g.fillStyle = '#ffd23f';
  roundRect(g, -78, -112, 156, 30, 10);
  g.fill();
  // Chains hanging from the band to the pole.
  g.strokeStyle = '#aeb5bb';
  g.lineWidth = 4;
  for (let k = -5; k <= 5; k++) {
    g.beginPath();
    g.moveTo(k * 13, -226);
    g.quadraticCurveTo(k * 9, -170, k * 3, -118);
    g.stroke();
  }
  g.fillStyle = '#ffd23f';
  roundRect(g, -70, -240, 140, 18, 9);
  g.fill();
  g.restore();
}

// --- Text and shapes -------------------------------------------------------------

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The biggest font size up to `max` at which `text` fits in `width`. */
function fitFont(g: CanvasRenderingContext2D, text: string, max: number, width: number): number {
  let size = max;
  for (; size > 40; size -= 6) {
    g.font = `900 ${size}px ${FONT}`;
    if (g.measureText(text).width <= width) break;
  }
  return size;
}

/** Centered text with extra letter spacing. */
function spaced(g: CanvasRenderingContext2D, text: string, cx: number, y: number, gap: number): void {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  g.textAlign = 'left';
  chars.forEach((ch, k) => {
    g.fillText(ch, x, y);
    x += widths[k] + gap;
  });
  g.textAlign = 'center';
}
