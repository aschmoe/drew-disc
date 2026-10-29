// The play controls, built for a thumb on a phone and working the same with a mouse:
//
// - Drag anywhere in the scene to aim.
// - Bag (bottom left): pick a disc.  Style (bottom right): backhand / forehand.
// - Angle (right edge): drag up for anhyzer, down for hyzer. Hidden while putting.
// - Throw pad: put a thumb on the disc and PULL DOWN to set power (the ring fills; the green
//   band is the sweet spot, red is muscling it), then FLICK UP to release. A crooked flick pulls
//   or pushes the throw; a fast flick is a cleaner release. Letting go without a flick cancels.

import { DISCS } from '@shared/discs';
import { HYZER_LIMIT, MAX_POWER, type ShotSettings } from '../game/settings';
import { el, svg } from './dom';

export interface ThrowGesture {
  power: number;
  /** Pull or push from the flick, degrees. Positive pushes right. */
  flickDeg: number;
  /** Release cleanliness, 0.55 to 1. */
  spin: number;
}

export interface ControlsHandlers {
  settings(): ShotSettings;
  update(patch: Partial<ShotSettings>): void;
  /** Live power while pulling; null when the pull ends. */
  pulling(power: number | null): void;
  throwDisc(g: ThrowGesture): void;
  look(): void;
  /** Aim drag, in degrees to add. */
  aimBy(deltaDeg: number): void;
}

const SWEET_LOW = 0.88;
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

export class Controls {
  private root = el('div', 'controls');
  private bagButton = el('button', 'bag-btn');
  private bagSheet = el('div', 'bag-sheet');
  private styleButton = el('button', 'style-btn');
  private lookButton = el('button', 'look-btn');
  private angle = el('div', 'angle');
  private angleThumb = el('div', 'angle-thumb');
  private angleLabel = el('div', 'angle-label');
  private pad = el('div', 'pad');
  private padDisc = el('div', 'pad-disc');
  private padLabel = el('div', 'pad-label');
  private ring: SVGSVGElement;
  private ringFill: SVGCircleElement;
  private ringTarget: SVGLineElement;
  private enabled = true;
  private putting = false;

