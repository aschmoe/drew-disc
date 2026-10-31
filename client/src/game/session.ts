// A sitting at the game: the start menu, then a single hole or a round (front 9, back 9, 18), with
// a card after every hole and a round card at the end. Game plays one hole; this decides which
// one comes next and what the cards say.
//
// Every slot is hole 1 for now, so the scene never changes between holes. When a round reaches a
// slot with a different hole file, the page reloads and carries on from the saved round (boot
// builds the scene for the round's next hole); rebuilding the scene in place can come later.

import type { CourseDef } from '../content/hole';
import { newScoreId } from '../net/scores';
import { Menu, type MenuChoice } from '../ui/menu';
import { HoleFinish } from './finish';
import type { Game } from './game';
import type { Scorecard } from './round';
import {
  FORMATS,
  loadRound,
  nextSlot,
  relText,
  holeBoardId,
  roundBoardId,
  roundSlots,
  roundTotals,
  saveRound,
  type RoundFormat,
  type RoundState,
} from './rounds';

/** Set just before a reload that should carry straight on with the saved round. */
const CONTINUE_KEY = 'drewdisc.continue';

/** The hole file boot should build: the saved round's next hole when carrying on, else hole 1. */
export function holeFileToLoad(course: CourseDef): string {
  const carryOn = takeContinueFlag(false);
  const r = carryOn ? loadRound(course) : null;
  const slot = r ? nextSlot(course, r) : null;
  return course.holes[slot ?? 0];
}

export class Session {
  private finish: HoleFinish;
  private menu: Menu;
  private round: RoundState | null = null;
  /** Slot of the single hole being played, when not in a round. */
  private single = 0;

  constructor(
    private game: Game,
    private course: CourseDef,
    /** The hole file the scene was built from. */
    private loadedFile: string,
    root: HTMLElement,
    toast: (text: string) => void,
    private practice: boolean,
  ) {
    this.finish = new HoleFinish(root, toast);
    this.menu = new Menu(root);
    game.onHoleDone = (sc, holed) => this.holeDone(sc, holed);
  }

  start(): void {
    const saved = loadRound(this.course);
    if (saved && takeContinueFlag(true)) return this.playNext(saved);
    this.showMenu();
  }

  private showMenu(): void {
    this.game.idle();
    const saved = loadRound(this.course);
    const pick = (format: RoundFormat): MenuChoice => ({
      label: FORMATS[format].label,
      detail: format === 'one' ? 'Hole 1, as many times as you like' : `${roundSlots(this.course, format).length} holes, one score`,
      run: () => this.begin(format),
    });
    const resume: MenuChoice | undefined = saved
      ? {
          label: `Continue ${FORMATS[saved.format].label}`,
          detail: `Hole ${nextSlot(this.course, saved)! + 1} next, ${relText(roundTotals(saved.scores).diff)} so far`,
          run: () => this.playNext(saved),
        }
      : undefined;
    this.menu.show(`${this.course.name} · ${this.course.location ?? ''}`.replace(/ · $/, ''), [pick('full'), pick('front'), pick('back'), pick('one')], resume);
  }

  private begin(format: RoundFormat): void {
    if (format === 'one') {
      this.round = null;
      this.single = 0;
      this.game.startHole(`Hole ${this.single + 1}`, '', true);
      return;
    }
    const r: RoundState = { v: 1, course: this.course.id, format, id: newScoreId(), scores: [] };
    saveRound(r);
    this.playNext(r);
  }

  private playNext(r: RoundState): void {
    this.round = r;
    const slot = nextSlot(this.course, r);
    if (slot === null) return this.showRoundCard(r);
    if (this.course.holes[slot] !== this.loadedFile) {
      // A different hole: rebuild by reloading, which carries on with the saved round.
      saveRound(r);
      setContinueFlag();
      location.reload();
      return;
    }
    const t = roundTotals(r.scores);
    const tag = t.thru ? `${FORMATS[r.format].label} ${relText(t.diff)}` : FORMATS[r.format].label;
    // No restarts in a round: that would be a free mulligan.
    this.game.startHole(`Hole ${slot + 1}`, tag, this.practice);
  }

  private holeDone(sc: Scorecard, holed: boolean): void {
    const r = this.round;
    const slot = r ? nextSlot(this.course, r)! : this.single;
    const holeInfo = {
      board: holeBoardId(this.course, slot),
      course: this.course.name,
      holed,
      practice: this.practice,
    };
    if (!r) {
      void this.finish.showHole(sc, { ...holeInfo, holeNumber: this.single + 1 }, {
        next: { label: 'Play again', run: () => this.begin('one') },
        menu: () => this.showMenu(),
      });
      return;
    }
    r.scores.push({ strokes: sc.strokes, par: sc.par, holed });
    const more = nextSlot(this.course, r) !== null;
    // A finished round is cleared from storage; this card and the round card still have it.
    saveRound(more ? r : null);
    const t = roundTotals(r.scores);
    void this.finish.showHole(
      sc,
      { ...holeInfo, holeNumber: slot + 1, roundLine: `${FORMATS[r.format].label} · thru ${t.thru} · ${relText(t.diff)}` },
      {
        next: more ? { label: 'Next hole', run: () => this.playNext(r) } : { label: 'See round', run: () => this.showRoundCard(r) },
        menu: more ? () => this.showMenu() : undefined,
      },
    );
  }

  private showRoundCard(r: RoundState): void {
    this.game.idle();
    const slots = roundSlots(this.course, r.format);
    const t = roundTotals(r.scores);
    const label = FORMATS[r.format].label;
    void this.finish.showRound(
      {
        board: roundBoardId(this.course, r.format)!,
        label,
        course: this.course.name,
        id: r.id,
        practice: this.practice,
        eyebrow: `${this.course.name} · ${label}`,
        strokes: t.strokes,
        par: t.par,
        holes: r.scores.map((s, i) => ({ number: slots[i] + 1, ...s })),
      },
      { next: { label: 'New round', run: () => this.showMenu() } },
    );
    this.round = null;
  }
}

function setContinueFlag(): void {
  try {
    sessionStorage.setItem(CONTINUE_KEY, '1');
  } catch {
    // Without sessionStorage the reload lands on the menu, where Continue still works.
  }
}

/** Whether a reload asked to carry straight on; `clear` uses the flag up. */
function takeContinueFlag(clear: boolean): boolean {
  try {
    const set = sessionStorage.getItem(CONTINUE_KEY) === '1';
    if (clear) sessionStorage.removeItem(CONTINUE_KEY);
    return set;
  } catch {
    return false;
  }
}
