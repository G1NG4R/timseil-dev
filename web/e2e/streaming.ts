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
 * The homepage's, since H3. One region, and one is not an oversight: the page
 * has one thing to ask the api and one place to put the answer. Everything else
 * on it is in the repository.
 *
 * `.term` rather than the row inside it, because the whole frame is what the
 * fallback and the answer both render — that is the seam ADR 0044 describes,
 * and it is the boundary React actually swaps.
 */
export const HOME_REGIONS = [".term"] as const;

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
