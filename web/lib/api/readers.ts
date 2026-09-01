// Every read this site makes against the api, and the rule that decides which
// door each one takes.
//
// The file was written in G4 with two readers of /api/health and a note about
// "whoever adds a third reader in stage H". H1 is that phase, and the third one
// reads a different endpoint — so the heading is no longer about one document,
// but the rule below is unchanged and is what the contrast was kept for. It is
// in Next's own documentation,
// node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md:
//
//   "Cached functions and components cannot access runtime APIs like cookies(),
//    headers(), or searchParams […] On a dynamically rendered route this
//    surfaces when the route runs, so it CAN PASS `next build` AND FAIL UNDER
//    `next start`."
//
// The visitor's request id lives in headers(). So it cannot enter a cached
// scope. Passing it in as an argument would be worse, not better: arguments are
// part of the cache key, a cache keyed by one id per visitor is not a cache, and
// a cache that ignored the argument would hand every visitor the id of the
// first — the same shape ADR 0044 warns about for `usePathname()`.
//
// Hence: the cached reader carries no correlation and is honest about it, and
// the correlated reader carries no cache and is honest about that.
//
// NOTHING IN HERE IS UNIT TESTED, and that is the cost of the imports below.
// What these functions do is covered by the container run in docs/runbooks/web.md;
// what they decide was moved into lib/api/health.ts and lib/api/systems.ts,
// which are. A reader that grew a judgement of its own would be a decision with
// no test, so the shape to keep is: fetch, cache, hand it on.
//
// Sharing a module with a `next/headers` import does NOT stop healthCached from
// caching. That was suspected during G4 and measured false — /about, which
// renders only the cached islands, makes zero upstream calls over ten loads.
// Written down so nobody splits this file for that reason.

import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";

import { correlationFrom, logIds } from "../correlation.ts";
import { log } from "../log.ts";
import { REQUEST_ID_HEADER } from "../reqid.ts";
import { TRACEPARENT_HEADER, childSpan, renderTraceparent } from "../trace.ts";

import { apiGet } from "./client.ts";
import { NO_HEALTH, footerHealth, healthOrThrow, type FooterHealth, type Health } from "./health.ts";
import type { SystemDetail } from "./systems.ts";
import type { Training } from "./training.ts";

/** The tag this answer is filed under. One name, so a reader can grep for it. */
export const HEALTH_TAG = "health";

/**
 * /api/health, shared between every visitor for the length of one cache window.
 *
 * WHY THIS ONE THROWS WHEN THE CLIENT DOES NOT.
 *
 * `use cache` stores whatever the function returns — including a value that
 * means "no data". If the fill lands inside the rollout window of #157, the
 * footer would then show `— NO DATA` for the next sixty seconds, long after the
 * api came back, and the cache would be doing exactly what compose.yaml:583 says
 * a cache here must never do: keep last week's answer alive.
 *
 * The only lever `use cache` offers for not storing something is not returning
 * it. So a failure leaves by the other door, and the caller renders the resting
 * state. Everything about the failure has already been logged one layer down.
 *
 * There is no `revalidateTag(HEALTH_TAG)` anywhere in this repository, and that
 * is deliberate rather than unfinished: a deploy replaces the container, and
 * `.next/cache` is tmpfs (compose.yaml:583), so the cache is empty by
 * construction on every new build. The tag names the entry for the day a second
 * web replica or a shared cache handler makes an on-demand call meaningful.
 */
export async function healthCached(): Promise<Health> {
  "use cache";
  cacheLife("health");
  cacheTag(HEALTH_TAG);

  // No headers() and no correlation, by the rule at the top of this file. The
  // line the api writes for this call therefore stands under an id of its own —
  // the fill's, not any one visitor's, which is the truthful attribution: one
  // upstream request served the next sixty seconds of visitors.
  //
  // And no `cache` option: the lifetime of this answer is cacheLife's above, and
  // one question may only have one mechanism. Measured on /about, which renders
  // the two cached islands and nothing else: ten page loads after the first,
  // zero upstream calls.
  return healthOrThrow(await apiGet("/api/health"));
}

// The validator from the last answer this process saw, and the answer it
// belongs to. Process-local on purpose: it is a conditional-request memo, not a
// cache — its only job is to let the api say `304` instead of resending a body
// that has not changed.
//
// `output: "standalone"` traces each entry point separately, so two bundles can
// hold two copies of this module and one may not see what the other stored
// (lib/correlation.ts documents the same hazard). The failure mode of that is a
// `200` where a `304` was possible. Nothing reads a stale body: the body is only
// ever returned when the api itself answers `304` about it.
let lastEtag: string | null = null;
let lastBody: Health | null = null;

