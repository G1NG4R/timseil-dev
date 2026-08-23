// The identifier a visitor can quote, and the one every line of this container
// is filed under.
//
// Its own file rather than a corner of lib/trace.ts, and for the reason
// api/internal/reqid states about the same split: the two answer different
// questions. A request id is what somebody reads off an error page and pastes
// into a message; a trace id is what a backend joins on. They also have
// different futures — F6 replaces the trace generator with the OpenTelemetry SDK
// and leaves this untouched.
//
// THE ID IS ALWAYS MINTED HERE, NEVER ADOPTED.
//
// The api adopts an inbound X-Request-Id from a trusted proxy, because the web
// tier is meant to pass one through. Web has no such notion: it sits behind
// Traefik on the open internet, and every peer is a stranger. An adopted id
// would be a name a stranger picks for his own request in our log and in our
// answers to other people — the same argument middleware/requestid.go makes, and
// here it has no exception to carve out.
//
// `isValid` therefore has exactly one caller today: the test that proves the
// shape of what this mints. It exists because the shape is a promise — the value
// goes into a JSON log line and a response header, where a newline forges
// entries and a control character splits headers — and a promise with no check
// is a comment.

/**
 * The name on the wire. ADR 0009: the same value appears as `requestId` in every
 * problem document the api returns, so quoting either one finds the lines.
 */
export const REQUEST_ID_HEADER = "X-Request-Id";

// Sixteen bytes gives 32 characters — long enough that a collision is not worth
// reasoning about, short enough to paste into a chat message and grep for. The
// same size the api uses, so the two are indistinguishable in a log.
const SIZE = 16;

/** A fresh identifier: 32 lowercase hex characters. */
export function createRequestId(): string {
  const b = new Uint8Array(SIZE);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether an identifier may appear in a header and a log line.
 *
 * The same range the api accepts, so that a value one service tolerates is one
 * the other tolerates too: 8 to 64 characters of `[A-Za-z0-9_-]`.
 */
export function isValidRequestId(s: string): boolean {
  if (s.length < 8 || s.length > 64) return false;
  for (const c of s) {
    const ok =
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "-" ||
      c === "_";
    if (!ok) return false;
  }
  return true;
}
