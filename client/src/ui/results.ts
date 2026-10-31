// The end-of-hole and end-of-round cards: the score, each throw (or each hole), the leaderboard
// and the buttons to share or go on. It only draws; game/finish.ts does the posting and sharing.

import type { BoardResponse } from '@shared/scores';
import { NAME_MAX } from '@shared/scores';
import type { Scorecard } from '../game/round';
import { el } from './dom';

export type BoardState =
  /** Ask for a name before posting. */
  | { kind: 'ask'; name?: string; error?: string }
  | { kind: 'loading' }
  /** No scoreboard reachable (offline, or a build without a backend). */
  | { kind: 'offline' }
  /** `postedAs` set when this score is on the board under that name; `note` replaces the footer. */
  | { kind: 'board'; board: BoardResponse; postedAs?: string; note?: string };

export interface ResultsHandlers {
  post: (name: string) => void;
  changeName: () => void;
  share: () => void;
}

/** What the card's buttons do. */
export interface CardActions {
  /** The big button: "Next hole", "Play again"... */
  next: { label: string; run: () => void };
  /** A small "Menu" link under the buttons, when set. */
  menu?: () => void;
}

export interface RoundSummary {
  /** "SeaTac · Front 9". */
  eyebrow: string;
  strokes: number;
  par: number;
  holes: { number: number; strokes: number; par: number; holed: boolean }[];
}

/** "E", "+2", "-1": a score against par. */
export const relToPar = (strokes: number, par: number) => {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
};

export class ResultsCard {
  private wrap = el('div', 'card-wrap');
  private boardEl = el('div', 'board');
  private shareBtn = el('button', 'share-btn', 'Share');
  private par = 3;

  constructor(root: HTMLElement, private h: ResultsHandlers) {
    this.wrap.hidden = true;
    root.append(this.wrap);
    this.shareBtn.onclick = () => this.h.share();
  }

  /**
   * After a hole. `eyebrow` is the line above the score ("SeaTac Hole 4"); `roundLine`, during a
   * round, says how the round stands ("Front 9 · thru 4 · +1").
   */
  showHole(s: Scorecard, eyebrow: string, boardTitle: string, actions: CardActions, roundLine?: string): void {
    this.par = s.par;
    const card = this.begin();
    card.append(
      el('div', 'card-eyebrow', `${eyebrow} · Par ${s.par}`),
      el('div', 'card-title', s.title),
      el('div', 'card-sub', `${s.strokes} ${s.strokes === 1 ? 'throw' : 'throws'} (${relToPar(s.strokes, s.par)})`),
    );
    if (roundLine) card.append(el('div', 'card-round', roundLine));
    const list = el('ol', 'card-throws');
    for (const t of s.throws) {
      const li = el('li');
      const dot = el('span', 'dot');
      dot.style.background = t.color;
      li.append(dot, el('span', 'tdisc', t.disc), el('span', 'tdist', `${Math.round(t.distance * 3.28084)} ft`), el('span', 'tout', t.outcome));
      list.append(li);
    }
    card.append(list);
    this.finishCard(card, boardTitle, actions);
  }

  /** After the last hole of a round: the total and every hole. */
  showRound(r: RoundSummary, boardTitle: string, actions: CardActions): void {
    this.par = r.par;
    const card = this.begin();
    card.append(
      el('div', 'card-eyebrow', `${r.eyebrow} · Par ${r.par}`),
      el('div', 'card-title', `${r.strokes}`),
      el('div', 'card-sub', `${relToPar(r.strokes, r.par)} · ${r.holes.length} holes`),
    );
    const grid = el('div', 'round-grid');
    for (const h of r.holes) {
      const d = h.strokes - h.par;
      const cell = el('div', `round-cell ${d < 0 ? 'under' : d > 0 ? 'over' : 'even'}`);
      cell.title = h.holed ? '' : 'Picked up';
      cell.append(el('span', 'rnum', `${h.number}`), el('span', 'rstrokes', `${h.strokes}${h.holed ? '' : '*'}`));
      grid.append(cell);
    }
    card.append(grid);
    if (r.holes.some((h) => !h.holed)) card.append(el('div', 'board-msg', '* picked up at the stroke limit'));
    this.finishCard(card, boardTitle, actions);
  }

