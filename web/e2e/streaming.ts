// The four regions the case study streams, and the wait that means "the page is
// finished", in one definition.
//
// WHY IT LEFT case-study.spec.ts. #279 fixed this wait and wrote down what it
// cost to learn; the fix lived in a helper local to one spec. H2a then added a
// second spec against the same route, and that spec copied the PRE-fix version
// of the helper — because copying is what a local helper invites. Two
// definitions of "settled" is how the third one gets written. Nothing below is
// reworded: the comment is #279's, kept whole, because the evidence in it is the
// part that stops this happening a fourth time.
//
// The region list is a fact about `app/[lang]/work/[slug]/page.tsx`, and it
// belongs where every reader of that route can reach it. When H2b puts the
// operation grid behind its own boundary, this is the one line that grows.

import { expect, type Page } from "@playwright/test";

/** The regions the case study's `page.tsx` streams, each behind its own
 *  `<Suspense>`. */
export const CASE_REGIONS = [
  ".cs-crumb",
  ".cs-eyebrow",
  ".spec",
  ".ops-tiles",
  // H2b, and the line the comment above predicted. `.ops-live` is one region
  // holding two components: the grid and the incident log read the same answer
  // and point at each other, so they settle together or the notch links into a
  // log that has not arrived.
  ".ops-live",
] as const;

/**
 * The page after streaming has settled.
 *
 * FOUND BY case-study.spec.ts, TWICE, AND THE SECOND TIME IT WAS GENERAL. A
 * streamed page carries both the Suspense fallback and its replacement: React
 * ships the replacement inside a `<div hidden>` and a script swaps them, so
 * between those two events every one of the four regions is in the document
 * twice — the breadcrumb, the eyebrow, the spec rail and the tile row. A strict
 * locator sees both and refuses.
 *
 * THE RACE IS WIDEST WHEN THE API IS DOWN, which is why the first run to catch
 * it was the first one with nothing to answer: the upstream call spends its full
 * two-second budget before the replacement can render, and every assertion made
 * before that saw two of everything. With an api answering in milliseconds the
 * same tests had passed.
 *
 * WAITING ON ONE REGION IS NOT WAITING ON THE PAGE, and that is the third time
 * this was paid for. The four boundaries are independent — `page.tsx` opens a
 * separate `<Suspense>` for each — so each spends its own two-second budget and
 * they settle in no fixed order. A breadcrumb that has already swapped says
 * nothing about the spec rail beside it. Two runs on main proved it on 31.08.:
 * the first failed on `.spec`, the re-run on `.ops-tiles`, two different tests
 * out of one family, and `retries: 0` means every run draws again.
 *
 * The count is the wait AND the assertion. If a swap never happened, one copy of
 * each region would stay in the page — which is #256's shape exactly, a second
 * copy of a component lying in the document — and this is the line that would
 * say so.
 */
/**
 * The homepage's, since H3. It began as one region, and one was not an
 * oversight: the page had one thing to ask the api and one place to put the
 * answer. Each section that connects to an endpoint adds its own.
 *
 * `.term` rather than the row inside it, because the whole frame is what the
 * fallback and the answer both render — that is the seam ADR 0044 describes,
 * and it is the boundary React actually swaps.
 */
export const HOME_REGIONS = [
  ".term",
  // H4, and the line the comment above predicted for the case study — the same
  // sentence applies here: when a phase puts a section behind its own boundary,
  // this list is what grows. `.trn` is the whole of SYS.01 including its head,
  // because the head carries the answer's own counts and cannot be rendered
  // before the answer is.
  ".trn",
  // H5a, and the second time that sentence has been paid. SYS.02 is behind its
  // own boundary for the same reason SYS.01 is: `02 SYSTEMS` in its head is the
  // answer's count.
  ".sys",
  // H5b, and the first section to put TWO entries here. SYS.03 reads two
  // endpoints with two freshnesses, so it has two boundaries rather than one —
  // components/home/Uplink.tsx carries the argument. The section wrapper `.upl`
  // is deliberately NOT in this list: it is prerendered with the shell, because
  // its head says something rather than counting something, and a selector that
  // is present before the stream begins would assert nothing.
  //
  // The FIGURE and not the grid inside it. `.upl-strip` is the `<ol>` of cells,
  // which does not exist when the read failed; `.upl-ops` is there in both
  // states, and "the region arrived" is the question this list asks.
  ".upl-graph",
  ".upl-ops",
  // H5c ADDED NOTHING HERE, and that is worth a line so the question is not
  // asked a third time. SYS.04 reads files that are in the image rather than an
  // endpoint, so `.log` is in the static shell before anything streams — the
  // same reason `.upl` is absent one comment up. A selector that is already
  // there when the wait begins is a wait that returns immediately and an
  // assertion that holds whatever happened.
] as const;

/**
 * The page after streaming has settled.
 *
 * THE REGION LIST IS AN ARGUMENT, and H3 is why it is now one. Before this
 * phase the list was a constant this function closed over, which was correct
 * while there was one streamed route and is how the pre-#279 copy came about:
 * a second route either passes its own regions or grows a second `settled`.
 */
export async function settled(
  page: Page,
  regions: readonly string[] = CASE_REGIONS,
): Promise<void> {
  for (const selector of regions) {
    await expect(page.locator(selector), selector).toHaveCount(1);
  }
}
