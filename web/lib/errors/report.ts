// The identifier that ties the page a visitor is looking at to the line an
// operator is reading.
//
// THE PROBLEM THIS SOLVES, measured before it was designed. An error boundary is
// a Client Component: it cannot call `headers()`, so it never sees the
// `request_id` or the `trace_id` that every other line on this site carries.
// What it does get is `error.digest`. And until H13 that value appeared on
// exactly one side — the screen — because `onRequestError` logged the message
// and not the digest. An identifier that is printed and never indexed is an
// identifier that leads nowhere.
//
// THE BRIDGE IS REAL AND IT IS ONE FIELD. Next sets `err.digest` in
// `server/app-render/create-error-handler.js` BEFORE it calls the
// instrumentation hook, and hands the same value to the boundary. So both ends
// are reading one property of one object. Nothing here invents a correlation;
// it copies one that already exists.
//
// WHAT THE DIGEST IS NOT, and the page says this too rather than only the ADR:
// it is `stringHash(message + stack)`, so it names the SHAPE of the failure, not
// the visit. Two people who hit the same bug get the same digest. It narrows a
// search to one defect, not to one request. The line in the log still carries
// `request_id` and `trace_id` for that, which is exactly why the digest is
// added BESIDE them and does not replace anything.

/**
 * A digest fit to put in a log line, or `undefined`.
 *
 * VALIDATED RATHER THAN TRUSTED, for the reason lib/correlation.ts gives about
 * `request_id`: a value that reaches a log line unchecked is a value whose shape
 * a stranger could have chosen. Here the argument is narrower but real — `err`
 * is `unknown` because React may have replaced the thrown value, so what arrives
 * is whatever survived that, and a thrown object may carry any `digest` it likes.
 *
 * The accepted form is the one Next produces: digits, optionally followed by
 * `@E` and an error code (`lib/error-telemetry-utils.js`,
 * `createDigestWithErrorCode`). Two consequences fall out of that for free, and
 * both are wanted:
 *
 *   - Next's control signals are refused. `notFound()` and `redirect()` travel
 *     as digests too — `NEXT_HTTP_ERROR_FALLBACK;404`, `NEXT_REDIRECT` — and
 *     neither is a failure. Logging one as a digest would file a working page
 *     under a defect.
 *   - A digest somebody chose the text of cannot enter the line.
 */
export function errorDigest(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if (!("digest" in err)) return undefined;

  const { digest } = err;
  if (typeof digest !== "string") return undefined;

  return DIGEST.test(digest) ? digest : undefined;
}

// Bounded on purpose. The lengths are far above anything Next emits — a 32-bit
// hash is ten digits — and the point of a bound is not to be tight but to be
// there: an unbounded group is how a pattern becomes a way to write a long line.
const DIGEST = /^\d{1,20}(?:@E\d{1,10})?$/;
