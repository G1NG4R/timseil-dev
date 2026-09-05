// The chip vocabulary of the log index, derived from the corpus.
//
// IN lib/ AND NOT IN THE COMPONENT, for the reason lib/content/posts.ts gives
// at length: `npm test` reads lib/** and styles/** only, and Node strips types
// but does not transform JSX, so a judgement made inside a .tsx is a judgement
// no test can reach. What a tag is worth as a control is a judgement.
//
// THE SHEET DRAWS EIGHT CHIPS AND THIS CORPUS HAS THIRTY-TWO TAGS, and the
// difference is not a defect on either side. The artboard is built on ten
// invented entries with seven invented subjects; the twenty-three written ones
// carry thirty-two, seventeen of which occur exactly once. So the number on the
// page is a measurement of what has been written, and the drawing is a drawing.
//
// EVERY TAG GETS A CHIP, AND lib/work/stacks.ts ALREADY SETTLED WHY. That file
// derives the stack row from the answer rather than from a fixed list, so that
// "a chip that matches nothing is never drawn in the first place" — the
// emptiness of a control is a property of a COMBINATION, not of a chip. Each of
// these thirty-two matches at least one entry, so each of them is a live
// control, and a threshold that hid the seventeen singletons would be a typed
// number deciding which of my own subjects are worth filtering by.
//
// SORTED BY KEY, AND FOR stacks.ts's REASON WORD FOR WORD: the rows carry an
// order that means something — newest first — and a chip row carries no numbers
// and no meaning to carry, "so it needs an order a reader can predict instead,
// and that is the alphabet." The compare is plain code-unit rather than
// `localeCompare`, because the key is what the filter matches on and a
// comparison that depends on the ICU data in the running Node would make this a
// different row on a different machine.

import type { PostMeta } from "../content/posts.ts";
import { padTwo } from "../api/values.ts";

/** One chip: the value it sets, the word it shows, and how many entries it holds. */
export interface TagChip {
  /** The tag exactly as the frontmatter wrote it. This is what `matches` compares. */
  readonly key: string;
  /** The same tag, in the voice of the page. */
  readonly label: string;
  /** Already padded, because the server is the half that can be tested. */
  readonly count: string;
}

/**
 * One tag, as this site spells it.
 *
 * ONE FUNCTION FOR TWO SURFACES, which is the lesson H9a wrote down as "a
 * string is not wrong until something draws it a second time". The chip row and
 * the entry row both print tags; if each upper-cased on its own, the day one of
 * them learns to turn `ci-cd` into `CI/CD` is the day they disagree and nothing
 * fails.
 *
 * THE HYPHEN IS NOT TURNED INTO A SLASH, though the sheet draws `CI/CD`. The
 * key is `ci-cd` — lib/content/posts.ts's `TAG` pattern allows no slash, because
 * a tag becomes a `data-` attribute and half of a comparison. Printing a
 * character the value does not contain would be this file editing the corpus.
 */
export function tagLabel(tag: string): string {
  return tag.toUpperCase();
}

/**
 * Every tag in the corpus, alphabetically, with the number of entries it holds.
 *
 * THE FIRST CHIP IS NOT HERE. `ALL` is the sentinel that turns the axis off; it
 * belongs to the control rather than to the data, and no entry can be written
 * under it. components/blog/BlogFilters.tsx renders it in front of this list —
 * the arrangement components/work/WorkFilters.tsx already has.
 */
export function tagChips(posts: readonly PostMeta[]): readonly TagChip[] {
  const counts = new Map<string, number>();

  for (const post of posts) {
    // `tagList` already refused a repeated tag inside one entry, so a second
    // sighting here is always a second entry. That refusal is what keeps this
    // count equal to the number of rows the chip will actually show.
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, count]) => ({ key, label: tagLabel(key), count: padTwo(count) }));
}
