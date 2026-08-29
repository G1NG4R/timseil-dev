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
