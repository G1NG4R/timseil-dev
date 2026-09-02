// The two axes of the Work Index, as a value and a predicate.
//
// WHY THIS IS A MODULE AND NOT THREE LINES IN THE ISLAND. `npm test` reads
// lib/** and styles/** only, and Node strips types but does not transform JSX
// (ADR 0044, ADR 0048), so anything decided inside a .tsx is decided where no
// test can reach it. StateFlip drew the line for the state burst in H6's own
// gallery — "the decisions are not in here" — and this is the same split: the
// island keeps the useState and the click, and every judgement about what a
// chip means is here.
//
// TWO AXES, AND THE BUILD PLAN SAYS WHY THERE IS NO THIRD. H6 is "Filter,
// Zähler, Live-Preview, Leerzustand bei 0 Treffern. Kein `source`-Filter (bei
// zwei Systemen filtert er von zwei auf zwei)."
//
// THE SENTINEL IS A VALUE OF THE AXIS, NOT AN ABSENCE. `all` and `any` are what
// the sheet's own script uses (`this.st = "all"; this.sk = "all"`) and what its
// first chip is. Modelling "no filter" as `null` instead would give every
// reader of this type two ways to spell the same state, and the chip row would
// then have to translate between them on every press.

import type { StateWord } from "../state/words.ts";

/** The status axis: one of the contract's states, or every one of them. */
export type StatusAxis = StateWord | "all";

/** The stack axis: one `StackTag.key`, or every one of them. */
export type StackAxis = string;

/** The sentinel of the stack axis. Its own value, so nothing compares to `""`. */
export const ANY_STACK = "any";

/** Where both axes stand. */
export interface Axis {
  readonly status: StatusAxis;
  readonly stack: StackAxis;
}

/** Nothing narrowed — the state the page loads in, and the state reset returns to. */
export const NO_FILTER: Axis = { status: "all", stack: ANY_STACK };

/** Whether anything is narrowing the list at all. */
export function isFiltered(axis: Axis): boolean {
  return axis.status !== "all" || axis.stack !== ANY_STACK;
}

/**
 * One row, reduced to what the two axes actually read.
 *
 * NOT `WorkEntry`, AND THAT IS THE POINT OF THE INTERFACE. The island receives
 * rows whose visible half is an already-rendered server node; what crosses the
 * client boundary as DATA is these two fields and a key. A predicate that took
 * the whole entry would invite the island to read the rest of it.
 */
export interface FilterRow {
  /** The row's state, or `null` when this build has no word for what arrived. */
  readonly st: StateWord | null;
  /** The row's stack, as `StackTag.key`s. */
  readonly sk: readonly string[];
}

/**
 * Whether one row survives both axes.
 *
 * A ROW WHOSE STATE DID NOT MAP SURVIVES ONLY `all`. `statusCounts` counts such
 * a row in `all` and in no tile, for the reason written there: it exists, and
 * this build has no word for what it is. The same answer holds here — it cannot
 * be claimed for LIVE, IN BUILD or QUEUED, and hiding it from the unfiltered
 * list would be this page dropping a system the api sent.
 *
 * THE STACK MATCH IS WHOLE-TOKEN, which is `stacks.ts`'s side of the same
 * contract: "a key may not contain the separator", so `go` may never match
 * `golang` and `sql` may never match `sqlite`. `includes` over the array does
 * that by construction — this is the one place the sheet's
 * `dataset.sk.split(" ").includes(...)` is a string operation and this is not.
 */
export function matches(row: FilterRow, axis: Axis): boolean {
  const byStatus = axis.status === "all" || row.st === axis.status;
  const byStack = axis.stack === ANY_STACK || row.sk.includes(axis.stack);

  return byStatus && byStack;
}

/** Every row that survives both axes, in the order it came in. */
export function applyFilter<T extends FilterRow>(
  rows: readonly T[],
  axis: Axis,
): readonly T[] {
  return rows.filter((row) => matches(row, axis));
}

/** One chip, on either row: the value it sets and the word it shows. */
export interface Chip {
  readonly key: string;
  readonly label: string;
}

/**
 * What is narrowing the list, in the words the chips carry.
 *
 * FOR THE EMPTY PANEL AND NOTHING ELSE. `EmptyState.filters` exists to show a
 * reader the cause of the emptiness rather than make them infer it — State
 * Language draws it as the active chips echoed back — and an empty result is
 * the one moment on this page where the two chip rows may have scrolled out of
 * view above.
 *
 * IT READS THE CHIP ROWS RATHER THAN SPELLING ANYTHING. The status word comes
 * from `MARKS` by way of the row the server built; a `toUpperCase()` in this
 * file would be a second opinion about spelling that `words.ts` is the only
 * table allowed to hold, and it is how the sheet came to draw `BUILD` in the
 * chip and `IN BUILD` in the tile (ADR 0063).
 *
 * STATUS FIRST, because that is the order the two rows are drawn in.
 */
export function activeLabels(
  axis: Axis,
  statusChips: readonly Chip[],
  stackChips: readonly Chip[],
): readonly string[] {
  const labels: string[] = [];
  // A key with no chip cannot come from the control, which only ever sets a key
  // it drew. It can come from a stale value, and printing the raw key is better
  // than printing nothing: a panel that named one filter instead of two would
  // explain the emptiness with half its cause.
  const word = (chips: readonly Chip[], key: string) =>
    chips.find((chip) => chip.key === key)?.label ?? key;

  if (axis.status !== "all") labels.push(word(statusChips, axis.status));
  if (axis.stack !== ANY_STACK) labels.push(word(stackChips, axis.stack));

  return labels;
}
