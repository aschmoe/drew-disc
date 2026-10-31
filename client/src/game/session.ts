// A sitting at the game: the start menu, then a single hole or a round (front 9, back 9, 18), with
// a card after every hole and a round card at the end. Game plays one hole; this decides which
// one comes next and what the cards say.
//
// The course lists a hole file per slot (most slots repeat hole 1 for now). Before each hole the
// session asks boot's `showHole` for that slot, which swaps the scenery when the file changes.

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

export class Session {
  private finish: HoleFinish;
  private menu: Menu;
  private round: RoundState | null = null;
  /** Slot of the single hole being played, when not in a round. */
  private single = 0;

  constructor(
    private game: Game,
    private course: CourseDef,
    /** Puts hole file `file` on screen as hole `number` (rebuilding the scenery if it changed). */
    private showHole: (file: string, number: number) => Promise<void>,
    root: HTMLElement,
    toast: (text: string) => void,
    private practice: boolean,
  ) {
    this.finish = new HoleFinish(root, toast);
    this.menu = new Menu(root);
    game.onHoleDone = (sc, holed) => this.holeDone(sc, holed);
  }

  start(): void {
    this.showMenu();
  }

  private showMenu(): void {
    this.game.idle();
    const saved = loadRound(this.course);
    const pick = (format: RoundFormat): MenuChoice => ({
      label: FORMATS[format].label,
      detail: format === 'one' ? 'Hole 1, as many times as you like' : `${roundSlots(this.course, format).length} holes, one score`,
      run: () => void this.begin(format),
    });
    const resume: MenuChoice | undefined = saved
      ? {
          label: `Continue ${FORMATS[saved.format].label}`,
          detail: `Hole ${nextSlot(this.course, saved)! + 1} next, ${relText(roundTotals(saved.scores).diff)} so far`,
          run: () => void this.playNext(saved),
        }
      : undefined;
    this.menu.show(`${this.course.name} · ${this.course.location ?? ''}`.replace(/ · $/, ''), [pick('full'), pick('front'), pick('back'), pick('one')], resume);
  }

  private async begin(format: RoundFormat): Promise<void> {
    if (format === 'one') {
      this.round = null;
      this.single = 0;
      await this.showHole(this.course.holes[this.single], this.single + 1);
      this.game.startHole(`Hole ${this.single + 1}`, '', true);
      return;
    }
    const r: RoundState = { v: 1, course: this.course.id, format, id: newScoreId(), scores: [] };
    saveRound(r);
    return this.playNext(r);
  }

  private async playNext(r: RoundState): Promise<void> {
    this.round = r;
    const slot = nextSlot(this.course, r);
    if (slot === null) return this.showRoundCard(r);
    await this.showHole(this.course.holes[slot], slot + 1);
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
        next: { label: 'Play again', run: () => void this.begin('one') },
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
        next: more ? { label: 'Next hole', run: () => void this.playNext(r) } : { label: 'See round', run: () => this.showRoundCard(r) },
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
