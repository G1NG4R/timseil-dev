// The two places this page states a number about itself: the stat rail under
// the headline, and the counter line over the list.
//
// BOTH ARE COUNTED, NEITHER IS TYPED. The sheet hardcodes `02 / 01 / 00 / 01`
// in the rail and `SHOWING 02 OF 02` in the counter, which is what a drawing
// does; here they are `length` over the answer. The seed happens to hold two
// systems, so a typed `02` would be right today and would stay right through
// exactly one deploy — H5a's `systemsMeta` records the same trap for SYS.02's
// head, and this is that shape with four counts instead of one.

import { type SystemList, systemRows } from "../api/systems.ts";
import { padTwo } from "../api/values.ts";
import { NO_DATA, type StateWord } from "../state/words.ts";

/** The four numbers of the stat rail, in the order the sheet draws them. */
export interface StatusCounts {
  /** Every row the answer held, whatever state it is in. */
  readonly all: number;
  readonly live: number;
  readonly in_build: number;
  readonly queued: number;
}

/**
 * The state of every row, tallied.
 *
 * THE THREE KEYS ARE THE CONTRACT'S ENUM AND NOT THE ROWS' STATES, which is
 * the whole reason a zero is allowed to appear here. `SystemState` declares
 * `live`, `in_build` and `queued` for ever; the seed holds one of the first and
 * one of the last, so `IN BUILD 00` is a tile and a chip that state a real
 * possibility nothing currently occupies. lib/work/stacks.ts makes the opposite
 * call for the stack row, and the difference between the two is the point:
 * there the vocabulary is whatever the data happens to hold, so a chip with no
 * matches is a dead control rather than a stated possibility.
 *
 * A ROW WHOSE STATE DID NOT MAP IS COUNTED IN `all` AND IN NOTHING ELSE. It
 * exists — the api answered with it — and this build has no word for what it
 * is, so `all` is the honest total and no tile may claim it. The four numbers
 * are therefore not guaranteed to add up, and that is a true statement about
 * the answer rather than an arithmetic bug.
 */
export function statusCounts(rows: readonly { readonly state: StateWord | null }[]): StatusCounts {
  const of = (state: StateWord) => rows.filter((row) => row.state === state).length;

  return {
    all: rows.length,
    live: of("live"),
    in_build: of("in_build"),
    queued: of("queued"),
  };
}

/**
 * Whether the answer said anything countable at all.
 *
 * THE ONE GUARD, READ TWICE. `workMeta` and the stat rail both have to tell
 * "the api answered and there are none" from "nothing usable arrived", and they
 * have to agree: a head that prints `00 SYSTEMS` over a counter that prints
 * `— NO DATA` is two claims about one answer, and the tiles are the ones
 * lying. H6 shipped exactly that for the length of one build and it was
 * visible the first time the page was opened without an api.
 */
export function listed(body: SystemList | null): boolean {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  return Array.isArray(raw.systems);
}

/**
 * The counter line over the list.
 *
 * THREE CASES AND NOT TWO, which is `systemsMeta`'s rule one page over and the
 * reason it is repeated rather than assumed. No body at all, a body with no
 * readable list, and a body with an empty one — and only the third counts as
 * `00`. `SHOWING 00 OF 00` is a measurement: the api answered and there are no
 * systems. An answer whose `systems` is missing or is not an array did not say
 * that, and printing zeroes for it would be invariant 1 in a counter.
 *
 * `shown` IS THE FILTERED COUNT AND IT IS OPTIONAL. Nothing filters in H6a, so
 * the page passes nothing and both numbers are the total; the client island in
 * H6b passes what survived the two axes. Written this way round so the server
 * renders the honest line on its own and the island narrows it, rather than the
 * line existing only where JavaScript ran.
 *
 * `FIGURES FROM`, NOT `SOURCE:`, and the difference is deliberate. SYS.02's
 * head names the endpoint the LIST came from; this line stands over rows whose
 * operating numbers came from the same place, and the sheet's own wording says
 * so. The trailing `· [PLACEHOLDER VALUES]` the sheet carries is dropped — it
 * is a note to the developer, like H5c's `PLACEHOLDER TOPICS`, and INDEX.md
 * says the same about the contribution graph's: it "entfällt beim
 * API-Anschluss".
 */
export function workMeta(body: SystemList | null, shown?: number): string {
  if (!listed(body)) return `${NO_DATA} · FIGURES FROM /api/systems`;

  const total = systemRows(body).length;

  return `SHOWING ${padTwo(shown ?? total)} OF ${padTwo(total)} · FIGURES FROM /api/systems`;
}