/**
 * /api/health for this one visitor, carrying this one visitor's ids.
 *
 * This is the call that makes the web→api hop findable: the request id and a
 * child span go out on the wire, both services write a line, and one `trace_id`
 * joins them. It is the F1b acceptance and it stays uncached for that reason —
 * a shared answer would have nobody's id on it.
 */
export async function healthLive(): Promise<Health | null> {
  const correlation = correlationFrom(await headers());
  const ids = logIds(correlation);

  // Same trace, a new span: without one this container and the api are a single
  // span in F8's view and the hop has no width. A request with no inbound trace
  // is a route outside the proxy's matcher, and it gets no traceparent rather
  // than an invented one.
  const outbound = correlation.span === null ? null : childSpan(correlation.span);

  // Loud rather than silent. A call with no correlation still works and still
  // returns a body, so the failure would look exactly like success — the hop
  // would simply stop being findable, and nothing would say when it stopped.
  if (correlation.requestId === null && correlation.span === null) {
    log("WARN", "upstream request has no correlation", { path: "/api/health" }, ids);
  }

  const outboundHeaders: Record<string, string> = {};
  if (correlation.requestId !== null) {
    outboundHeaders[REQUEST_ID_HEADER] = correlation.requestId;
  }
  if (outbound !== null) {
    outboundHeaders[TRACEPARENT_HEADER] = renderTraceparent(outbound);
  }

  const result = await apiGet("/api/health", {
    headers: outboundHeaders,
    ifNoneMatch: lastEtag,
    ids,
    // Outside any cached scope, and it says so rather than relying on the
    // default: this answer belongs to one visitor and must never be reused for
    // another.
    cache: "no-store",
  });

  if (result.kind === "not-modified") {
    return lastBody;
  }

  if (result.kind !== "ok") {
    // The validator goes with the answer it described. Keeping it after a
    // failure would send `If-None-Match` for a body this process no longer
    // holds, and a `304` would then be answered with `null`.
    lastEtag = null;
    lastBody = null;
    return null;
  }

  lastEtag = result.etag;
  lastBody = result.data;
  return result.data;
}

/**
 * The three meta-bar values, or the resting state. Never throws.
 *
 * Two components stream this — the footer's meta bar and the strip at the foot
 * of the mobile menu — and both want the same three sentences: wait for a
 * request, ask the shared cache, and show `— NO DATA` rather than an error if
 * there is no answer. Written once so the two cannot start disagreeing.
 *
 * `connection()` is the load-bearing line. Without it these values are rendered
 * during `next build`, and `next build` runs inside `docker build`, where no
 * `api:8080` exists — so every route's static shell would be baked with
 * `— NO DATA` and hold it for the whole expire window. With it, the shell stays
 * static and only these cells wait.
 *
 * The catch swallows nothing that was not already recorded: healthCached throws
 * so that a failed answer is never stored, and lib/api/client.ts wrote the
 * status, the duration and the scrubbed error before it got here.
 */
export async function footerHealthNow(): Promise<FooterHealth> {
  await connection();

  try {
    return footerHealth(await healthCached());
  } catch {
    return NO_HEALTH;
  }
}

/** The tag a system's answer is filed under. One name, so a reader can grep for it. */
export const SYSTEMS_TAG = "systems";

/**
 * One system in full, shared between every visitor for the length of one cache
 * window.
 *
 * THE THIRD READER THIS FILE'S HEADER PREDICTED, and it takes the cached door
 * rather than the correlated one on purpose. A case study is the same page for
 * everybody: nothing on it depends on who is asking, so nothing on it needs the
 * visitor's request id — and the rule at the top of this file says a value that
 * enters a cached scope may not carry one anyway. The web→api hop stays findable
 * through `healthLive`, which every page already makes for its meta bar.
 *
 * IT THROWS FOR healthCached's REASON, not for a new one. `use cache` stores
 * whatever the function returns, including a value meaning "no data", and the
 * only lever it offers for not storing something is not returning it. A failure
 * that landed in the cache would hold `— NO DATA` across the whole expire window
 * — five minutes of a page saying it has no numbers, minutes after the api came
 * back. So the failure leaves by the other door and the page renders the resting
 * state.
 *
 * `connection()` IS THE CALLER'S JOB, not this one's, and app/[lang]/work/[slug]
 * makes the call. Without it these values are rendered during `next build`,
 * which runs inside `docker build`, where no `api:8080` exists — every visitor
 * would then be served a shell baked with `— NO DATA` for the length of the
 * expire window. Same line, same reason, as `footerHealthNow` below.
 */
