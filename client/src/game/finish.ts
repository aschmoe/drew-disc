// The cards at the end of a hole and of a round: posting the score to its leaderboard and sharing a
// picture of it. Network trouble never blocks a card; it just shows without a board.

import { cleanName, type BoardResponse } from '@shared/scores';
import { fetchBoard, newScoreId, postScore, savedName, saveName } from '../net/scores';
import { ResultsCard, type CardActions, type RoundSummary } from '../ui/results';
import { cardBlob, drawShareCard, shareText, type ShareInfo } from '../ui/shareCard';
import type { Scorecard } from './round';

export interface HoleInfo {
  /** Leaderboard id, the hole's id (`seatac-01`). */
  board: string;
  course: string;
  holeNumber: number;
  /** Holed out, so the score can go on the board (a picked-up hole can't). */
  holed: boolean;
  /** Played with ?debug (lie jumps, exact sliders): shown, never posted. */
  practice?: boolean;
  /** During a round: how it stands, shown under the hole's score. */
  roundLine?: string;
}

export interface RoundInfo extends RoundSummary {
  /** The round's leaderboard (`seatac-front-1k2x9a`). */
  board: string;
  /** "Front 9". */
  label: string;
  course: string;
  /** Posting id saved with the round, so a reload doesn't post it twice. */
  id: string;
  practice?: boolean;
}

/** What is being posted: one hole, or a whole round. */
interface Target {
  board: string;
  id: string;
  strokes: number;
  holes: number;
  postable: boolean;
  /** Shown instead of posting when not postable. */
  note: string;
  share: Omit<ShareInfo, 'name' | 'rank' | 'players' | 'url'>;
}

export class HoleFinish {
  private card: ResultsCard;
  private target: Target | null = null;
  private postedAs: string | null = null;
  private board: BoardResponse | null = null;
  private shareFile: File | null = null;
  /** Bumped on each new card, so a slow reply for an old one is dropped. */
  private seq = 0;

  constructor(
    root: HTMLElement,
    private toast: (text: string) => void,
  ) {
    this.card = new ResultsCard(root, {
      post: (name) => void this.post(name),
      changeName: () => this.card.setBoard({ kind: 'ask', name: this.postedAs ?? '' }),
      share: () => void this.share(),
    });
  }

  showHole(score: Scorecard, hole: HoleInfo, actions: CardActions): Promise<void> {
    this.card.showHole(score, `${hole.course} ${score.holeName}`, `Leaderboard · ${score.holeName}`, this.wrap(actions), hole.roundLine);
    return this.begin({
      board: hole.board,
      id: newScoreId(),
      strokes: score.strokes,
      holes: 1,
      postable: hole.holed && !hole.practice,
      note: hole.practice ? 'Debug round, not posted.' : 'Hole out to get on the board.',
      share: { ...score, course: hole.course, holeNumber: hole.holeNumber },
    });
  }

  showRound(round: RoundInfo, actions: CardActions): Promise<void> {
    this.card.showRound(round, `Leaderboard · ${round.label}`, this.wrap(actions));
    return this.begin({
      board: round.board,
      id: round.id,
      strokes: round.strokes,
      holes: round.holes.length,
      postable: !round.practice,
      note: 'Debug round, not posted.',
      share: {
        course: round.course,
        holeNumber: 0,
        holeName: round.label,
        par: round.par,
        strokes: round.strokes,
        title: `${round.strokes}`,
        throws: [],
        round: { label: round.label, holes: round.holes },
      },
    });
  }

  hide(): void {
    this.seq++;
    this.card.hide();
  }

  /** Leaving a card drops any reply still on its way for it. */
  private wrap(a: CardActions): CardActions {
    const leave = <T extends unknown[]>(f: (...x: T) => void) => (...x: T) => {
      this.seq++;
      f(...x);
    };
    return { next: { label: a.next.label, run: leave(a.next.run) }, menu: a.menu && leave(a.menu) };
  }

  private async begin(t: Target): Promise<void> {
    const seq = ++this.seq;
    this.target = t;
    this.postedAs = null;
    this.board = null;
    this.shareFile = null;
    this.refreshShare();
    if (t.postable) {
      const name = savedName();
      if (name) return this.post(name);
      this.card.setBoard({ kind: 'ask' });
      return;
    }
    this.card.setBoard({ kind: 'loading' });
    const board = await fetchBoard(t.board);
    if (seq !== this.seq) return;
    this.card.setBoard(board ? { kind: 'board', board, note: t.note } : { kind: 'offline' });
  }

  private async post(raw: string): Promise<void> {
    const t = this.target;
    if (!t) return;
    const name = cleanName(raw);
    if (!name) {
      this.card.setBoard({ kind: 'ask', name: raw, error: 'Use letters and numbers, up to 16.' });
      return;
    }
    saveName(name);
    const seq = this.seq;
    this.card.setBoard({ kind: 'loading' });
    const board = await postScore(t.board, { id: t.id, name, strokes: t.strokes, holes: t.holes });
    if (seq !== this.seq) return;
    if (!board) {
      this.card.setBoard({ kind: 'offline' });
      return;
    }
    this.postedAs = name;
    this.board = board;
    this.card.setBoard({ kind: 'board', board, postedAs: name });
    this.refreshShare();
  }

  private info(): ShareInfo {
    return {
      ...this.target!.share,
      name: this.postedAs ?? undefined,
      rank: this.board?.you?.rank,
      players: this.board?.players,
      url: gameUrl(),
    };
  }

  /**
   * Draw the picture now, not on tap: phones only let a page share during the tap itself, and
   * encoding a PNG takes long enough to lose that.
   */
  private refreshShare(): void {
    const seq = this.seq;
    void cardBlob(drawShareCard(this.info())).then((blob) => {
      if (seq !== this.seq || !blob) return;
      this.shareFile = new File([blob], 'drew-disc.png', { type: 'image/png' });
    });
  }

  private async share(): Promise<void> {
    if (!this.target) return;
    const text = shareText(this.info());
    const url = gameUrl();
    const file = this.shareFile;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${url}` });
      } else if (navigator.share) {
        await navigator.share({ text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        this.toast('Copied. Paste it to a friend.');
      }
    } catch (e) {
      // Closing the share sheet is not an error. Anything else: fall back to copying.
      if ((e as DOMException)?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        this.toast('Copied. Paste it to a friend.');
      } catch {
        this.toast("Couldn't share from this browser.");
      }
    }
  }
}

/** The link friends open: this page, without ?debug and the like. */
const gameUrl = () => `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
