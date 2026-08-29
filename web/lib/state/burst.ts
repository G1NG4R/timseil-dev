// "EIN GLITCH ZUR ZEIT" — the rule behind move M5, as a function.
//
// STATE.05: the burst "feuert nur bei echtem Zustandswechsel und blockiert
// weitere Bursts für 600ms". Both halves are decisions, so both are here rather
// than inside a component: what counts as a real change, and when the next one
// may fire.
//
// THE ANIMATION IS NOT IN THIS PHASE, and the reason is that nothing can be
// seen yet. Nothing in production changes a state while a visitor is looking;
// producing `ok`→`degraded` takes a reconfigured api, and `next dev` does not
// hydrate (open finding, due before H1), so the burst would only ever run
// against a locally built production image. G7 builds it, where the gallery has
// a button that flips a state by hand — the first place it has both a trigger
// and a viewer. Issue against milestone G7.
//
// What IS here is testable today, and it is the half that goes wrong quietly: a
// lock that never releases stops the burst for ever, and a lock that never
// holds makes the page flicker on every poll.

import type { StateKey } from "./words.ts";

/**
 * How long one burst keeps the next one out.
 *
 * Not a token. tokens.css holds what a stylesheet reads — colour, radius,
 * duration — and this is neither read by CSS nor drawn: it is a rule about how
 * often the page may interrupt itself. `--d-glitch` (280ms, the sheet's ≤300ms
 * ceiling) is the drawn half and stays in tokens.css where G1 put it.
 */
export const BURST_LOCK_MS = 600;

/**
 * Has the lock expired?
 *
 * `null` means no burst has fired in this document yet, and the first one is
 * always allowed.
 *
 * A CLOCK THAT RAN BACKWARDS PROVES NOTHING, so it holds the lock rather than
 * releasing it. Callers should pass `performance.now()`, which is monotonic and
 * cannot do this; the guard is for the caller that passes `Date.now()` on a
 * machine whose clock is being corrected, where the alternative is a burst
 * every frame until the clock catches up.
 */
export function canBurst(lastAt: number | null, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  if (lastAt === null) return true;
  if (!Number.isFinite(lastAt)) return true;

  const elapsed = now - lastAt;
  return elapsed >= 0 && elapsed >= BURST_LOCK_MS;
}

/**
 * Should a burst fire for this transition?
 *
 * A REAL CHANGE HAS TWO KNOWN ENDS. `prev === null` is the first value this
 * component ever saw, not a transition — bursting there would mean every page
 * load glitches once, which is decoration pretending to be a signal. Arriving
 * at the same word again is not a change either, however many times the poll
 * returned it.
 */
export function shouldBurst(
  prev: StateKey | null,
  next: StateKey,
  lastAt: number | null,
  now: number,
): boolean {
  if (prev === null || prev === next) return false;
  return canBurst(lastAt, now);
}
