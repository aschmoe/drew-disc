// What happens when a hole ends: the results card, posting the score to the hole's leaderboard,
// and sharing a picture of it. Network trouble never blocks the card; it just shows without a board.

import { cleanName, type BoardResponse } from '@shared/scores';
import { fetchBoard, newScoreId, postScore, savedName, saveName } from '../net/scores';
import { ResultsCard } from '../ui/results';
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
}

export class HoleFinish {
  private card: ResultsCard;
  private hole: HoleInfo | null = null;
  private score: Scorecard | null = null;
  private scoreId = '';
  private postedAs: string | null = null;
  private board: BoardResponse | null = null;
  private shareFile: File | null = null;
  /** Bumped on each new card, so a slow reply for an old one is dropped. */
  private seq = 0;

  constructor(
    root: HTMLElement,
    private toast: (text: string) => void,
    playAgain: () => void,
  ) {
    this.card = new ResultsCard(root, {
      playAgain: () => {
        this.seq++;
        playAgain();
      },
      post: (name) => void this.post(name),
      changeName: () => this.card.setBoard({ kind: 'ask', name: this.postedAs ?? '' }),
      share: () => void this.share(),
    });
  }

  async show(score: Scorecard, hole: HoleInfo): Promise<void> {
    const seq = ++this.seq;
    this.hole = hole;
    this.score = score;
    this.scoreId = newScoreId();
    this.postedAs = null;
    this.board = null;
    this.shareFile = null;
    this.card.show(score, `${hole.course} ${score.holeName}`, `Leaderboard · ${score.holeName}`);
    this.refreshShare();

    if (hole.holed && !hole.practice) {
      const name = savedName();
      if (name) return this.post(name);
      this.card.setBoard({ kind: 'ask' });
      return;
    }
    this.card.setBoard({ kind: 'loading' });
    const board = await fetchBoard(hole.board);
    if (seq !== this.seq) return;
    const note = hole.practice ? 'Debug round, not posted.' : 'Hole out to get on the board.';
    this.card.setBoard(board ? { kind: 'board', board, note } : { kind: 'offline' });
  }

  hide(): void {
    this.seq++;
    this.card.hide();
  }

  private async post(raw: string): Promise<void> {
    const hole = this.hole;
    const score = this.score;
    if (!hole || !score) return;
    const name = cleanName(raw);
    if (!name) {
      this.card.setBoard({ kind: 'ask', name: raw, error: 'Use letters and numbers, up to 16.' });
      return;
    }
    saveName(name);
    const seq = this.seq;
    this.card.setBoard({ kind: 'loading' });
    const board = await postScore(hole.board, { id: this.scoreId, name, strokes: score.strokes });
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
    const s = this.score!;
    const you = this.board?.you;
    return {
      course: this.hole!.course,
      holeNumber: this.hole!.holeNumber,
      holeName: s.holeName,
      par: s.par,
      strokes: s.strokes,
      title: s.title,
      throws: s.throws,
      name: this.postedAs ?? undefined,
      rank: you?.rank,
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
    if (!this.score) return;
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
