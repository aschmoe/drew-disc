// The start menu: pick a round (18 holes, front 9, back 9, or a single hole), or continue the one
// in progress, and the hole picker behind "Single hole". Shown over the tee view.

import { el } from './dom';

export interface MenuChoice {
  label: string;
  /** Smaller line under the label. */
  detail?: string;
  run: () => void;
}

export class Menu {
  private wrap = el('div', 'card-wrap menu-wrap');

  constructor(root: HTMLElement) {
    this.wrap.hidden = true;
    root.append(this.wrap);
  }

  /** `resume` is listed first and highlighted, when there is a round to go back to. */
  show(course: string, choices: MenuChoice[], resume?: MenuChoice): void {
    this.wrap.innerHTML = '';
    const card = el('div', 'card menu');
    card.append(el('div', 'menu-title', 'Drew Disc'), el('div', 'card-eyebrow', course));
    const list = el('div', 'menu-choices');
    const add = (c: MenuChoice, cls: string) => {
      const b = el('button', cls);
      b.type = 'button';
      b.append(el('span', 'mlabel', c.label));
      if (c.detail) b.append(el('span', 'mdetail', c.detail));
      b.onclick = () => {
        this.hide();
        c.run();
      };
      list.append(b);
    };
    if (resume) add(resume, 'menu-choice resume');
    for (const c of choices) add(c, 'menu-choice');
    card.append(list);
    this.wrap.append(card);
    this.wrap.hidden = false;
  }

  /** A grid of every hole on the course; tapping one plays it. */
  showHoles(holes: { number: number; detail: string }[], pick: (index: number) => void, back: () => void): void {
    this.wrap.innerHTML = '';
    const card = el('div', 'card menu');
    card.append(el('div', 'menu-title', 'Pick a hole'), el('div', 'card-eyebrow', 'Play it as often as you like'));
    const grid = el('div', 'hole-grid');
    holes.forEach((h, i) => {
      const b = el('button', 'hole-pick');
      b.type = 'button';
      b.append(el('span', 'hnum', `${h.number}`), el('span', 'hdetail', h.detail));
      b.onclick = () => {
        this.hide();
        pick(i);
      };
      grid.append(b);
    });
    const backBtn = el('button', 'link card-menu', 'Back');
    backBtn.type = 'button';
    backBtn.onclick = back;
    card.append(grid, backBtn);
    this.wrap.append(card);
    this.wrap.hidden = false;
  }

  hide(): void {
    this.wrap.hidden = true;
  }
}
