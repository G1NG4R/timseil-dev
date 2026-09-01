// What SYS.04 draws, out of what the repository holds.
//
// THE SAME SPLIT AS SYS.02, one directory over: lib/content/posts.ts is about
// TEXT — where a key ends, which lines belong to a block — and this file is
// about a SECTION: how many rows it draws, what its head says, and what it says
// when there is nothing. lib/api/systems.ts and lib/home/systems.ts are the pair
// this copies, and the reason to keep them apart is that only one of the two
// changes when H9 gives the log a renderer.

import { padTwo } from "../api/values.ts";
import { POSTS_DIR, readPosts, type PostMeta, type PostRead } from "../content/posts.ts";
import { NO_DATA } from "../state/words.ts";

/**
 * Three rows, because the sheet's section sequence card says three.
 *
 * "LOG — drei Einträge. Steht zuletzt, weil er der laufende Teil ist, nicht der
 * beweisende." That is the one number in this section the sheet is allowed to
 * fix, and it is fixed as a COUNT OF ROWS rather than as the string `LATEST 03`:
 * the head prints what this returns, so fourteen posts and three rows still
 * agree, and a repository with two posts says `LATEST 02` without an edit.
 */
export const LOG_ROWS = 3;

/** The newest few, already sorted by the reader. */
export function logEntries(read: PostRead | null, limit: number = LOG_ROWS): readonly PostMeta[] {
  if (read === null) return [];
  return read.posts.slice(0, limit);
}

/**
 * The line in the section head of SYS.04.
 *
 * TWO CASES, AND THE SHEET DRAWS NEITHER OF THEM. `LATEST 03 · PLACEHOLDER
 * TOPICS` is what the artboard writes; the `03` there is a drawing of three
 * invented posts, and `PLACEHOLDER TOPICS` is a note to the person building it
 * that would ship as UI text if it were copied. What is built is the count that
 * was actually drawn, and the source beside it.
 *
 * `— NO DATA` IS NOT AN EMPTY DIRECTORY. A directory that reads and holds
 * nothing said something — `LATEST 00`, the same statement `00 SYSTEMS` makes
 * one section up. A directory that could not be read said nothing at all. The
 * two look identical on a page that prints a zero for both, and invariant 1 is
 * about exactly that.
 *
 * THE SOURCE IS A PATH IN THIS REPOSITORY AND NOT AN ENDPOINT, which is the
 * whole claim SYS.04 makes: the log is the part of this site that is written
 * rather than measured, and it says where it is written. HOME.01's rule for the
 * section above — "jeder nennt seine Quelle" — does not care that this source
 * has no port.
 */
export function logMeta(read: PostRead | null): string {
  const source = "SOURCE: content/posts";
  if (read === null) return `${NO_DATA} · ${source}`;
  return `LATEST ${padTwo(logEntries(read).length)} · ${source}`;
}

/**
 * The read the page makes, with the one failure it can have folded into `null`.
 *
 * NO `use cache` AND NO PROFILE, and both are decisions rather than omissions.
 *
 * Every entry in next.config.ts's `cacheLife` is DERIVED from a Cache-Control
 * header the contract declares, and the file says in as many words that a number
 * invented there would be a second source of truth. This source declares
 * nothing: the posts are files in the image, so they cannot change while the
 * process lives, and a new post is a new container. Any freshness written down
 * here would be a number nobody measured — invariant 1, in a config file.
 *
 * So the read happens during the prerender and lands in the static shell, which
 * is what `app/og.png/route.tsx` already does with tokens.css at module scope.
 * SYS.04 is therefore the first section of this page with no Suspense boundary
 * since the hero, and the first the end-to-end rig can see with real content in
 * it — components/home/Log.tsx carries what that is worth.
 *
 * THE `catch` IS NOT DECORATION. It is the difference between `LATEST 00` and
 * `— NO DATA`: a directory that is missing from the image reports itself instead
 * of claiming the log is empty. That is the failure `outputFileTracingIncludes`
 * exists to prevent, and this is what the page looks like if it ever happens.
 */
export function homePosts(): PostRead | null {
  try {
    return readPosts(POSTS_DIR);
  } catch {
    return null;
  }
}