  private begin(): HTMLDivElement {
    this.wrap.innerHTML = '';
    this.setShareLabel('Share');
    const card = el('div', 'card');
    this.wrap.append(card);
    this.wrap.hidden = false;
    return card;
  }

  private finishCard(card: HTMLDivElement, boardTitle: string, actions: CardActions): void {
    const go = el('button', 'cta', actions.next.label);
    go.onclick = () => {
      this.hide();
      actions.next.run();
    };
    const buttons = el('div', 'card-buttons');
    buttons.append(this.shareBtn, go);
    card.append(el('div', 'board-head', boardTitle), this.boardEl, buttons);
    if (actions.menu) {
      const menu = el('button', 'link card-menu', 'Menu');
      menu.type = 'button';
      menu.onclick = () => {
        this.hide();
        actions.menu!();
      };
      card.append(menu);
    }
    card.scrollTop = 0;
  }

  hide(): void {
    this.wrap.hidden = true;
  }

  setShareLabel(text: string): void {
    this.shareBtn.textContent = text;
  }

  setBoard(state: BoardState): void {
    const b = this.boardEl;
    b.innerHTML = '';
    if (state.kind === 'loading') {
      b.append(el('div', 'board-msg', 'Loading the leaderboard...'));
    } else if (state.kind === 'offline') {
      b.append(el('div', 'board-msg', "The leaderboard can't be reached right now. You can still share your score."));
    } else if (state.kind === 'ask') {
      this.drawAsk(state.name ?? '', state.error);
    } else {
      this.drawBoard(state.board, state.postedAs, state.note);
    }
  }

  private drawAsk(name: string, error?: string): void {
    const form = el('form', 'name-form');
    const input = el('input', 'name-input');
    input.type = 'text';
    input.placeholder = 'Your name';
    input.maxLength = NAME_MAX;
    input.setAttribute('autocomplete', 'nickname');
    input.enterKeyHint = 'send';
    input.value = name;
    const go = el('button', 'name-post', 'Post score');
    go.type = 'submit';
    form.append(input, go);
    form.onsubmit = (e) => {
      e.preventDefault();
      input.blur();
      this.h.post(input.value);
    };
    this.boardEl.append(el('div', 'board-msg', 'Put your name on the board for this hole.'), form);
    if (error) this.boardEl.append(el('div', 'board-error', error));
  }

  private drawBoard(board: BoardResponse, postedAs?: string, note?: string): void {
    const you = board.you;
    const rows = el('ol', 'board-rows');
    if (board.entries.length === 0) rows.append(el('li', 'board-empty', 'No scores yet. Be the first.'));
    let youShown = false;
    board.entries.forEach((e, i) => {
      const mine = !!you && e.name === you.name && e.strokes === you.strokes && i + 1 === you.rank;
      youShown ||= mine;
      rows.append(this.row(i + 1, e.name, e.strokes, mine));
    });
    // Further down than the board shows: add the player's own line under it.
    if (you && !youShown) {
      rows.append(el('li', 'board-gap', '...'), this.row(you.rank, you.name, you.strokes, true));
    }
    this.boardEl.append(rows);

    const foot = el('div', 'board-foot');
    if (note) foot.append(el('span', '', note));
    else if (postedAs) {
      foot.append(el('span', '', `Posted as ${postedAs} · `));
      const change = el('button', 'link', 'Change name');
      change.type = 'button';
      change.onclick = () => this.h.changeName();
      foot.append(change);
    }
    if (board.players > 0) foot.append(el('span', 'board-count', `${board.players} ${board.players === 1 ? 'player' : 'players'}`));
    this.boardEl.append(foot);
  }

  private row(rank: number, name: string, strokes: number, mine: boolean): HTMLLIElement {
    const li = el('li', mine ? 'board-row mine' : 'board-row');
    li.append(
      el('span', 'brank', `${rank}`),
      el('span', 'bname', name),
      el('span', 'bstrokes', `${strokes}`),
      el('span', 'brel', relToPar(strokes, this.par)),
    );
    return li;
  }
}
