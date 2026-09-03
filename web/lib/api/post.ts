// The one POST this site makes, and the first request a BROWSER on this site has
// ever sent to the api.
//
// EVERYTHING BEFORE THIS RAN ON THE SERVER. lib/http/url.ts has held the door
// open since G4 and named the caller: "The browser branch has no caller in G4 —
// the first one is the contact form in H8. It exists here rather than in H8
// because the decision is this phase's and the test below it is cheap." So the
// target is `apiTarget`'s relative branch: same origin, Traefik's
// `PathPrefix(/api)` router hands it to the api container, no CORS preflight,
// no environment variable that can point at the wrong host.
//
// AND IT IS A BROWSER CALL RATHER THAN A SERVER ACTION FOR ONE REASON. ADR 0021
// §3 counts three sends per IP per ten minutes, and `middleware/clientip.go`
// reads the address from `X-Forwarded-For` only when the peer is a trusted
// proxy. Were the page to post to Next and Next to forward, every message on
// this site would arrive from the `web` container's address and the whole site
// would share one bucket of three. The limit is the design; the island follows
// from it.
//
// NO LOG LINE, AND THAT IS THE OTHER HALF OF THE SPLIT. lib/api/client.ts writes
// one for every upstream call, which is right on a server whose stdout Alloy
// collects. Here it would pull lib/log.ts and lib/scrub.ts into a bundle with
// 6 725 bytes of headroom (ADR 0050) to write a line into a visitor's console
// that nothing reads. The api writes its own access line for this request, with
// the request id this function returns.

import { apiTarget } from "../http/url.ts";

import { type ApiResult, asProblem, readJson } from "./problem.ts";
import type { paths } from "./schema";

/** Every path the contract serves with a POST. */
export type PostPath = {
  [P in keyof paths]: paths[P] extends { post: object } ? P : never;
}[keyof paths];

/** The `application/json` body a POST on `P` expects. */
export type PostBody<P extends PostPath> = paths[P] extends {
  post: { requestBody: { content: { "application/json": infer B } } };
}
  ? B
  : never;

/**
 * The body a POST on `P` answers with when it worked.
 *
 * `202` and not `200`, because "accepted" and "delivered" are different words
 * and ADR 0021 §1 is why: the handler tries once, and a message it could not
 * send stays `queued` for a dispatcher to carry. A path that answers `200` gets
 * its own arm the day there is one.
 */
export type PostAccepted<P extends PostPath> = paths[P] extends {
  post: { responses: { 202: { content: { "application/json": infer B } } } };
}
  ? B
  : never;

/**
 * The client's patience, from the build plan (H8, "8 s Client-Timeout").
 *
 * Longer than `apiGet`'s two seconds, and for the opposite reason. A GET's
 * budget is how long a visitor waits before being told there is no number; this
 * is how long they wait for an answer about something they wrote. The api's own
 * SMTP attempt is bounded at 7 s (`api/internal/mail/smtp.go`, "well under the
 * 8 s the contact page gives up at"), so the two were sized against each other:
 * giving up at 5 s would abandon a request that was about to succeed.
 */
export const POST_TIMEOUT_MS = 8000;

/**
 * What a POST can answer with.
 *
 * `ApiResult` minus the `304` arm, because a POST has no validator to send and
 * no cached copy to be told about. Leaving it in would make every caller narrow
 * past a case that cannot happen — and, worse, the one that matters would slip
 * through: `retryAfterSec` lives on the failure arm, and a union that still
 * carried `not-modified` hides it behind a check nobody can satisfy.
 */
export type PostResult<T> = Exclude<ApiResult<T>, { kind: "not-modified" }>;

export interface PostOptions {
  timeoutMs?: number;
  /** The abort signal of whatever owns the attempt, when there is one. */
  signal?: AbortSignal;
}

