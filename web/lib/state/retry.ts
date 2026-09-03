// The retry counter, and the retry that does not exist yet.
//
// STATE.05 draws `> retry in 30s · 2/5` as the third line of the error panel,
// and the build plan names "Retry-Zähler" among this phase's parts. What it
// does NOT name is a retry, and lib/api/client.ts has none: #157 was settled
// with "accept and measure", so a failed call becomes a missing value rather
// than a second attempt.
//
// SO THIS PHASE BUILDS THE FORMATTING AND NOT THE BEHAVIOUR. `ErrorPanel` takes
// the line as an OPTIONAL prop; a caller with nothing to retry passes nothing
// and no counter appears. A counter over a page that never tries again would be
// an invented number wearing a monospace font, and invariant 1 does not make an
// exception for prose.
//
// The first caller with something true to count is H8 (the contact form, with
// its 8 s client timeout) or H13. Until then the only place this renders is
// G7's gallery, which is honest about being a gallery.

/**
 * `retry in 30s · 2/5` — seconds until the next attempt, then which attempt of
 * how many.
 *
 * `null` for anything that would print a lie, and the caller renders no line at
 * all rather than an empty one:
 *
 *   - a non-finite or negative wait; a countdown cannot run backwards
 *   - an attempt past the maximum, which means the retries are over and the
 *     panel owes a final state instead of a counter
 *   - a maximum below one, which is not a retry policy
 *
 * The numbers are floored rather than rounded: "retry in 30s" that fires at 29
 * is a promise kept early, one that fires at 31 is a promise broken.
 */
export function retryLine(seconds: number, attempt: number, max: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (!Number.isInteger(attempt) || !Number.isInteger(max)) return null;
  if (max < 1 || attempt < 1 || attempt > max) return null;

  return `retry in ${String(Math.floor(seconds))}s · ${String(attempt)}/${String(max)}`;
}

/**
 * `retry in 412s` — the same line without the counter.
 *
 * IT EXISTS BECAUSE H8 TURNED OUT TO BE THE CALLER THAT CANNOT COUNT, and the
 * reason is measured rather than assumed. Two limiters answer `POST
 * /api/contact` with a 429: the token bucket in front of every `/api/*` route
 * (`middleware/ratelimit.go`, and `Except` skips only `/healthz` and
 * `/readyz`), and the contact floor of three messages per ten minutes
 * (`contact/policy.go`). Both write it through `httpx.WriteRateLimitProblem`,
 * so both documents carry the same `type` and the same title, and `detail`
 * differs only in the number of seconds. A page that printed `2/3` beside a 429
 * would be naming which of the two refused it, and it cannot see that.
 *
 * What both DO carry is `Retry-After`, and ADR 0021 §3 derives it from
 * `min(received_at)` precisely so that it is a measurement. So the wait is
 * printed and the counter is not — the same shape `errorLines` already has,
 * where the third line appears only if it is true.
 *
 * Floored for `retryLine`'s reason: a wait that ends early is a promise kept.
 */
export function waitLine(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  return `retry in ${String(Math.floor(seconds))}s`;
}

// ── Holding a measured wait ────────────────────────────────────────────────
//
// The two lines of arithmetic behind the countdown, here rather than in the
// component, because they are a decision about a number and the component is
// markup plus a call. CI found out why they need a test: the first reading
// printed `retry in 201s` for a `Retry-After: 200`.
//
// THE UNIT IS THE SECOND, ALL THE WAY THROUGH, and that is the whole repair.
// The clock a React component may read is `secondSnapshot()`, which is
// `Math.floor(Date.now() / 1000)` — the START of the current second, up to 999ms
// in the past. Subtracting a millisecond deadline from it and rounding up
// therefore produced one second too many, and one second too many is a number
// larger than the one the api measured. Invariant 1 does not soften because the
// error is small and errs towards waiting.
//
// The cost of doing it in seconds is the other end: an answer that arrives at
// .999 of a second is released up to a second early. That is a courtesy
// releasing early, not an enforcement failing — the api decides, and it answers
// a premature attempt with a fresh 429 carrying a fresh measurement.

/**
 * The second at which a wait measured in seconds runs out.
 *
 * Floored to the same second `secondSnapshot()` reports, so that at the moment
 * the answer arrives the difference below is exactly what the api sent.
 */
export function deadlineSecond(answeredAtMs: number, retryAfterSec: number): number {
  return Math.floor(answeredAtMs / 1000) + Math.floor(retryAfterSec);
}

/** Whole seconds left, and never a negative one — a countdown does not run past
 *  zero, it stops. `0` is the caller's signal that the wait is over. */
export function secondsLeft(deadline: number, nowSecond: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(nowSecond)) return 0;
  return Math.max(0, deadline - nowSecond);
}
