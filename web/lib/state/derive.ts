// What a state word may be derived from, and from what it may not.
//
// The contract carries four state vocabularies — `Health.status`,
// `SystemState`, `TrackState` and `DayState` — and `web/` reads exactly one
// document today: /api/health. So exactly one of them is mapped here.
//
// THE RULE FOR THE OTHER THREE, so H1, H4, H5 and H6 do not each invent one: a
// contract value is mapped in the phase that first reads its endpoint, and the
// mapping lands in this file. A table for data nobody fetches is a claim about
// an endpoint nobody has seen.

import type { StateWord } from "./words.ts";

/**
 * The status field of a health document, or nothing.
 *
 * READ AS A RECORD, THOUGH THE GENERATED TYPE PROMISES MORE. The reason is
 * lib/api/health.ts's and it is a measured one, not a style: during the
 * overlapping start (ADR 0035) the new web container talks to whichever api
 * container answers, and for a few seconds that can be the previous build. A
 * field the contract gained this week is then simply absent, and the type
 * checker is right about the contract and wrong about the bytes.
 *
 * Anything that is not one of the two words is `null`, not a guess. `"OK"` is
 * not `ok`, and `200` is not a status.
 */
export function healthStatus(status: unknown): "ok" | "degraded" | null {
  return status === "ok" || status === "degraded" ? status : null;
}

/**
 * What the meta bar says about the delivery of this page.
 *
 * ONLINE, not LIVE, and STATE.05 draws the line: "LIVE beschreibt ein einzelnes
 * System, ONLINE die Seite selbst." The bar sits on every page and is about the
 * page.
 *
 * `degraded` reaches the bar as DEGRADED rather than as ONLINE, which is the
 * whole point of this phase. Until G6 the bar had no third word, so a state the
 * api announces out loud was invisible in the interface — and OFFLINE stood in
 * the code for a case /api/health cannot produce. `null` is the honest value
 * for not knowing, and it renders `— NO DATA`.
 */
export function siteWord(status: unknown): Extract<StateWord, "online" | "degraded"> | null {
  const value = healthStatus(status);
  if (value === null) return null;
  return value === "ok" ? "online" : "degraded";
}

/**
 * What a row says about the api as a system.
 *
 * Same document, different subject, therefore a different word: on `/` the term
 * stands under a `<dt>api</dt>`, and a system that answers well is LIVE.
 *
 * OFFLINE IS NOT REACHABLE FROM HERE and that is not an omission. The contract
 * types this field `"ok" | "degraded"`; both mean "it answered". Reaching
 * OFFLINE would mean a `200` saying "I am off", which is not a sentence the
 * contract can form. The word exists for the systems H1 and H6 connect, which
 * are measured by a probe rather than by their own answer.
 */
export function systemWord(status: unknown): Extract<StateWord, "live" | "degraded"> | null {
  const value = healthStatus(status);
  if (value === null) return null;
  return value === "ok" ? "live" : "degraded";
}