/**
 * `Retry-After` as a number of seconds, or `null`.
 *
 * RFC 9110 allows a date as well as a delay, and the api sends a delay. A date
 * is parsed anyway rather than dropped: the alternative is a page that shows no
 * wait at all because a proxy rewrote the header, and "come back later" with no
 * number is the answer this site refuses everywhere else.
 *
 * A negative or unparseable value is `null` and not `0`, because zero is a
 * promise that the next attempt will work.
 */
export function retryAfterSeconds(header: string | null): number | null {
  if (header === null) return null;
  const raw = header.trim();
  if (raw === "") return null;

  if (/^\d+$/.test(raw)) {
    const seconds = Number.parseInt(raw, 10);
    return Number.isFinite(seconds) ? seconds : null;
  }

  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  const seconds = Math.ceil((at - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

/**
 * One POST against the api, typed by the contract.
 *
 * Fails the way `apiGet` fails — a union arm, never a throw — but the caller
 * does something DIFFERENT with each one, which is new. `status` is the whole
 * branch: 202 is a receipt, 400 carries `invalidParams`, 429 carries a measured
 * wait, 502 means the relay is down and the message is stored anyway.
 *
 * `content-type` IS `application/json` AND NOTHING IS SENT WITH IT. The api
 * would accept a `; charset=utf-8` — `isJSON` cuts at the semicolon and compares
 * the media type — so this is not a strictness the api enforces, and an earlier
 * draft of this comment said it was and was wrong. What the api DOES enforce is
 * that the type is JSON at all, and the Origin check depends on it: a
 * cross-origin `<form>` can send `urlencoded`, `text/plain` or `multipart`
 * without ever triggering a preflight, and JSON cannot (ADR 0021 §9). The bare
 * value is sent because a parameter buys nothing here and is one more thing to
 * be wrong about.
 */
export async function apiPost<P extends PostPath>(
  path: P,
  body: PostBody<P>,
  options: PostOptions = {},
): Promise<PostResult<PostAccepted<P>>> {
  // Two reasons to stop: the deadline and the caller. `AbortSignal.any` fires on
  // whichever comes first, so a visitor who navigates away does not leave a
  // request running against a rate limit they will want back.
  const deadline = AbortSignal.timeout(options.timeoutMs ?? POST_TIMEOUT_MS);
  const signal =
    options.signal === undefined ? deadline : AbortSignal.any([deadline, options.signal]);

  try {
    const response = await fetch(apiTarget(path), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
      // Nothing about a POST is reusable, and the contract says so in the
      // header it declares on the answer (`CacheControlNone`).
      cache: "no-store",
    });

    // Same-origin, so this is readable without the api exposing it. A
    // cross-origin caller cannot read it — issue #188, and not this page's
    // problem.
    const upstreamRequestId = response.headers.get("x-request-id");
    const retryAfterSec = retryAfterSeconds(response.headers.get("retry-after"));
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        kind: "fail",
        status: response.status,
        problem: asProblem(payload),
        retryAfterSec,
        upstreamRequestId,
      };
    }

    // A 202 whose body is not an object is not a body this contract describes,
    // and a receipt nobody can quote is worse than an admitted failure: the
    // sender would be told their message arrived, on this page, whose whole
    // argument is that it only says what it can show.
    if (typeof payload !== "object" || payload === null) {
      return {
        kind: "fail",
        status: response.status,
        problem: null,
        retryAfterSec,
        upstreamRequestId,
      };
    }

    return {
      kind: "ok",
      status: response.status,
      data: payload as PostAccepted<P>,
      etag: null,
      upstreamRequestId,
    };
  } catch {
    // No answer at all: the deadline fired, the visitor left, or the connection
    // never opened. `status: 0` is the same "there was nobody there" `apiGet`
    // reports, and the caller tells the three apart by status rather than by
    // catching anything.
    return { kind: "fail", status: 0, problem: null, retryAfterSec: null, upstreamRequestId: null };
  }
}
