// Who may make this site fail on purpose.
//
// H13's acceptance needs a failure it caused itself: "Ein absichtlicher Fehler
// zeigt die gestaltete Seite und erzeugt einen Trace" (build-plan.md, H13), and
// #186 has been waiting since F1b for `onRequestError` to be triggered once for
// real. A rule about who may do that belongs in a function with a test, not in
// an `if` inside a .tsx — ADR 0044, the same reason lib/gallery/visibility.ts
// exists.
//
// SECOND READER OF NODE_ENV, and the first was the gallery. The reasoning there
// holds unchanged and is not repeated: what you look at locally should be what
// a visitor gets, so asking is confined to a named function rather than becoming
// a habit. What differs is the cost of being wrong. The gallery answering on a
// public address is an embarrassment; a route that throws on a public address is
// a page that reports itself broken. Both fail closed, for different sizes of
// the same reason.
//
// IT IS NOT A SECURITY BOUNDARY, and says so for the same reason visibility.ts
// does: anyone who can set an environment variable on the host already owns the
// container. What it is, is the difference between an error path that was
// measured and one that was hoped for.
//
// ONE FLAG, TWO ROUTES. An earlier draft gave the flag a mode — "page" or
// "layout" — so one variable could steer which failure happened. It was dropped
// before it was built: the rig can set only one value per run
// (playwright.config.ts, webServer.env), so a mode would have cost a second
// browser run to reach the second failure. The routes are the mode. The flag
// only says whether the door is open.

/** The variable that opens the door. Documented in docs/runbooks/web.md. */
export const DEV_ERROR_ENV = "DEV_ERROR_DRILL";

/**
 * `true` away from a production build, or when the override is set to `1`.
 *
 * Deliberately the same shape and the same refusals as `galleryVisible`: `"1"`
 * exactly, so that a variable someone set to `0` or `false` to turn the drill
 * OFF does not turn it on. Two gates that answer differently to the same input
 * would be two gates to remember.
 */
export function errorDrillOpen(nodeEnv: string | undefined, override?: string): boolean {
  if (override === "1") return true;
  return nodeEnv === "development" || nodeEnv === "test";
}
