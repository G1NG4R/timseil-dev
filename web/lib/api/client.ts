// The typed half of the web→api hop.
//
// This replaces lib/http/serverFetch.ts, which asked for it in its own header:
// "If this file grows a second concern before G4, that is the moment to stop and
// write G4 instead." Four arrived at once — a generated type, a problem
// document, a conditional request, and two different answers about caching — so
// the work is split along the one line that pays for itself:
//
//   NOTHING FROM `next/*` IN HERE.
//
// lib/http/url.ts already bought that lesson: "`node --test` cannot load a
// module that imports `next/headers`, so a rule that lives next to the fetch is
// a rule with no test." Everything below runs under a unit test. What needs
// `headers()` or `use cache` lives in lib/api/readers.ts, where it is one short
// file that a container run has to cover instead.
//
// WHY THE RESULT IS A UNION AND NOT A THROW
//
// Inherited from serverFetch and still right: the page has one thing to do on
// every failure, and it is invariant 1 — show `— NO DATA`. A throw would make
// every caller write the same try/catch to reach the same answer, and the first
// caller to forget it would render a 500 on a page whose only job was to admit
// it has no number. ADR 0035 says the api is briefly gone during step 3 of every
// rollout, so this is a normal Tuesday and not an exceptional path.
//
// `304` is its own arm rather than a status on the ok arm, because a caller that
// treats it as a body reads `undefined` and calls it data. The type makes that
// unwritable.

import type { Correlation } from "../log.ts";
import { log } from "../log.ts";
import { REQUEST_ID_HEADER } from "../reqid.ts";
import { errorText } from "../scrub.ts";

import { apiTarget, buildQuery, resolvePath } from "../http/url.ts";
// The generated declarations, by name and without an extension: TypeScript
// resolves `schema.d.ts` from here, and `import type` is erased before Node ever
// sees a specifier to resolve. Written by `make gen`; never by hand.
import type { paths } from "./schema";
import { asProblem, type ApiResult, type Problem, readJson } from "./problem.ts";

// `Problem` and `ApiResult` MOVED TO ./problem.ts IN H8 and are re-exported
// here, so no caller changed. The move is the contact form's: apiPost runs in
// the BROWSER, this file imports the logger, and the logger imports the
// scrubber — three modules a page with 6 725 bytes of headroom would be paying
// for in order to write a line into a visitor's console that nothing collects.
// The seam is the same one this file's own header drew for `next/*`, one layer
// further out.
export type { ApiResult, Problem } from "./problem.ts";

/** Every path the contract serves with a GET. */
export type GetPath = {
  [P in keyof paths]: paths[P] extends { get: object } ? P : never;
}[keyof paths];

/**
 * The `application/json` body a GET on `P` answers `200` with.
 *
 * Derived from the contract rather than restated. CLAUDE.md: "Nie einen Typ von
 * Hand schreiben, der im Contract steht" — and a hand-written `Health` would
 * keep compiling for exactly as long as it took someone to change the contract.
 */
export type GetBody<P extends GetPath> = paths[P] extends {
  get: { responses: { 200: { content: { "application/json": infer B } } } };
}
  ? B
  : never;

export interface GetOptions {
  /**
   * Values for the `{name}` placeholders of a templated contract path.
   *
   * `/api/systems/{slug}` is the first path that has any; every path before H1
   * was a literal and passed none. lib/http/url.ts holds the rule about what a
   * value may be, because that is the SSRF guard and it is the file a unit test
   * can reach.
   */
  params?: Record<string, string>;
  /**
   * Values for the query parameters of a contract path.
   *
   * A SECOND FIELD AND NOT A WIDER `params`, and lib/http/url.ts carries the
   * argument at length: `resolvePath` rejects any key its template does not
   * declare, which is the guard that keeps a value inside its path segment, and
   * `?window=30` is not a reason to spend it. `buildQuery` has its own
   * allow-list, deliberately a different one.
   *
   * `/api/systems/{slug}?window=30` is the first call that needs it — H5b, the
   * homepage's 30-day strip beside the case study's 91.
   */
  search?: Record<string, string>;
  /** Headers to add — correlation on the live path, nothing on the cached one. */
  headers?: Record<string, string>;
  /** A validator from an earlier answer, sent as `If-None-Match`. */
  ifNoneMatch?: string | null;
  timeoutMs?: number;
  /** Only for the log line. The transport does not read them. */
  ids?: Correlation;
  /**
   * What the framework may do with this request.
   *
   * `"no-store"` outside a cached scope, omitted inside one. Not because
   * `no-store` breaks `use cache` — it was accused of that during this phase and
   * measured innocent — but because inside a `use cache` boundary the lifetime
   * already belongs to `cacheLife`, and a second instruction about the same
   * question is how a page ends up serving a number nobody can explain the age
   * of.
   */
  cache?: RequestCache;
}

