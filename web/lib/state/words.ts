// The state vocabulary: seven words, one meaning each, and the marks that make
// each of them readable without colour.
//
// This is STATE.05 of the design handoff turned into a table. Everything that
// renders a state — the meta bar, the menu strip, the panels, and from G7 the
// gallery — reads it from here, so a word cannot mean one thing in the footer
// and another on a case study.
//
// NOTHING FROM `next/*` AND NO JSX IN HERE. Node 24 strips TypeScript types but
// does not transform JSX, and `npm test` only reads lib/** and styles/**. Every
// branch therefore lives in this directory and every component above it is
// markup plus one call (ADR 0044, and ADR 0048 for this phase).

// The generated declarations, by name and without an extension, as
// lib/api/client.ts explains — `import type` is erased before Node sees a
// specifier, so nothing enters this file at runtime.
import type { components } from "../api/schema";
import type { Messages } from "../i18n/messages/en.ts";

/**
 * One day of the operation grid, as the contract enumerates it.
 *
 * TAKEN, NOT WRITTEN: CLAUDE.md's rule about the contract has no exception for a
 * four-word union. It lives beside the other vocabularies rather than in
 * derive.ts, so that this file owns every set of words and that one owns every
 * judgement about which of them a value is.
 */
export type DayState = components["schemas"]["DayState"];

/**
 * The seven words, with exactly one meaning each.
 *
 * The two pairs that get confused, both settled by the sheet:
 *
 *   LIVE vs ONLINE      LIVE describes a single system, ONLINE the delivery of
 *                       this page. The meta bar says ONLINE; a system row says
 *                       LIVE.
 *   ONLINE vs AVAILABLE AVAILABLE in the hero is about the operator ("open for
 *                       backend and infrastructure work"), ONLINE about the
 *                       site. Until STATE.05 both carried the same word, which
 *                       "ging genau so lange gut, bis jemand nachfragt".
 *
 * And the one that is not a state: QUEUED means planned and not yet built. It
 * carries `— NO DATA`, never DEGRADED — there nothing runs yet, here something
 * runs badly.
 */
export type StateWord =
  | "live"
  | "online"
  | "degraded"
  | "offline"
  | "empty"
  | "queued"
  | "available";

/**
 * `nodata` is in the table but not in the seven, and the distinction is the
 * point: it is not a state a system is in, it is what this page says when it
 * cannot tell. Invariant 1 lives in that sentence.
 */
export type StateKey = StateWord | "nodata";

/** The colour tokens a state may use. Names, not values — invariant 8. */
export type Tone = "acc" | "amber" | "alert" | "dim";

/**
 * How the dot is drawn. THIS IS THE FEATURE THAT IS NOT COLOUR.
 *
 * Four fills for the three classes of answer invariant 1 cares about, and the
 * handoff's MetricTile already speaks the same language one level up: it draws
 * a solid border around a measured tile and a dashed one around `— NO DATA`.
 *
 *   solid   measured, and good      a filled disc
 *   ring    measured, and reduced   a hollow ring
 *   barred  measured, and off       a hollow ring with a bar across it
 *   dash    not measured            not a circle at all — a short rule
 *
 * `dash` is deliberately the odd one out. At seven pixels a dotted or dashed
 * circle is mush, and "not measured" is the class this site cares about most;
 * it borrows the em dash that already opens `— NO DATA` instead of inventing a
 * shape.
 *
 * `null` is a word that never appears as a dot: EMPTY is a panel and AVAILABLE
 * is a sentence about a person.
 */
export type Dot = "solid" | "ring" | "barred" | "dash";

/** What kind of answer produced the state. The dot is a function of this. */
export type Answer = "measured-good" | "measured-bad" | "unmeasured";

export interface StateMark {
  /** The English word. Uppercased by the stylesheet, never in the string. */
  readonly label: string;
  /**
   * The dictionary key, or `null` for a word LANG.01 keeps English.
   *
   * Two sheets disagreed here and ADR 0048 settles it: the DATA VALUE is
   * nomenclature and never moves (`queued` stays `queued` in the api), the
   * LABEL is prose and gets translated — STATE.05 spells out that the German
   * display reads GEPLANT. ONLINE is the exception because LANG.01 names it in
   * the set that stays English: "SYS.INIT · ONLINE · BUILD · Go · Docker".
   */
  readonly messageKey: keyof Messages | null;
  readonly tone: Tone;
  readonly answer: Answer | null;
  readonly dot: Dot | null;
  /**
   * Whether the dot breathes.
   *
   * DECORATION, NEVER A DISTINGUISHING FEATURE. globals.css turns every
   * animation off under `prefers-reduced-motion: reduce`, so a pulse is not a
   * mark for some visitors — it is nothing at all. The test in words.test.ts
   * holds that line: `pulse` only where the fill is already `solid`.
   */
  readonly pulse: boolean;
}

