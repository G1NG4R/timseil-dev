// The previous and the next entry, and the reason the row stays when there is
// no next one.
//
// THE ORDER IS THE INDEX'S ORDER, NOT A SECOND ONE. `readPosts` returns newest
// first, tiebroken by slug, and this walks that array — so "next" is the entry
// above a post in the log and "previous" is the entry below it. Deriving an
// order here would give the foot of a post a different neighbour from the one
// the index shows two clicks earlier.
//
// BOTH SIDES ARE NULLABLE AND THE PAGE DRAWS BOTH ANYWAY. The Blog Post sheet's
// one empty state is this: "ZEILE VERSCHWINDET NIE — ein fehlendes Element liest
// sich als Fehler, ein benanntes nicht." The newest post has no next entry, the
// oldest has no previous, and a foot that silently loses half its width reads as
// a rendering fault rather than as the end of a list.

import type { PostMeta } from "./posts.ts";

export interface Neighbours {
  /** The entry published before this one, or nothing at the oldest. */
  readonly previous: PostMeta | null;
  /** The entry published after this one, or nothing at the newest. */
  readonly next: PostMeta | null;
}

/**
 * Where a post sits among its siblings.
 *
 * A SLUG THE LIST DOES NOT HOLD GETS TWO NULLS rather than a throw. The route
 * calls `notFound()` long before this runs, so the case is unreachable from a
 * page — and a helper that threw on it would be the second gate, disagreeing
 * with the first one about what a missing post is.
 */
export function neighbours(posts: readonly PostMeta[], slug: string): Neighbours {
  const at = posts.findIndex((post) => post.slug === slug);
  if (at === -1) return { previous: null, next: null };

  return {
    // `posts` is newest first, so the entry AFTER this one in the array is the
    // OLDER one. The names follow the reader's sense of the log, not the index.
    previous: posts[at + 1] ?? null,
    next: posts[at - 1] ?? null,
  };
}
