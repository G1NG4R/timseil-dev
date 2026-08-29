// Who may see the gallery.
//
// The build plan gives the route four words — "nur in Development" — and this
// is the whole of that rule, as a function rather than as an `if` inside the
// page, because a rule inside a .tsx cannot be tested here (ADR 0044).
//
// THIS IS THE FIRST NODE_ENV READ IN web/. There was none before: nothing on
// this site behaved differently in development, and the value of that is that
// what you look at locally is what a visitor gets. The gallery is the first
// thing that must NOT ship, so it is the first thing allowed to ask — and the
// asking is confined to one function with one test rather than becoming a habit
// that spreads to pages where "works locally" starts meaning nothing.
//
// WHY THERE IS A SECOND DOOR, and why it was not in this phase's plan. The plan
// refused an override on the grounds that it would be a switch for a run nobody
// had written. Measurement removed that ground: `next dev` does not hydrate —
// the open finding from G4, reproduced here against `/` in the same server,
// where the clock sits at `--:--:--` and a click does nothing — and a
// production build answers 404 on this route. Between the two there was nowhere
// left to WATCH the state-change burst, which is the whole of issue #230 and
// due in this phase. A burst that has never been seen is not a feature, it is a
// spec with a compile step.
//
// So the flag exists, it is off unless someone sets it, and compose.yaml never
// does. It is not a security boundary and does not pretend to be one: anyone
// who can set an environment variable on the host already owns the container.
// What it is, is the difference between shipping an animation that was measured
// and one that was hoped for.

/** The variable that opens the second door. Documented in docs/runbooks/web.md. */
export const DEV_GALLERY_ENV = "DEV_GALLERY";

/**
 * `true` away from a production build, or when the override is set to `1`.
 *
 * ANYTHING ELSE IS TREATED AS PRODUCTION AND CLOSED. An unset or misspelled
 * NODE_ENV must fail closed: the cost of hiding the gallery on a developer's
 * machine is a puzzled minute, and the cost of the other direction is a
 * development tool answering on a public address. The override is `"1"` exactly
 * — not "true", not "yes", not any non-empty string — so that a variable set to
 * `0` or `false` by someone who meant to turn it off does not turn it on.
 */
export function galleryVisible(nodeEnv: string | undefined, override?: string): boolean {
  if (override === "1") return true;
  return nodeEnv === "development" || nodeEnv === "test";
}