export async function systemCached(slug: string): Promise<SystemDetail> {
  "use cache";
  cacheLife("systems");
  cacheTag(SYSTEMS_TAG, `${SYSTEMS_TAG}:${slug}`);

  // The slug is a cache key, and that is the one thing that makes this call
  // different from healthCached: an argument is part of the key, so this is one
  // entry per system rather than one per visitor. With two systems that is two
  // entries; the shape stays right when there are twenty.
  const result = await apiGet("/api/systems/{slug}", { params: { slug } });
  if (result.kind !== "ok") {
    throw new Error(`system unavailable: ${slug} ${String(result.status)}`);
  }
  return result.data;
}

/**
 * One system, or the resting state. Never throws.
 *
 * The shape a page can render without a try/catch of its own, and the twin of
 * `footerHealthNow`: wait for a request, ask the shared cache, and show the
 * page's empty form rather than an error if there is no answer. The catch
 * swallows nothing that was not already recorded — lib/api/client.ts wrote the
 * status, the duration and the scrubbed error before it got here.
 */
export async function systemNow(slug: string): Promise<SystemDetail | null> {
  await connection();

  try {
    return await systemCached(slug);
  } catch {
    return null;
  }
}

/** The tag the training log is filed under. One name, so a reader can grep for it. */
export const TRAINING_TAG = "training";

/**
 * The training log, shared between every visitor for the length of one cache
 * window.
 *
 * THE FOURTH READER, AND THE FIRST WITH NO KEY. `systemCached` takes a slug and
 * is therefore one entry per system; this endpoint takes no parameter at all —
 * the contract gives `getTraining` nothing to get wrong — so there is exactly
 * one entry, and it is the same document for everybody who has ever loaded `/`.
 *
 * IT TAKES THE CACHED DOOR for `systemCached`'s reason, restated because this is
 * the page where it matters most: nothing in the training log depends on who is
 * asking. The visitor's request id may not enter a cached scope anyway (the rule
 * at the top of this file), and the web to api hop stays findable through
 * `healthLive`, which the same page makes for its terminal row.
 *
 * IT THROWS RATHER THAN RETURNING AN EMPTY LOG, which is the third time this
 * file makes the same argument and the first time it is about a whole section
 * of a page. `use cache` stores whatever comes back, including a value meaning
 * "no data" — and a stored failure here would leave twenty-two rows missing for
 * the length of the expire window, minutes after the api came back. The only
 * lever `use cache` offers for not storing something is not returning it.
 *
 * THE CONDITIONAL REQUEST IS NOT ON THIS PATH, and #245 is why that is worth a
 * line: `If-None-Match` is what `healthLive` uses to let the api answer `304`,
 * and it needs a validator held across calls. A cached reader has no calls to
 * hold one across — it makes one request per window and the window is what saves
 * the bytes. The ETag still earns its keep on the wire between a browser and
 * this container; it does not on the hop this function makes.
 */
export async function trainingCached(): Promise<Training> {
  "use cache";
  cacheLife("training");
  cacheTag(TRAINING_TAG);

  const result = await apiGet("/api/training");
  if (result.kind !== "ok") {
    throw new Error(`training unavailable: ${String(result.status)}`);
  }
  return result.data;
}

/**
 * The training log, or nothing. Never throws.
 *
 * The twin of `systemNow` and `footerHealthNow`: wait for a request, ask the
 * shared cache, and let the caller render its empty form rather than an error.
 *
 * `connection()` IS HERE AND NOT IN THE PAGE, unlike `systemCached`'s, because
 * this reader has exactly one caller and no second shape to serve. Without it
 * these rows are rendered during `next build`, which runs inside `docker build`,
 * where no `api:8080` exists — and every visitor would be served a shell baked
 * with an empty log for the length of the expire window.
 */
export async function trainingNow(): Promise<Training | null> {
  await connection();

  try {
    return await trainingCached();
  } catch {
    return null;
  }
}