// Short on purpose. This runs inside a page render, so it is a budget for how
// long a visitor waits before being told there is no number — not a budget for
// how patient we can afford to be.
const DEFAULT_TIMEOUT_MS = 2_000;

/**
 * One GET against the api, typed by the contract.
 *
 * Makes no caching decision of its own — it passes the caller's through. Whether
 * an answer is reused is decided one layer up, by whether the caller sits inside
 * a `use cache` boundary, and lib/api/readers.ts is where both callers are.
 */
export async function apiGet<P extends GetPath>(
  path: P,
  options: GetOptions = {},
): Promise<ApiResult<GetBody<P>>> {
  const started = performance.now();
  const ids = options.ids ?? {};

  const headers = new Headers({ accept: "application/json" });
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name, value);
  }
  if (options.ifNoneMatch !== undefined && options.ifNoneMatch !== null) {
    headers.set("if-none-match", options.ifNoneMatch);
  }

  try {
    // Resolved here rather than by the caller so that the log line below keeps
    // the TEMPLATE. `path` is the field a query groups by, and a resolved one
    // would grow a new value per slug — the cardinality mistake that makes a
    // log field useless exactly when there is enough traffic to need it. The
    // route is in the template, and the answer's status is in the same line.
    const resolved = options.params === undefined ? path : resolvePath(path, options.params);
    const query = options.search === undefined ? "" : buildQuery(options.search);
    const target = `${resolved}${query}`;

    const response = await fetch(apiTarget(target), {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      ...(options.cache === undefined ? {} : { cache: options.cache }),
    });

    const upstreamRequestId = response.headers.get(REQUEST_ID_HEADER);
    const etag = response.headers.get("etag");

    log(
      "INFO",
      "upstream request",
      {
        method: "GET",
        path,
        // AND THE QUERY BESIDE IT, because the template alone stopped being
        // enough the moment one path could ask two questions:
        // `/api/systems/{slug}` answers with 30 days or 91 depending on this
        // string, and without it the two calls write the same line. It does not
        // go INTO `path` for that field's own reason — this one is bounded by
        // buildQuery's allow-list and by the contract's `window` enum, and the
        // slug is not.
        query,
        status: response.status,
        duration_ms: Math.round(performance.now() - started),
        upstream_request_id: upstreamRequestId,
        conditional: options.ifNoneMatch !== undefined && options.ifNoneMatch !== null,
      },
      ids,
    );

    if (response.status === 304) {
      return { kind: "not-modified", status: 304, etag, upstreamRequestId };
    }

    const body = await readJson(response);

    if (!response.ok) {
      return {
        kind: "fail",
        status: response.status,
        problem: asProblem(body),
        // A GET never asks anybody to come back later. The field exists for
        // `/api/contact`, and null here is "the api said nothing", not zero.
        retryAfterSec: null,
        upstreamRequestId,
      };
    }

    // A `200` whose body is not an object is not a body this contract describes.
    // Calling it data would push the lie one layer down, to whoever reads a
    // field off it.
    if (typeof body !== "object" || body === null) {
      return { kind: "fail", status: response.status, problem: null, retryAfterSec: null, upstreamRequestId };
    }

    return { kind: "ok", status: response.status, data: body as GetBody<P>, etag, upstreamRequestId };
  } catch (err: unknown) {
    // The line the scrubber exists for. undici puts the refused address in the
    // cause of a TypeError, so errorText walks the chain and lib/scrub redacts
    // what it finds — without both halves, every rollout writes the container
    // addresses into the log.
    log(
      "ERROR",
      "upstream request failed",
      {
        method: "GET",
        path,
        status: 0,
        duration_ms: Math.round(performance.now() - started),
        error: errorText(err),
      },
      ids,
    );

    return { kind: "fail", status: 0, problem: null, retryAfterSec: null, upstreamRequestId: null };
  }
}
