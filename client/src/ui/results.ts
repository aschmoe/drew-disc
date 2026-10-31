// The hole-complete card: the score, each throw, the hole's leaderboard and the buttons to share
// or go again. It only draws; game/finish.ts does the posting and sharing.

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
  /** `postedAs` set when this hole is on the board under that name; `note` replaces the footer. */
  | { kind: 'board'; board: BoardResponse; postedAs?: string; note?: string };

export interface ResultsHandlers {
  playAgain: () => void;
  post: (name: string) => void;
  changeName: () => void;
  share: () => void;
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

  /** `eyebrow` is the line above the score ("SeaTac Hole 1"). */
  show(s: Scorecard, eyebrow: string, boardTitle: string): void {
    this.par = s.par;
    this.wrap.innerHTML = '';
    const card = el('div', 'card');
    card.append(
      el('div', 'card-eyebrow', `${eyebrow} · Par ${s.par}`),
      el('div', 'card-title', s.title),
      el('div', 'card-sub', `${s.strokes} ${s.strokes === 1 ? 'throw' : 'throws'} (${relToPar(s.strokes, s.par)})`),
    );
    const list = el('ol', 'card-throws');
    for (const t of s.throws) {
      const li = el('li');
      const dot = el('span', 'dot');
      dot.style.background = t.color;
      li.append(dot, el('span', 'tdisc', t.disc), el('span', 'tdist', `${Math.round(t.distance * 3.28084)} ft`), el('span', 'tout', t.outcome));
      list.append(li);
    }
    const boardHead = el('div', 'board-head', boardTitle);
    const again = el('button', 'cta', 'Play again');
    again.onclick = () => {
      this.hide();
      this.h.playAgain();
    };
    const buttons = el('div', 'card-buttons');
    buttons.append(this.shareBtn, again);
    card.append(list, boardHead, this.boardEl, buttons);
    this.wrap.append(card);
    this.wrap.hidden = false;
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
