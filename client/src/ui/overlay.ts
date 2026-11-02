// Read-only overlay: the top bar, toasts and hints. The hole-complete card is ui/results.ts.

import { el } from './dom';

export class Overlay {
  private top = el('div', 'hud-top');
  private toast = el('div', 'toast');
  private hint = el('div', 'hint');
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.hint.hidden = true;
    root.append(this.top, this.toast, this.hint);
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
}
