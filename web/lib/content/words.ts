// How long a post takes to read, and the count that number is made of.
//
// THE WORDS ARE MEASURED AND THE MINUTES ARE DERIVED, which is the whole shape
// of this file. `2 480 WORDS` is a fact about a file on disk. `12 MIN` is that
// fact divided by a rate, and a rate is a convention — so it is named here, in
// one constant, rather than hidden inside an expression.
//
// THE RATE COMES OFF THE SHEET RATHER THAN OFF THE INTERNET. The Blog Post
// artboard prints `12 MIN · 2 480 WORDS` beside each other, and 2 480 ÷ 12 is
// 206.7. Two hundred words a minute reproduces the sheet's own pair exactly
// (round(12.4) = 12), so the divisor is read from the drawing this page is
// built against instead of picked from the range the web offers.
//
// CODE IS NOT COUNTED. Seventy-nine fenced blocks across the corpus, three
// lines each on average, and nobody reads a code block at prose speed — a
// counter that included them would report a longer read for the post with more
// listings rather than for the post with more to say. lib/content/body.ts draws
// that boundary once for this file and for the contents rail.
//
// NOT `use cache`, AND NOT MEMOISED. The count runs once per post per build:
// the route is prerendered, there is no request in which it could run twice.

import { bodyOf, proseLines } from "./body.ts";

/** Words per minute. See the head of this file for where the number comes from. */
export const WORDS_PER_MINUTE = 200;

export interface ReadingSize {
  /** Prose words. Fenced code is not among them. */
  readonly words: number;
  /** Whole minutes, at least one. */
  readonly minutes: number;
}

/**
 * A word is a run of non-space, and that is the definition on purpose.
 *
 * NO STEMMING, NO PUNCTUATION STRIPPING, NO MARKDOWN AWARENESS. `**bold**` is
 * one word and so is `bold`; a heading's `##` is a word by this rule and is
 * subtracted below rather than special-cased here. The count is a stable,
 * explainable number rather than an accurate one — and "accurate" has no
 * definition to be held against.
 */
export function readingSize(raw: string): ReadingSize {
  let words = 0;

  for (const line of proseLines(bodyOf(raw))) {
    for (const token of line.split(/\s+/)) {
      // A heading's `##` and a list's `-` are marks, not words. Left in, they
      // would add one word per structural line — about four per cent on a post
      // with many short sections, and none on a post with few.
      if (token === "" || /^[#>*+-]+$/.test(token)) continue;
      words += 1;
    }
  }

  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

/** `12 MIN`, zero-padded like every other number in the mono column. */
export function minutesLabel(size: ReadingSize): string {
  return `${String(size.minutes).padStart(2, "0")} MIN`;
}

/**
 * `2 480 WORDS`, grouped the way the sheet groups it.
 *
 * NOT A COMMA AND NOT `toLocaleString`. The sheet writes `2 480` with a space. A
 * comma would be one locale's answer on a page that has three of them, and
 * `toLocaleString` would give a different string depending on where the container
 * thinks it is — a rendered number that changes without an edit.
 *
 * THE SPACE IS U+00A0 AND THE SHEET'S IS U+0020, which is the one divergence in
 * this file and it is about behaviour rather than about looks. `2 480 WORDS` sits
 * in a meta row that wraps at 390; with an ordinary space the browser is entitled
 * to put `2` at the end of one line and `480` at the start of the next, and a
 * number split across a line break is a different number to a reader scanning
 * the row. U+00A0 and not U+202F: the narrow one is the typographically correct
 * choice and is missing from enough monospace faces to render as a box, which is
 * a worse failure than a few pixels of extra gap.
 */
export function wordsLabel(size: ReadingSize): string {
  const grouped = String(size.words).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} WORDS`;
}
