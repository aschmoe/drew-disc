// Read-only overlay: the top bar, toasts, hints and the hole-complete card.

import type { Scorecard } from '../game/round';
import { el } from './dom';

export class Overlay {
  private top = el('div', 'hud-top');
  private toast = el('div', 'toast');
  private hint = el('div', 'hint');
  private card = el('div', 'card-wrap');
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.card.hidden = true;
    this.hint.hidden = true;
    root.append(this.top, this.toast, this.hint, this.card);
  }

  setHeader(html: string): void {
    this.top.innerHTML = html;
  }

  showToast(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  setHint(text: string | null): void {
    this.hint.hidden = !text;
    if (text) this.hint.textContent = text;
  }

  showScorecard(s: Scorecard, onPlayAgain: () => void): void {
    const diff = s.strokes - s.par;
    const rel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
    this.card.innerHTML = '';
    const card = el('div', 'card');
    card.append(
      el('div', 'card-eyebrow', `${s.holeName} · Par ${s.par}`),
      el('div', 'card-title', s.title),
      el('div', 'card-sub', `${s.strokes} ${s.strokes === 1 ? 'throw' : 'throws'} (${rel})`),
    );
    const list = el('ol', 'card-throws');
    for (const t of s.throws) {
      const li = el('li');
      const dot = el('span', 'dot');
      dot.style.background = t.color;
      li.append(dot, el('span', 'tdisc', t.disc), el('span', 'tdist', `${Math.round(t.distance * 3.28084)} ft`), el('span', 'tout', t.outcome));
      list.append(li);
    }
    const again = el('button', 'cta', 'Play again');
    again.onclick = () => {
      this.card.hidden = true;
      onPlayAgain();
    };
    card.append(list, again);
    this.card.append(card);
    this.card.hidden = false;
  }

  hideScorecard(): void {
    this.card.hidden = true;
  }
}
