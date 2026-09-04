// The header clock, the footer clock and the one in the mobile menu — all three
// read the same second from the same interval.
//
// NOTHING FROM `next/*` IN HERE, and no timer started at import time — the two
// rules lib/theme.ts follows, for the same reason: `node --test` reads this file
// directly, and the refcount below is the thing most worth testing in the whole
// phase. `setInterval` is a global in Node too, so the store is fully
// exercisable without a DOM.
//
// THE CLOCK IS THIS PHASE'S ACCEPTANCE CRITERION. The build plan calls it a
// hydration trap and prescribes a placeholder plus `suppressHydrationWarning`.
// What is below goes one step further: with `useSyncExternalStore`, React
// renders `getServerSnapshot()` during hydration, so the server pass and the
// hydration pass are the same eight characters BY CONSTRUCTION and the live
// value only arrives in the render after commit. There is no divergent tree for
// React to complain about at any point.
//
// That is a different thing from suppressing the warning, and the difference is
// the phase. `useState(CLOCK_PLACEHOLDER)` plus an effect produces the same
// result today — but only because of the value of one argument, which any
// refactor can lose without the test suite noticing. ADR 0044.

/** Eight characters, the same width as a formatted time. The header must not
 *  reflow when the digits arrive. */
export const CLOCK_PLACEHOLDER = "--:--:--";

/** The design's own cadence: `setInterval(tick, 1000)`. It drifts, and on a busy
 *  tab a viewer will occasionally see a second skipped; a self-rearming
 *  `setTimeout(1000 - Date.now() % 1000)` would land on the boundary instead.
 *  That is a behaviour the sheet does not specify, so it is in the backlog
 *  rather than here. */
export const CLOCK_INTERVAL_MS = 1000;

/**
 * `HH:MM:SS`, 24-hour, UTC — via `toISOString`, which is UTC by definition and
 * therefore immune to the machine's zone.
 *
 * The obvious rewrite, `getHours()` and friends with padding, is wrong on every
 * machine that is not on UTC and right on CI, which runs on UTC. clock.test.ts
 * forces the question in a child process with `TZ=Asia/Kathmandu` — chosen
 * because +05:45 breaks the hour AND the minute, where a +01:00 zone would let a
 * minute bug through.
 */
export function formatUtc(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

// ONE INTERVAL, HOWEVER MANY CLOCKS. The set is the refcount: the first
// subscriber starts the timer, the last one to leave clears it.
//
// Three `useEffect`s with three `setInterval`s would tick out of phase, and on a
// slow frame two clocks in the same viewport show different seconds. That is a
// defect no test catches and every visitor can see.

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

/** The subscribe half of useSyncExternalStore. Must stay a stable module-level
 *  reference — React re-subscribes whenever this identity changes, and the
 *  refcount would thrash on every render. */
export function subscribeClock(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= setInterval(() => {
    for (const listener of listeners) listener();
  }, CLOCK_INTERVAL_MS);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// The snapshot is cached to the second rather than computed per call. Two calls
// inside the same second return the identical string, so React's Object.is check
// is stable and "The result of getSnapshot should be cached to avoid an infinite
// loop" cannot appear. A string would very nearly do this on its own — but
// "nearly" is what the cache removes, and the warning is a console entry, which
// is exactly what this phase is measured on.

let frame = CLOCK_PLACEHOLDER;
let frameSecond = -1;

/** What the clock reads right now, in the browser. */
export function clockSnapshot(): string {
  const now = Date.now();
  const second = Math.floor(now / CLOCK_INTERVAL_MS);
  if (second !== frameSecond) {
    frameSecond = second;
    frame = formatUtc(now);
  }
  return frame;
}

/** Always the placeholder, on the server and during hydration alike.
 *
 *  THIS IS THE FUNCTION THAT MAKES THE PHASE PASS. Returning a real time here —
 *  the one edit that looks like an improvement — puts a different string in the
 *  server HTML than in the hydration render and brings back precisely the
 *  mismatch the phase exists to remove. clock.test.ts pins it. */
export function clockServerSnapshot(): string {
  return CLOCK_PLACEHOLDER;
}

// ── The same second, as a number ───────────────────────────────────────────
//
// H8b needed the clock to COMPARE a time rather than to print one: the contact
// form holds the api's measured `Retry-After` and counts it down, and a
// countdown needs "how many seconds are left", not "14:22:07".
//
// IT IS A SNAPSHOT AND NOT A `Date.now()` IN THE COMPONENT, which is the whole
// point of putting it here. Reading a wall clock in a render body is what makes
// a render non-idempotent — React may run it twice and get two answers — and
// the lint rule `react-hooks/purity` refuses it outright. `getSnapshot` is the
// one place a clock is allowed to be read, because React knows to call it
// again rather than to trust what it returned.

/**
 * The current second, from the same interval every other clock on this page
 * reads.
 *
 * NO CACHE, AND THE STRING ABOVE HAS ONE. That difference is not an oversight:
 * `clockSnapshot` caches because two calls in one second must return the
 * IDENTICAL string, and `Object.is` on two equal strings built separately is
 * true in practice but is not what the value promises. Two equal numbers are
 * `Object.is`-equal by definition, so the cache would be a line that cannot
 * change any outcome.
 */
export function secondSnapshot(): number {
  return Math.floor(Date.now() / CLOCK_INTERVAL_MS);
}

/**
 * Zero, on the server and during hydration alike — `clockServerSnapshot`'s
 * placeholder in the other unit.
 *
 * A caller reads it as "the browser clock has not taken over yet" and counts
 * nothing down, which is correct rather than defensive: nothing can be being
 * waited out before a visitor has pressed anything.
 */
export function secondServerSnapshot(): number {
  return 0;
}