/** What a cell says when there is nothing to say. The one definition. */
export const NO_DATA = "— NO DATA";

/**
 * Which fill belongs to which class of answer.
 *
 * Written as its own table so `words.test.ts` can hold MARKS against it. Nobody
 * gets to give an unmeasured state a solid dot: that would be a full grid where
 * an empty one is the honest picture, which is invariant 1 in a stylesheet.
 */
export const DOT_ANSWER: Record<Dot, Answer> = {
  solid: "measured-good",
  ring: "measured-bad",
  barred: "measured-bad",
  dash: "unmeasured",
};

export const MARKS: Record<StateKey, StateMark> = {
  // A system with a public address and a health check, answering well.
  live: {
    label: "LIVE",
    messageKey: "stateLive",
    tone: "acc",
    answer: "measured-good",
    dot: "solid",
    pulse: true,
  },

  // This page is being delivered. The dot in the meta bar of every page.
  online: {
    label: "ONLINE",
    messageKey: null,
    tone: "acc",
    answer: "measured-good",
    dot: "solid",
    pulse: true,
  },

  // It answered, and it said something is wrong. Not OFFLINE: a service that
  // reports its own state is not off.
  degraded: {
    label: "DEGRADED",
    messageKey: "stateDegraded",
    tone: "amber",
    answer: "measured-bad",
    dot: "ring",
    pulse: false,
  },

  // Measured, and down. /api/health cannot produce this word — its contract
  // knows only `ok` and `degraded` — so today it belongs to the systems H1 and
  // H6 connect, not to this site's own bar.
  offline: {
    label: "OFFLINE",
    messageKey: "stateOffline",
    tone: "alert",
    answer: "measured-bad",
    dot: "barred",
    pulse: false,
  },

  // A filter that matched nothing. A panel, not a cell, so no dot — and per the
  // sheet it owes a reason and a way back, never a grey rectangle.
  empty: {
    label: "EMPTY",
    messageKey: "stateEmpty",
    tone: "dim",
    answer: null,
    dot: null,
    pulse: false,
  },

  // Planned, not built. Carries `— NO DATA`, never a zero.
  queued: {
    label: "QUEUED",
    messageKey: "stateQueued",
    tone: "dim",
    answer: "unmeasured",
    dot: "dash",
    pulse: false,
  },

  // The operator, not the site. Hero only.
  available: {
    label: "AVAILABLE",
    messageKey: "stateAvailable",
    tone: "acc",
    answer: null,
    dot: null,
    pulse: false,
  },

  // Not a state. The absence of one.
  nodata: {
    label: NO_DATA,
    // No key, and for the reason design-correction #6 gave `[SOON]`: it is one
    // placeholder token across all three languages, not a word.
    messageKey: null,
    tone: "dim",
    answer: "unmeasured",
    dot: "dash",
    pulse: false,
  },
};

/** Every key of the table, in a fixed order — the gallery in G7 renders this. */
export const STATE_KEYS = Object.keys(MARKS) as StateKey[];

export function isStateKey(value: unknown): value is StateKey {
  return typeof value === "string" && Object.hasOwn(MARKS, value);
}

/**
 * The word to render, in the language the page resolved to.
 *
 * A component calls this and prints the result; it decides nothing itself. The
 * English value in the dictionary and `label` here are the same string on
 * purpose, and words.test.ts refuses them drifting apart — the same shape
 * messages.test.ts uses for the nav labels, and for the same reason.
 */
export function stateLabel(key: StateKey, messages: Messages): string {
  const mark = MARKS[key];
  return mark.messageKey === null ? mark.label : messages[mark.messageKey];
}

/**
 * The four words of the operation grid's legend.
 *
 * A SECOND TABLE, AND IT HAS TO BE. `MARKS` above is the state a *system* is in;
 * these are the four things a *day* can be, and only one word appears in both.
 * `degraded` means the same thing at both scales and is read from `MARKS` rather
 * than written again. The other three do not fit:
 *
 *   ok       the vocabulary has no word for "nothing happened here". LIVE is
 *            what a system is; a Tuesday is not live, and the sheet calls this
 *            NO INCIDENT.
 *   outage   OFFLINE is a state a system is IN. An outage is something that
 *            HAPPENED to it, and the day it happened on is over.
 *   nodata   the same absence as everywhere else, and the same token.
 *
 * lib/state/derive.ts carries the long form of the argument. This is where the
 * words it refused to invent actually live.
 *
 * IT IS HERE AND NOT IN A COMPONENT because it is the accessible name of
 * ninety-one cells. A label a screen reader reads is not decoration, and a
 * judgement with no test is the shape of every finding this repository has had.
 */
export function dayLabel(state: DayState, messages: Messages): string {
  if (state === "degraded") return stateLabel("degraded", messages);
  if (state === "outage") return messages.csOutage;
  if (state === "ok") return messages.csNoIncident;
  return NO_DATA;
}
