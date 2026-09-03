// The two shapes every answer from the api can take, and the two readers that
// recognise them.
//
// SPLIT OUT OF client.ts IN H8, along the line that pays for itself — the same
// kind of cut client.ts made for `next/*`, one layer further out. `apiGet` runs
// on the server and writes a log line for every upstream call; `apiPost` runs in
// the BROWSER, where lib/log.ts and lib/scrub.ts would be bytes spent to write
// into a console nothing collects. Everything both halves need is here, and
// neither half imports the other.
//
// WHY THE RESULT IS A UNION AND NOT A THROW — inherited from serverFetch and
// still right: the page has one thing to do on every read failure, and it is
// invariant 1, show `— NO DATA`. A throw would make every caller write the same
// try/catch to reach the same answer. The contact form is the first caller for
// which the failures are DIFFERENT sentences — 400, 429 and 502 are three
// things to say — and it reads them off the same union rather than being handed
// an exception to sort.

import type { components } from "./schema";

/** An RFC 9457 problem document, as the contract declares it. */
export type Problem = components["schemas"]["Problem"];

export type ApiResult<T> =
  | {
      kind: "ok";
      status: number;
      data: T;
      /** The validator to send back as `If-None-Match`, when there was one. */
      etag: string | null;
      upstreamRequestId: string | null;
    }
  | {
      kind: "not-modified";
      status: 304;
      etag: string | null;
      upstreamRequestId: string | null;
    }
  | {
      kind: "fail";
      /** The HTTP status, or 0 when there was no answer at all. */
      status: number;
      /** The problem document, when the api sent one that parses. */
      problem: Problem | null;
      /**
       * `Retry-After`, in seconds, when the api sent one — otherwise `null`.
       *
       * ADDED IN H8 AND `null` FOR EVERY GET. The contact endpoint is the only
       * one that answers `429`, and ADR 0021 §3 makes the header worth reading
       * rather than assuming: the api derives the wait from `min(received_at)`,
       * so it is a MEASURED number. A page that printed a flat ten minutes
       * would be wrong for everyone who wrote nine minutes ago — an invented
       * number in the one place the api took the trouble not to invent one.
       */
      retryAfterSec: number | null;
      upstreamRequestId: string | null;
    };

/**
 * Reads the body as JSON, or gives up quietly.
 *
 * A body that will not parse is not an error worth its own line: the status
 * already says what happened, and the caller's answer to both is the same.
 */
export async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text === "") return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Recognises a problem document, or admits it did not.
 *
 * Checks the three fields the contract marks required and nothing else. A looser
 * check would let an error page from something that is not our api arrive at a
 * component as a `title` to render; a stricter one would drop a valid document
 * over an optional field.
 *
 * Deliberately no media-type check. `Content-Type` is what the sender claims,
 * and this is the shape the reader needs — a correct document with a wrong
 * header is still readable, and a wrong document with the right header is not.
 */
export function asProblem(body: unknown): Problem | null {
  if (typeof body !== "object" || body === null) return null;
  const p = body as Record<string, unknown>;
  if (typeof p.type !== "string") return null;
  if (typeof p.title !== "string") return null;
  if (typeof p.status !== "number") return null;
  return body as Problem;
}
