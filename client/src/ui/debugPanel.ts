// Debug panel (add ?debug to the URL): exact sliders for power, aim and angle, a full flight line
// and a throw button with a perfectly clean release. Handy for tuning and testing lines.

import { AIM_LIMIT, HYZER_LIMIT, MAX_POWER, type ShotSettings } from '../game/settings';
import { el } from './dom';

export interface DebugHandlers {
  settings(): ShotSettings;
  update(patch: Partial<ShotSettings>): void;
  throwClean(power: number): void;
  restart(): void;
}

export class DebugPanel {
  private panel = el('div', 'debug');
  private inputs: Record<'power' | 'aim' | 'hyzer', HTMLInputElement>;
  private values: Record<'power' | 'aim' | 'hyzer', HTMLSpanElement>;

  constructor(
    root: HTMLElement,
    private h: DebugHandlers,
  ) {
    const row = (key: 'power' | 'aim' | 'hyzer', label: string, min: number, max: number, step: number) => {
      const r = el('label', 'slider');
      const input = el('input');
      input.type = 'range';
      input.id = `debug-${key}`;
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      const v = el('span', 'svalue');
      r.append(el('span', 'sname', label), input, v);
      input.oninput = () => {
        const n = Number(input.value);
        this.h.update(key === 'power' ? { power: n } : key === 'aim' ? { aimOffsetDeg: n } : { hyzerDeg: n });
      };
      this.panel.append(r);
      return { input, v };
    };
    const p = row('power', 'Power', 0, MAX_POWER, 0.01);
    const a = row('aim', 'Aim', -AIM_LIMIT, AIM_LIMIT, 0.5);
    const hz = row('hyzer', 'Angle', -HYZER_LIMIT, HYZER_LIMIT, 1);
    this.inputs = { power: p.input, aim: a.input, hyzer: hz.input };
    this.values = { power: p.v, aim: a.v, hyzer: hz.v };

    const buttons = el('div', 'buttons');
    const line = el('button', 'pill', 'Full line');
    line.onclick = () => {
      this.h.update({ fullPreview: !this.h.settings().fullPreview });
      line.classList.toggle('on', this.h.settings().fullPreview);
    };
    const restart = el('button', 'pill', 'Restart');
    restart.onclick = () => this.h.restart();
    const go = el('button', 'pill throw-clean', 'Throw clean');
    go.onclick = () => this.h.throwClean(this.h.settings().power);
    buttons.append(line, restart, go);
    this.panel.append(buttons);
    root.append(this.panel);
    this.render();
  }

  render(): void {
    const s = this.h.settings();
    this.inputs.power.value = String(s.power);
    this.values.power.textContent = `${Math.round(s.power * 100)}%`;
    this.inputs.aim.value = String(s.aimOffsetDeg);
    this.values.aim.textContent = `${s.aimOffsetDeg.toFixed(1)}°`;
    this.inputs.hyzer.value = String(s.hyzerDeg);
    this.values.hyzer.textContent = `${s.hyzerDeg}°`;
  }
}
