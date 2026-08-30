// The two guards every reader of an api answer needs, in one place.
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