  constructor(
    host: HTMLElement,
    bag: string[],
    private h: ControlsHandlers,
    private canvas: HTMLElement,
  ) {
    // Power ring: track, sweet band, red zone, fill, putt target tick. Drawn clockwise from the top.
    const frac = (p: number) => p / MAX_POWER;
    const arc = (from: number, to: number, cls: string) =>
      `<circle class="${cls}" r="${RING_R}" cx="70" cy="70" stroke-dasharray="${(frac(to) - frac(from)) * RING_C} ${RING_C}" stroke-dashoffset="${-frac(from) * RING_C}" />`;
    this.ring = svg(`
      <svg class="ring" viewBox="0 0 140 140" aria-hidden="true">
        <g transform="rotate(-90 70 70)">
          <circle class="ring-track" r="${RING_R}" cx="70" cy="70" />
          ${arc(SWEET_LOW, 1, 'ring-sweet')}
          ${arc(1, MAX_POWER, 'ring-hot')}
          <circle class="ring-fill" r="${RING_R}" cx="70" cy="70" stroke-dasharray="0 ${RING_C}" />
        </g>
        <line class="ring-target" x1="70" y1="8" x2="70" y2="24" />
      </svg>`);
    this.ringFill = this.ring.querySelector('.ring-fill')!;
    this.ringTarget = this.ring.querySelector('.ring-target')!;
    this.pad.append(this.ring, this.padDisc, this.padLabel);

    this.angle.append(el('div', 'angle-end', 'ANHYZER'), el('div', 'angle-track'), this.angleThumb, el('div', 'angle-end bottom', 'HYZER'), this.angleLabel);

    this.lookButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg><span>Look</span>`;
    this.lookButton.setAttribute('aria-label', 'Look at the basket');

    for (const id of bag) {
      const d = DISCS[id];
      const b = el('button', 'bag-disc');
      b.dataset.id = id;
      b.innerHTML = `<span class="swatch" style="background:${d.color}"></span><span class="dname">${d.name}</span><span class="nums">${d.flight.speed} | ${d.flight.glide} | ${d.flight.turn} | ${d.flight.fade}</span>`;
      b.onclick = () => {
        this.h.update({ discId: id });
        this.bagSheet.hidden = true;
      };
      this.bagSheet.append(b);
    }
    this.bagSheet.hidden = true;

    this.root.append(this.lookButton, this.angle, this.bagSheet, this.bagButton, this.styleButton, this.pad);
    host.append(this.root);

    this.bagButton.onclick = () => (this.bagSheet.hidden = !this.bagSheet.hidden);
    this.styleButton.onclick = () => this.h.update({ style: this.h.settings().style === 'backhand' ? 'forehand' : 'backhand' });
    this.lookButton.onclick = () => this.h.look();
    this.bindAngle();
    this.bindPad();
    this.bindAim();
    this.render();
  }

  render(): void {
    const s = this.h.settings();
    const d = DISCS[s.discId];
    this.bagButton.innerHTML = `<span class="swatch" style="background:${d.color}"></span><span class="bag-text"><span class="bag-name">${d.name}</span><span class="nums">${d.flight.speed} | ${d.flight.glide} | ${d.flight.turn} | ${d.flight.fade}</span></span>`;
    for (const b of this.bagSheet.querySelectorAll<HTMLButtonElement>('.bag-disc')) b.classList.toggle('on', b.dataset.id === s.discId);
    this.styleButton.textContent = s.style === 'backhand' ? 'Backhand' : 'Forehand';
    this.padDisc.style.setProperty('--disc', d.color);
    const t = (HYZER_LIMIT - s.hyzerDeg) / (2 * HYZER_LIMIT); // 0 = top (anhyzer), 1 = bottom (hyzer)
    this.angleThumb.style.top = `${t * 100}%`;
    this.angleLabel.textContent = s.hyzerDeg === 0 ? 'Flat' : s.hyzerDeg > 0 ? `Hyzer ${s.hyzerDeg}°` : `Anhyzer ${-s.hyzerDeg}°`;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('off', !on);
    if (!on) this.bagSheet.hidden = true;
  }

  setPutting(on: boolean, targetPower: number | null): void {
    this.putting = on;
    this.angle.hidden = on;
    this.root.classList.toggle('putting', on);
    this.ringTarget.style.display = targetPower === null ? 'none' : '';
    if (targetPower !== null) this.ringTarget.setAttribute('transform', `rotate(${(targetPower / MAX_POWER) * 360} 70 70)`);
  }

  /** Show a power on the ring (used by the keyboard throw too). */
  showPower(power: number | null): void {
    const p = power ?? 0;
    this.ringFill.setAttribute('stroke-dasharray', `${(p / MAX_POWER) * RING_C} ${RING_C}`);
    this.pad.classList.toggle('active', power !== null);
    this.pad.classList.toggle('hot', p > 1);
    this.padLabel.textContent = power === null ? (this.putting ? 'Pull to putt' : 'Pull, then flick') : `${Math.round(p * 100)}%`;
  }

  private bindAngle(): void {
    let active = false;
    const set = (clientY: number) => {
      const r = this.angle.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      this.h.update({ hyzerDeg: Math.round(HYZER_LIMIT - t * 2 * HYZER_LIMIT) });
    };
    this.angle.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      active = true;
      this.angle.setPointerCapture(e.pointerId);
      set(e.clientY);
    });
    this.angle.addEventListener('pointermove', (e) => active && set(e.clientY));
    const end = () => (active = false);
    this.angle.addEventListener('pointerup', end);
    this.angle.addEventListener('pointercancel', end);
    this.angle.addEventListener('dblclick', () => this.h.update({ hyzerDeg: 0 }));
  }

  private bindPad(): void {
    let start: { x: number; y: number } | null = null;
    let maxPull = 0;
    let lowest = { x: 0, y: 0 };
    let samples: { t: number; x: number; y: number }[] = [];
    const fullPull = () => Math.min(230, Math.max(110, window.innerHeight * 0.2));

    this.pad.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.pad.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY };
      lowest = { ...start };
      maxPull = 0;
      samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      this.showPower(0);
      this.h.pulling(0);
    });

    this.pad.addEventListener('pointermove', (e) => {
      if (!start) return;
      samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      if (samples.length > 40) samples.shift();
      const pull = Math.max(0, e.clientY - start.y);
      if (pull >= maxPull) {
        maxPull = pull;
        lowest = { x: e.clientX, y: e.clientY };
      }
      const power = Math.min(MAX_POWER, maxPull / fullPull());
      // The disc follows the thumb down while pulling.
      this.padDisc.style.transform = `translate(${(e.clientX - start.x) * 0.3}px, ${Math.min(pull, fullPull() * MAX_POWER)}px)`;
      this.showPower(power);
      this.h.pulling(power);
    });

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (!start) return;
      samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      const power = Math.min(MAX_POWER, maxPull / fullPull());
      start = null;
      this.padDisc.style.transform = '';
      this.showPower(null);
      this.h.pulling(null);
      if (cancelled || power < 0.05) return;

      // Flick: how far it came back up from the lowest point, and how fast. Any clear upward
      // flick throws; a lazy one just releases with less spin.
      const last = samples[samples.length - 1];
      const rise = lowest.y - last.y;
      if (rise < 30) {
        this.flashHint();
        return;
      }
      const from = samples.find((s) => s.y === lowest.y && s.x === lowest.x) ?? samples[0];
      const dt = Math.max(16, last.t - from.t) / 1000;
      const speed = Math.hypot(last.x - lowest.x, rise) / dt;
      const flickAngle = (Math.atan2(last.x - lowest.x, rise) * 180) / Math.PI;
      this.h.throwDisc({
        power,
        flickDeg: Math.max(-10, Math.min(10, flickAngle * 0.3)),
        spin: Math.max(0.55, Math.min(1, 0.55 + (speed - 450) / 2500)),
      });
    };
    this.pad.addEventListener('pointerup', (e) => finish(e, false));
    this.pad.addEventListener('pointercancel', (e) => finish(e, true));
  }

  private flashHint(): void {
    this.padLabel.textContent = 'Flick up to throw';
    this.pad.classList.add('nudge');
    window.setTimeout(() => this.pad.classList.remove('nudge'), 600);
  }

  private bindAim(): void {
    let last: number | null = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.bagSheet.hidden = true;
      last = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (last === null) return;
      const dx = e.clientX - last;
      last = e.clientX;
      // A full-width drag turns about 45 degrees, so small corrections are easy.
      this.h.aimBy((dx / window.innerWidth) * 45);
    });
    const end = () => (last = null);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }
}
