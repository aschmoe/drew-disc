// The overlay UI. Milestone 1 uses a debug control panel (sliders and buttons); the real
// pull-and-flick controls replace it in milestone 2.

import { DISCS, type Disc } from '@shared/discs';
import type { ThrowStyle } from '../sim/flight';

export interface ShotSettings {
  discId: string;
  style: ThrowStyle;
  power: number;
  /** Degrees off the line to the basket. Positive aims right. */
  aimOffsetDeg: number;
  hyzerDeg: number;
  fullPreview: boolean;
}

export interface HudHandlers {
  onChange(settings: ShotSettings): void;
  onThrow(): void;
  onRestart(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class Hud {
  readonly settings: ShotSettings;
  private top = el('div', 'hud-top');
  private toast = el('div', 'toast');
  private panel = el('div', 'panel');
  private discButtons = new Map<string, HTMLButtonElement>();
  private sliders: Record<'power' | 'aim' | 'hyzer', { input: HTMLInputElement; value: HTMLSpanElement }>;
  private styleButton: HTMLButtonElement;
  private throwButton: HTMLButtonElement;
  private modeLabel = el('div', 'mode');
  private toastTimer = 0;

  constructor(
    root: HTMLElement,
    bag: string[],
    private handlers: HudHandlers,
  ) {
    this.settings = { discId: bag[1] ?? bag[0], style: 'backhand', power: 0.85, aimOffsetDeg: 0, hyzerDeg: 0, fullPreview: false };

    const discs = el('div', 'discs');
    for (const id of bag) {
      const d: Disc = DISCS[id];
      const b = el('button', 'disc');
      b.innerHTML = `<span class="swatch" style="background:${d.color}"></span><span class="dname">${d.name}</span><span class="nums">${d.flight.speed} | ${d.flight.glide} | ${d.flight.turn} | ${d.flight.fade}</span>`;
      b.onclick = () => this.update({ discId: id });
      this.discButtons.set(id, b);
      discs.append(b);
    }

    const slider = (key: 'power' | 'aim' | 'hyzer', label: string, min: number, max: number, step: number, value: number) => {
      const row = el('label', 'slider');
      const name = el('span', 'sname', label);
      const input = el('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      const v = el('span', 'svalue');
      row.append(name, input, v);
      input.oninput = () => {
        const n = Number(input.value);
        if (key === 'power') this.update({ power: n });
        if (key === 'aim') this.update({ aimOffsetDeg: n });
        if (key === 'hyzer') this.update({ hyzerDeg: n });
      };
      return { row, input, value: v };
    };
    const power = slider('power', 'Power', 0, 1.15, 0.01, this.settings.power);
    const aim = slider('aim', 'Aim', -40, 40, 0.5, 0);
    const hyzer = slider('hyzer', 'Angle', -35, 35, 1, 0);
    this.sliders = { power, aim, hyzer };

    const row = el('div', 'buttons');
    this.styleButton = el('button', 'pill');
    this.styleButton.onclick = () => this.update({ style: this.settings.style === 'backhand' ? 'forehand' : 'backhand' });
    const preview = el('button', 'pill');
    preview.onclick = () => {
      this.update({ fullPreview: !this.settings.fullPreview });
      preview.classList.toggle('on', this.settings.fullPreview);
    };
    preview.textContent = 'Full line';
    const restart = el('button', 'pill', 'Restart');
    restart.onclick = () => handlers.onRestart();
    this.throwButton = el('button', 'throw', 'THROW');
    this.throwButton.onclick = () => handlers.onThrow();
    row.append(this.styleButton, preview, restart, this.throwButton);

    this.panel.append(this.modeLabel, discs, power.row, aim.row, hyzer.row, row);
    root.append(this.top, this.toast, this.panel);
    this.render();
  }

  update(patch: Partial<ShotSettings>): void {
    Object.assign(this.settings, patch);
    this.render();
    this.handlers.onChange(this.settings);
  }

  /** Set values without echoing them back through onChange (used when the game re-aims). */
  set(patch: Partial<ShotSettings>): void {
    Object.assign(this.settings, patch);
    this.render();
  }

  private render(): void {
    const s = this.settings;
    for (const [id, b] of this.discButtons) b.classList.toggle('on', id === s.discId);
    this.sliders.power.input.value = String(s.power);
    this.sliders.power.value.textContent = s.power > 1 ? `${Math.round(s.power * 100)}% (muscled)` : `${Math.round(s.power * 100)}%`;
    this.sliders.power.value.classList.toggle('warn', s.power > 1);
    this.sliders.aim.input.value = String(s.aimOffsetDeg);
    this.sliders.aim.value.textContent = `${s.aimOffsetDeg > 0 ? 'R ' : s.aimOffsetDeg < 0 ? 'L ' : ''}${Math.abs(s.aimOffsetDeg).toFixed(1)}°`;
    this.sliders.hyzer.input.value = String(s.hyzerDeg);
    this.sliders.hyzer.value.textContent = s.hyzerDeg === 0 ? 'Flat' : s.hyzerDeg > 0 ? `Hyzer ${s.hyzerDeg}°` : `Anhyzer ${-s.hyzerDeg}°`;
    this.styleButton.textContent = s.style === 'backhand' ? 'Backhand' : 'Forehand';
  }

  setHeader(html: string): void {
    this.top.innerHTML = html;
  }

  setMode(text: string): void {
    this.modeLabel.textContent = text;
  }

  setThrowEnabled(on: boolean): void {
    this.throwButton.disabled = !on;
    this.panel.classList.toggle('busy', !on);
  }

  showToast(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), ms);
  }
}
