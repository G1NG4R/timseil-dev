// The guards every reader of an api answer needs, in one place — and, since
// H5a, the one piece of formatting that had the same problem.
//
// They were written in lib/api/health.ts in G4 with a reason that has not
// changed: "The generated type is a statement about the contract, not about the
// bytes that arrived." ADR 0035's overlapping start means the new web container
// can talk to the previous build for a few seconds, so a field the contract
// gained this week is simply absent — and `undefined` must land where `null`
// lands, not in `toFixed`.
//
// THEY MOVED HERE BECAUSE H1 IS THE SECOND READER. Two copies of a guard this
// small is how the copies start disagreeing: the case study reads five nullable
// numbers, the footer reads one, and the day someone tightens `finiteNumber`
// for one of them is the day the other keeps the old rule. One file, no
// judgement of its own, nothing from `next/*` — so `node --test` reaches it.

/** A string, or nothing. An empty string is not an identity. */
export function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A number, or nothing.
 *
 * Invariant 1 lives in the `finite` half. The contract already types these
 * fields `number | null`, so `null` arrives honestly — but `undefined` from an
 * older build, or a `NaN` from a body that parsed further than it should have,
 * must end up in the same place as `null`.
 */
export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Two digits, the way every ordinal on this site is written.
 *
 * `SYS.01`, `02 TIMSEIL-DEV`, `01 SYSTEM`, `02 SYSTEMS` — the padding is the
 * house style and the sheets use it in the same lines.
 *
 * IT IS NOT A GUARD, WHICH IS WHY THE HEADER OF THIS FILE HAD TO CHANGE. It
 * decides how a number LOOKS, not what it MEANS, and by that line it does not
 * belong beside the other two. It is here anyway because the header's argument
 * is about copies rather than about categories: H5a needed it in
 * lib/api/systems.ts, training.ts already had it, and the alternative was either
 * an import between two endpoint readers with nothing else to say to each other
 * or a third module holding one line. The two copies had already drifted before
 * they were merged — one clamped a negative number, the other did not.
 *
 * NEGATIVE NUMBERS ARE NOT PADDED. `-1` is not an ordinal, and `0-1` is worse
 * than the thing it was given.
 */
export function padTwo(value: number): string {
  return value >= 0 && value < 10 ? `0${String(value)}` : String(value);
}
