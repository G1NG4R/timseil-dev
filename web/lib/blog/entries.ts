// The list, grouped the way the sheet draws it: a separator per year, with the
// number of entries under it.
//
// THE ORDER IS NOT DECIDED HERE. `readPosts` returns newest first and ties on
// the slug, and lib/content/posts.ts explains at length why the date alone is
// not a total order — four entries share `2026-09-01`. This file walks that
// order and never re-sorts it: a second opinion about sequence is how two
// surfaces of one corpus come to disagree about which entry is the newest.
//
// SO THE YEARS DESCEND WITHOUT BEING SORTED. They fall out of an order that is
// already newest-first, which is a stronger guarantee than sorting them again
// would be — a `sort` here would still produce a descending list if the input
// order were broken, and would hide the breakage.

import type { PostMeta } from "../content/posts.ts";
import { padTwo } from "../api/values.ts";

/** One year of the log, in the order the entries already stand in. */
export interface YearGroup {
  /** `2026`. Text, because nothing here does arithmetic on a year. */
  readonly year: string;
  /** How many entries the year holds, padded — the sheet draws `07 ENTRIES`. */
  readonly count: string;
  readonly posts: readonly PostMeta[];
}

/**
 * The year an entry belongs to.
 *
 * READ OFF THE STRING, NOT PARSED. `published` is `YYYY-MM-DD` and
 * lib/content/posts.ts already refused anything else — including `2026-02-30`,
 * which round-trips through `Date` and would otherwise pass. Constructing a
 * `Date` here to read four characters back off it would put this line at the
 * mercy of the running process's timezone for no gain.
 */
export function yearOf(post: PostMeta): string {
  return post.published.slice(0, 4);
}

/**
 * The entries, grouped into years, newest year first.
 *
 * A GROUP OF ONE IS STILL A GROUP. The first year of this log holds a handful
 * of entries and a future one may hold a single entry; drawing no separator for
 * it would make that entry look like it belonged to the year above.
 */
export function byYear(posts: readonly PostMeta[]): readonly YearGroup[] {
  const groups: { year: string; posts: PostMeta[] }[] = [];

  for (const post of posts) {
    const year = yearOf(post);
    const last = groups.at(-1);
    // The input is already ordered, so a year can only ever be the one being
    // built or a new one. Looking the year up in a map instead would silently
    // repair an unordered input and hide it — see the head of this file.
    if (last?.year === year) last.posts.push(post);
    else groups.push({ year, posts: [post] });
  }

  return groups.map((group) => ({
    year: group.year,
    count: padTwo(group.posts.length),
    posts: group.posts,
  }));
}

/**
 * The date of the newest entry, or nothing.
 *
 * `null` RATHER THAN A DASH, because this file does not know what the caller
 * draws for an absence — the head has one word for "read, and empty" and
 * another for "could not be read", and only the caller can tell them apart.
 */
export function latestPublished(posts: readonly PostMeta[]): string | null {
  return posts[0]?.published ?? null;
}
