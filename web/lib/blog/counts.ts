// The two places the index states a number about itself: the stat rail under
// the headline, and the counter over the list.
//
// BOTH ARE COUNTED, NEITHER IS TYPED. The sheet hardcodes `ENTRIES 10` and
// `SHOWING nn OF 10 ENTRIES` over ten invented entries, which is what a drawing
// does. lib/work/counts.ts records the trap in the same words one directory
// over: a typed number "would be right today and would stay right through
// exactly one deploy".

import { padTwo } from "../api/values.ts";
import { NO_DATA } from "../state/words.ts";

/** Where the entries come from. Named on the page, per HOME.01's rule that a
 *  head names its source — ADR 0062 §4 applied it to SYS.04 for this same read,
 *  and the fact that this source has no port changes nothing about the rule. */
export const POSTS_SOURCE = "content/posts";

/**
 * The counter line over the list.
 *
 * IT TAKES TWO NUMBERS AND NO ANSWER, unlike `workMeta`. The island holds the
 * rows, so it knows both the total and what survived the axes without being
 * told either — H6b's shape, and the reason `workCount` was split out of
 * `workMeta` in the first place: one sentence, one author. A second call site
 * assembling these five words is how `SOURCE:` becomes `FIGURES FROM` on one of
 * them.
 */
export function blogCount(total: number, shown: number): string {
  return `SHOWING ${padTwo(shown)} OF ${padTwo(total)} ENTRIES · SOURCE: ${POSTS_SOURCE}`;
}

/**
 * The two figures the head states, and the one distinction that matters.
 *
 * TWO EMPTY ANSWERS, BECAUSE THEY ARE TWO STATEMENTS — ADR 0062 §4 decided this
 * for the homepage's LOG head and the reasoning is unchanged. `00` is a
 * measurement: the directory was read and holds nothing. `— NO DATA` means the
 * read itself failed, and on this site that means an image shipped without its
 * own content. A page that printed `00` for both would report a working empty
 * log while its own files were missing.
 *
 * `null` IN, NOT A COUNT. The caller passes what `postsOrNull()` answered, so
 * the failure is carried rather than flattened into a number on the way here.
 */
export function blogEntries(posts: readonly unknown[] | null): string {
  return posts === null ? NO_DATA : padTwo(posts.length);
}

/**
 * The `LATEST` row: a date, `— NO DATA`, or nothing at all.
 *
 * THREE ANSWERS, AND THE THIRD IS THE ONE WORTH THE FUNCTION. An unreadable
 * directory is `— NO DATA`, as above. A directory that was read and holds no
 * entries has no latest entry — and `— NO DATA` there would say a figure is
 * MISSING when in truth nothing has happened yet. ADR 0070 §2 settled exactly
 * this shape for the `updated` key: "Ein `— NO DATA` wäre die falsche Auskunft:
 * es sagt, eine Zahl fehle, und hier hat schlicht nichts stattgefunden." So the
 * answer is `null` and the caller draws no row, the way the post page draws no
 * `UPDATED` line.
 */
export function blogLatest(published: string | null, readable: boolean): string | null {
  if (!readable) return NO_DATA;
  return published;
}
