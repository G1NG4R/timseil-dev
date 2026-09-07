// How many log entries were written about one system.
//
// THE SHEET CALLS THIS A DELIVERED BRIEF POINT — "ENTRIES IN THE LOG verbindet
// jedes System mit den Posts, die darüber geschrieben wurden" — and draws it on
// the row as `01 ENTRY IN THE LOG →`.
//
// THE ARROW IS STILL NOT BUILT, AND ITS REASON IS A DIFFERENT ONE NOW. Until
// H9a the answer was that `/blog/<slug>` answered 404, so a link there was
// evidence pointing into nothing — invariant 5, and the third time this site
// had made the call. That condition is gone: the renderer exists, H9c gives
// `LogRow` and the post-mortem entry their links, and lib/seo/feed.ts carries
// every entry. A reason can expire without the absence it argued for becoming
// wrong, and this is that case rather than an oversight.
//
// WHAT THE ARROW WOULD MEAN IS "THE ENTRIES ABOUT THIS SYSTEM", AND NO URL ON
// THIS SITE SAYS THAT. ADR 0071 §8 kept the index's filter state out of the URL
// because `searchParams` made the route dynamic, and lib/blog/filter.ts has two
// axes — `tag` and `q` — neither of which is a system. Pointing at the
// unfiltered `/blog` would be a control promising a narrower list than it
// delivers, which is what ADR 0071 §7 refused for the SUBSCRIBE block one page
// over; inventing a third axis so the arrow can be true is the shape #292 is
// open about. The sheet agrees with itself here, as it did before: it gives
// `CASE STUDY →` a pointer cursor and a hover colour and gives this one neither.
//
// SO WHAT SHIPS IS A COUNT, and a count is worth shipping on its own. It is the
// one number on this page that says how much has been WRITTEN about a system
// rather than how well it RUNS, and it is read from the repository the entries
// live in rather than from an endpoint.

import { padTwo } from "../api/values.ts";
import type { PostMeta } from "../content/posts.ts";

/**
 * Entries whose `systemId` is this slug.
 *
 * MATCHED AGAINST THE SYSTEM'S SLUG AND NOT TRUSTED. A post names a system in
 * its frontmatter, which is prose in a file rather than a foreign key — nothing
 * stops a typo, and `check-migrations` cannot reach a `.mdx`. A name that
 * matches no system counts towards no system, which means a miscounted row
 * reads low rather than wrong, and the total below is what makes that visible.
 *
 * lib/content/posts.ts does not do this itself on purpose: it reads text and
 * knows nothing about the api. Whether a string is a slug anything answers to
 * is this file's question.
 */
export function logEntriesFor(posts: readonly PostMeta[], slug: string): number {
  return posts.filter((post) => post.systemId === slug).length;
}

/**
 * The row's words for that count, or nothing at all.
 *
 * `null` AT ZERO, AND THAT IS THE STATE.05 CALL RATHER THAN A TIDINESS ONE. A
 * row reading `00 ENTRIES IN THE LOG` with nothing behind it is a dead control
 * with a number attached — the sheet's own rule is that an empty thing owes a
 * reason and a way back, and there is no way back from a log that has nothing
 * about this system in it. The line is absent instead, the way the exit is
 * absent from a row with no case study.
 *
 * IT PLURALISES ON THE COUNT, which the sheet does implicitly: the row draws
 * `01 ENTRY IN THE LOG →` and the design note writes `ENTRIES IN THE LOG`. One
 * entry is an entry.
 *
 * ZERO-PADDED, like every other number on this page.
 */
export function logEntriesLine(count: number): string | null {
  if (count <= 0) return null;

  const noun = count === 1 ? "ENTRY" : "ENTRIES";
  return `${padTwo(count)} ${noun} IN THE LOG`;
}
