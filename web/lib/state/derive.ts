// What a state word may be derived from, and from what it may not.
//
// The contract carries four state vocabularies — `Health.status`,
// `SystemState`, `TrackState` and `DayState`. G6 mapped the first, when
// /api/health was the only document `web/` read, and wrote down the rule for
// the rest so that H1, H4, H5 and H6 would not each invent one:
//
//	a contract value is mapped in the phase that first reads its endpoint,
//	and the mapping lands in this file. A table for data nobody fetches is
//	a claim about an endpoint nobody has seen.
//
// H1 added `SystemState` with the case study's spec rail; H2b adds `DayState`
// with its operation grid. `TrackState` is the one still owed, and H4 owes it —
// the training log is the first page to read /api/training. When it lands, this
// file holds all four and the rule has cost nothing but four small functions in
// one place.

import type { DayState, StateWord } from "./words.ts";

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

/**
 * What a system's own record says it is — the value of `systems.state`.
 *
 * H1 is the phase that first reads `/api/systems/{slug}`, so by this file's rule
 * the mapping lands here rather than in the page.
 *
 * IT IS A DIFFERENT AXIS FROM `systemWord` ABOVE, and the two must not be
 * confused. That one reads a health document and says whether the api answered
 * well *now*; this one reads a row and says whether the system has been built at
 * all. A system can be `live` and momentarily degraded, and neither field knows
 * the other's answer.
 *
 * `in_build` HAS NO WORD YET, AND THAT IS DELIBERATE. The vocabulary in
 * lib/state/words.ts holds eight entries and none of them means "being built";
 * the label IN BUILD is drawn on the Work Index sheet, which INDEX.md assigns to
 * H6 — the phase where all three system states stand next to each other and a
 * ninth mark can be given a tone, a dot and a dictionary key with a sheet behind
 * each. Inventing one here would be a state nobody has seen, for a system that
 * does not exist: the seed holds one `live` and one `queued` row.
 *
 * `null` is therefore "this page has no word for that", and callers render it
 * the way components/FooterMeta.tsx already renders an unknown status — as
 * `— NO DATA` rather than as a guess.
 */
export function systemStateWord(state: unknown): Extract<StateWord, "live" | "queued"> | null {
  if (state === "live") return "live";
  if (state === "queued") return "queued";
  return null;
}

/**
 * What a single day of operation says about itself — the value of `days[].state`.
 *
 * THE FOURTH AND LAST VOCABULARY THIS FILE OWES. H2b is the phase that first
 * reads `days[]`, so by the rule at the top of this file the mapping lands here.
 * With it, all four of the contract's state enums are mapped in one place, and
 * the note about "the other three" at the top has been paid off.
 *
 * IT IS A VALIDATOR AND NOT A TRANSLATION, which is what makes it different from
 * the three functions above. Those turn a contract value into one of the seven
 * words in lib/state/words.ts; this one hands the value back. The reason is that
 * a day is not a state a system is in — `ok` means "nothing happened here", and
 * the vocabulary has no word for that. LIVE is what a system is; a Tuesday is
 * not live.
 *
 * The legend the sheet draws says so in its own words: NO INCIDENT · DEGRADED ·
 * OUTAGE · NO DATA. Only one of those four is a word from `MARKS`. Forcing the
 * rest through it would have given eighty-two cells of a fresh window the word
 * LIVE and the pulse that goes with it, so the legend got a table of its own —
 * `dayLabel` in words.ts, beside the vocabulary it is not part of.
 *
 * SO WHAT IT DOES IS REFUSE. Same shape as `healthStatus` and for the same
 * measured reason: the generated type describes the contract, ADR 0035's
 * overlapping start means the bytes can be a build older than it, and a value
 * this function does not know is `null` rather than a guess. A cell with no
 * state is drawn as unmeasured, never as a clean day — invariant 1, and
 * invariant 6 says the same thing about the same cell.
 */
export function dayState(value: unknown): DayState | null {
  return value === "ok" || value === "degraded" || value === "outage" || value === "nodata"
    ? value
    : null;
}
