// What a case study reads off one `/api/systems/{slug}` answer.
//
// Separate from lib/api/readers.ts for the reason lib/http/url.ts gives and
// lib/api/health.ts repeats: the readers import `next/cache`, so `node --test`
// cannot load them. Every judgement about what a number means is therefore
// here, where a test can reach it, and the reader is left with nothing to
// decide.
//
// THE EMPTY ANSWER IS THE NORMAL ONE, and that is what makes this file worth
// its tests. api/internal/seed/seed.sql writes no measurements at all — "a
// measurement that a seed writes is an invented number" — so against a fresh
// database `timseil.dev` is `live` and every one of the five tiles reads
// `— NO DATA`. The full tile is the edge case here, not the empty one.
//
// EVERY FIELD IS READ DEFENSIVELY THOUGH THE TYPE IS GENERATED. lib/api/values.ts
// carries the two guards and the reason; the short version is that the generated
// type describes the contract and not the bytes, and ADR 0035's overlapping
// start puts a real case behind the difference.

import type { Messages } from "../i18n/messages/en.ts";
import { dayState, systemStateWord } from "../state/derive.ts";
import { NO_DATA, type DayState, type StateWord } from "../state/words.ts";

import type { GetBody } from "./client.ts";
// The generated declarations, by name and without an extension, as
// lib/api/client.ts explains. `Incident` is taken rather than written: the
// contract declares it, and CLAUDE.md's rule has no exception for a small
// object.
import type { components } from "./schema";
import { finiteNumber, nonEmpty, padTwo } from "./values.ts";

/** One system in full, as the contract answers it. */
export type SystemDetail = GetBody<"/api/systems/{slug}">;

/**
 * The two windows this site asks for, and they are asked for out loud.
 *
 * UNTIL H5b THERE WAS NO WINDOW ANYWHERE IN `web/`. The case study got 91 days
 * because 91 is the contract's default and the client could not have said
 * otherwise — lib/http/url.ts had no way to write a query at all. That worked
 * exactly as long as one window was the only one.
 *
 * SO THEY ARE PASSED, NOT DEFAULTED. `systemCached` takes the window as an
 * argument with no default, and both call sites name one of these. A default
 * would put 91 back where it was: true, invisible, and impossible to see going
 * wrong from the call site. It is also the cache key — an argument is part of a
 * `use cache` function's identity — so a window that never appears in a
 * signature is a window that never separates two entries.
 *
 * Both are members of the contract's `window` enum `[30, 91, 182]`; anything
 * else is a 400 rather than a quiet fallback, and the api says so in as many
 * words.
 */
export const OPS_WINDOW_CASE = 91;

/** The homepage strip. One row, thirty cells, no notches — see components/home/OpsStrip. */
export const OPS_WINDOW_HOME = 30;

/** Every system, as the contract answers the list. */
export type SystemList = GetBody<"/api/systems">;

/**
 * The half of a system both answers carry.
 *
 * `SystemDetail` is `allOf: [System, {window, generatedAt, days, incidents,
 * deploys}]` in the contract, so this is the supertype and not a second
 * transcription of it. Taking it from the generated declarations rather than
 * writing it out is the same rule CLAUDE.md states for `Incident`.
 */
export type System = components["schemas"]["System"];

/** How much of the window carries a measurement at all. */
export interface Coverage {
  /** Days with at least one check. */
  measured: number;
  /** Days the window covers. Read from the answer, never assumed. */
  window: number;
}

/** One tile, in the shape components/ui/MetricTile already takes. */
export interface MetricValue {
  label: string;
  /** `null` is the honest absence; MetricTile turns it into `— NO DATA`. */
  value: string | null;
  unit?: string;
  /** A second line under the value. Today only the uptime tile has one. */
  note?: string;
}

/** How the code can be reached — the axis that is not `state`. */
export type SourceView =
  | { access: "public"; url: string }
  | { access: "private"; reason: "nda" | "internal" }
  | null;

/**
 * How many days of the window were measured, and how many it holds.
 *
 * ISSUE #208 IS THIS FUNCTION. `uptime90d` reads 100 whether five of ninety-one
 * days were measured or all of them, and on this page the number stands without
 * the grid beside it — the grid is H2. docs/slo.md has said the same since F5:
 * "eine Prozentzahl über 91 Tage sagt nichts darüber, wie viele dieser Tage
 * gemessen sind."
 *
 * A day without a check carries `checks_total = 0`, is `nodata`, and contributes
 * to neither sum — invariant 6. Counting it as an outage would be the worse lie;
 * counting it at all is what this function does instead.
 *
 * THE WINDOW COMES FROM THE ANSWER. Invariant 7 wants 91 to stay countable, and
 * the contract sends it as `window`. A constant here would be a second source of
 * truth for a number the api already states, and it would keep reading 91 on the
 * day someone asks for `?window=30`.
 */
export function coverage(body: SystemDetail | null): Coverage {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  const days = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : [];

  let measured = 0;
  for (const day of days) {
    if (day.state !== "nodata") measured += 1;
  }

  // `days` is absent unless the system is live, and then the window it would
  // have covered is still the window the answer declares. Falling back to the
  // number of rows would print "0 of 0", which is not a statement about
  // anything.
  return { measured, window: finiteNumber(raw.window) ?? days.length };
}

/**
 * The five tiles, in the order Case Study 02 draws them.
 *
 * FIVE AND NOT THREE, and both sheets are H1's. The Case Study Template draws
 * three with bracketed placeholder numbers; Case Study 02 draws five, all
 * `— NO DATA`, under an amber note saying so on purpose. Three sources settle
 * it for the five: the register in `Intermediate Widths` sizes the row as
 * `5 × 1fr` with a 120px minimum per tile, `styles/layout.css` already carries
 * the 5 → 3 → 2 reflow, and `Consistency Check` K-29 records it. ADR 0052.
 *
 * THE LABEL COUNTS ITS OWN WINDOW rather than saying 91. Same reason as
 * `coverage`: the number has to stay the one the answer carries.
 *
 * THREE LABELS COME FROM THE DICTIONARY AND TWO DO NOT, by LANG.01's rule
 * "Übersetzt wird Prosa, nicht Nomenklatur": `P95` is in the sheet's list of
 * words that stay English, and `DEPLOY` is the name of the thing the pipeline
 * does. The other three are ordinary words over a number.
 *
 * `null` IS A BODY TOO, and it produces the same five labels with nothing under
 * them. A page whose api did not answer still has to draw the row — an absent
 * row would say the system has no metrics, when what happened is that nobody
 * could ask. The uptime label then carries no window: we asked about one and
 * were not told which, and `UPTIME · 91 D` there would be the first invented
 * number on a page built to argue against them.
 */
export function metricTiles(body: SystemDetail | null, messages: Messages): MetricValue[] {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  const metrics = raw.metrics as Record<string, unknown> | undefined;
  const cover = coverage(body);

  return [
    {
      label: cover.window === 0 ? messages.uptime : `${messages.uptime} · ${String(cover.window)} D`,
      value: uptimeValue(finiteNumber(metrics?.uptime90d)),
      unit: "%",
      // NO WINDOW MEANS NO NOTE, not a second em dash. When the api did not
      // answer, the tile already says `— NO DATA` where the number goes;
      // repeating it underneath would read as two separate absences and say
      // nothing about coverage, which is the one thing the line is for.
      ...(cover.window === 0 ? {} : { note: coverageNote(cover) }),
    },
    { label: "P95", value: p95Value(finiteNumber(metrics?.p95Ms)), unit: "MS" },
    { label: messages.csErrorRate, value: errorRateValue(finiteNumber(metrics?.errorRate)), unit: "%" },
    // PIPELINE, NOT DEPLOY, AND THAT IS ISSUE #242 ANSWERED HALFWAY. H1 shipped
    // this tile as `DEPLOY · MEDIAN` and left the meaning open; H2b was the
    // phase that had to decide, and the decision is that the field should
    // measure the deploy — from Dokploy accepting it to the new process coming
    // up. Until it does, the label says what the number IS: the whole pipeline
    // run, queue time included. Renaming the tile is one line and honest today;
    // redefining the field touches report-deploy.sh, deploy.sh, check-deployed's
    // tolerance and the contract, which is a different blast radius and its own
    // PR. ADR 0057.
    { label: "PIPELINE · MEDIAN", value: deployMedianValue(raw.deploys), unit: "S" },
    { label: messages.csIncidents, value: incidentCountValue(raw.incidents) },
  ];
}

/** `99.64`, or nothing. Two places, as the footer already prints it. */
export function uptimeValue(uptime: number | null): string | null {
  return uptime === null ? null : uptime.toFixed(2);
}

/**
 * `72.5`, or nothing.
 *
 * One decimal, because this value lives in the tens of milliseconds and moves
 * inside a single one: p95 rose from 24.25 to 72.5 over the phases that added
 * work to the request path, and a whole number would have shown that as a jump
 * between two integers rather than a movement.
 */
export function p95Value(p95: number | null): string | null {
  return p95 === null ? null : p95.toFixed(1);
}

/**
 * A share between 0 and 1, printed as a percentage.
 *
 * `0` MUST SURVIVE. It is the best number this site can print, and the tile
 * beside it exists to argue that a measured zero and a missing measurement are
 * different things. The check is against `null`, never falsiness.
 *
 * AND A RATE TOO SMALL TO PRINT IS NOT ZERO. `0.00004` rounds to `0.00` at two
 * places, and a page that printed that would be claiming a clean window it did
 * not measure. It reads `< 0.01` instead — the same distinction the empty tile
 * draws, one order down.
 */
export function errorRateValue(rate: number | null): string | null {
  if (rate === null) return null;

  const percent = rate * 100;
  if (percent > 0 && percent < 0.01) return "< 0.01";
  return percent.toFixed(2);
}

/**
 * The middle deploy duration, or nothing.
 *
 * THE LOWER MEDIAN, not the mean of the two middles. With an even count the
 * average of 42 and 43 is 42.5, which is a duration no deploy took — and this
 * page prints measurements, not summaries of them. The lower of the two is a
 * run that happened.
 *
 * WHAT THIS NUMBER MEANS IS OPEN, and the tile inherits the question rather than
 * settling it: issue #242 has `durationSec` measuring the pipeline run instead
 * of the deploy — 238, 270 and 263 seconds against a much shorter `deploy` job,
 * three times in a row. H1 prints what the api sends; H2 decides what it should
 * send. Naming it here is the alternative to the tile quietly asserting a
 * meaning.
 */
export function deployMedianValue(deploys: unknown): string | null {
  if (!Array.isArray(deploys)) return null;

  const seconds = deploys
    .map((entry) => finiteNumber((entry as Record<string, unknown>).durationSec))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (seconds.length === 0) return null;
  return String(seconds[Math.floor((seconds.length - 1) / 2)]);
}

/**
 * How many incidents the window holds.
 *
 * THE ONE TILE WHERE AN EMPTY ARRAY IS A NUMBER. `incidents: []` means the api
 * looked and found none, and `0` is the answer; `incidents` absent means it did
 * not look, because the contract sends the three operational arrays only for a
 * system in state `live` — and that is `— NO DATA`. Collapsing the two would
 * either invent a zero for a queued system or hide a clean window behind an
 * em dash.
 */
export function incidentCountValue(incidents: unknown): string | null {
  return Array.isArray(incidents) ? String(incidents.length) : null;
}

/**
 * The second line under the uptime figure.
 *
 * Plain English and a count, not a percentage of a percentage. "8 of 91 days
 * measured" is a sentence a reader can hold against the grid H2 puts under it;
 * "8.8 % coverage" is a second number to interpret.
 *
 * A window of zero is not a coverage of zero — it is not knowing what the
 * window was, which happens only when the api did not answer. It returns the
 * placeholder, and `metricTiles` drops the line entirely rather than stacking a
 * second `— NO DATA` under the first.
 */
export function coverageNote(cover: Coverage): string {
  if (cover.window === 0) return NO_DATA;
  return `${String(cover.measured)} of ${String(cover.window)} days measured`;
}

/**
 * The stack as the spec rail and the system row print it, or nothing.
 *
 * IT TAKES `System` AND NOT `SystemDetail` SINCE H5a, which is a widening rather
 * than a change: the body was already read through `Record<string, unknown>`, so
 * the list answer always worked and only the signature said otherwise. Copying
 * it for the list would have been the `finiteNumber` mistake of H4 a second
 * time — two copies of one small judgement are how the copies begin to disagree.
 */
export function stackLine(body: System | null): string | null {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  if (!Array.isArray(raw.stack)) return null;

  const names = raw.stack.map(nonEmpty).filter((name): name is string => name !== null);
  return names.length === 0 ? null : names.join(" · ");
}

/**
 * How the code can be reached, or nothing.
 *
 * The two arms are read separately rather than trusted from `access`, because
 * the contract's `oneOf` is a promise about the document and this is the value
 * that arrived: a `public` arm with no url would render a link to nowhere, and
 * `<> PRIVATE` with no reason is the excuse the schema was written to refuse.
 *
 * Widened to `System` in H5a for the reason `stackLine` above gives.
 */
export function sourceView(body: System | null): SourceView {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  const source = raw.source as Record<string, unknown> | undefined;

  const url = nonEmpty(source?.url);
  if (source?.access === "public" && url !== null) return { access: "public", url };

  if (source?.access === "private" && (source.reason === "nda" || source.reason === "internal")) {
    return { access: "private", reason: source.reason };
  }

  return null;
}

// ── .04 OPERATIONS ──────────────────────────────────────────────────────────
//
// H2b. Everything below reads the three arrays the contract sends only for a
// system in state `live`, and the header of this file applies to all of it: the
// empty answer is the normal one. On 31.08.2026 production answered 91 days of
// which 82 were `nodata`, and `incidents: []`.

/** One incident of the window, as the contract declares it. */
export type Incident = components["schemas"]["Incident"];

/** Seven. The rows the grid is drawn with, and the only place the number is written. */
const DAYS_PER_WEEK = 7;

/** One cell of the operation grid. One cell is one day. */
export interface OpsCell {
  /** The date as the answer sent it. Never parsed, never reformatted here. */
  readonly date: string;
  readonly state: DayState;
  /** Seconds of downtime, or nothing. `0` is a measurement and survives. */
  readonly downSec: number | null;
  /**
   * The incident this cell is a notch for, or nothing.
   *
   * RESOLVED AGAINST THE INCIDENT LIST, never copied from the day. A day can
   * carry an `incidentId` whose incident is not in `incidents[]` — the database
   * forbids it with ON DELETE RESTRICT (invariant 5), but this function reads
   * bytes and not the schema, and ADR 0035's overlapping start is the case where
   * the two differ. A notch that kept an unresolvable id would render a link
   * into nothing, which is the one thing invariant 5 exists to prevent.
   */
  readonly incidentId: string | null;
}

/** The grid, and the number of columns it fills. */
export interface OpsGrid {
  readonly cells: readonly OpsCell[];
  /**
   * Columns of seven. COUNTED, NEVER TYPED — invariant 7 wants 91 to stay
   * countable, and a caption reading "13 WEEKS" beside a grid of twelve is
   * exactly the drift the invariant is about. 91 ÷ 7 is 13; a window that is
   * not a multiple of seven rounds up, because a part-week is still a column.
   */
  readonly weeks: number;
}

/**
 * The incidents of the window, or nothing.
 *
 * `null` AND `[]` ARE DIFFERENT ANSWERS, the same way `incidentCountValue` above
 * already treats them: an empty array is the api saying it looked and found
 * none, and a missing array is a system that is not `live`, which was never
 * asked.
 *
 * INVARIANT 4 IS ENFORCED HERE AND NOT ONLY IN THE SCHEMA. "Ohne Post-Mortem
 * keine Kerbe": `cause`, `fix` and `postSlug` are NOT NULL in the table and
 * required in the contract, and an entry arriving without one of them is
 * therefore a body that is not the body the contract promised. It is dropped
 * rather than rendered with a blank line, because a red mark with no explanation
 * is the thing the invariant refuses — and dropping it here is what makes the
 * notch above unresolvable, so the cell stays an outage and stops being a link.
 */
export function incidentList(body: SystemDetail | null): readonly Incident[] | null {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  if (!Array.isArray(raw.incidents)) return null;

  return raw.incidents.filter((entry): entry is Incident => {
    const row = entry as Record<string, unknown>;
    return (
      nonEmpty(row.id) !== null &&
      nonEmpty(row.cause) !== null &&
      nonEmpty(row.fix) !== null &&
      nonEmpty(row.postSlug) !== null
    );
  });
}

/**
 * The 91 cells of the grid, in the order the answer sent them.
 *
 * THE ORDER IS THE API'S. `days` arrives oldest first and the grid is drawn
 * column by column, seven rows deep, which is what `grid-auto-flow: column` in
 * case.css does with a flat list. Sorting here would be this file deciding what
 * a week looks like; the contract already says the array covers `window` days.
 *
 * A CELL WITH NO STATE IS UNMEASURED, NOT CLEAN. `dayState` refuses anything it
 * does not know (invariant 1) and the fallback is `nodata` rather than `ok`
 * (invariant 6). Those are two different rules pointing the same way, and the
 * cell they produce is the dashed one.
 */
export function opsGrid(body: SystemDetail | null): OpsGrid {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  const days = Array.isArray(raw.days) ? (raw.days as Record<string, unknown>[]) : [];

  const known = new Set((incidentList(body) ?? []).map((incident) => incident.id));

  const cells = days.map((day): OpsCell => {
    const id = nonEmpty(day.incidentId);
    return {
      date: nonEmpty(day.d) ?? "",
      state: dayState(day.state) ?? "nodata",
      downSec: finiteNumber(day.downSec),
      incidentId: id !== null && known.has(id) ? id : null,
    };
  });

  return { cells, weeks: Math.ceil(cells.length / DAYS_PER_WEEK) };
}

/**
 * The day an incident started, or nothing.
 *
 * THE DATE PART OF THE TIMESTAMP AND NOTHING ELSE. `startedAt` is an RFC 3339
 * instant and the sheet writes `INC-001 · [DATE]`; the minute an outage began is
 * in the log, not in a heading. It is sliced rather than parsed for the reason
 * lib/clock.ts gives about `toISOString`: the string the api sent is already
 * UTC, and running it through a `Date` would hand the answer to whatever zone
 * the container happens to be in.
 *
 * A value that is not a timestamp is `null`, not a substring of a guess.
 */
export function incidentDate(startedAt: unknown): string | null {
  const value = nonEmpty(startedAt);
  if (value === null) return null;
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : null;
}

/**
 * How long an outage lasted, in the unit that is worth reading.
 *
 * MINUTES ABOVE A MINUTE, SECONDS BELOW IT. `2520 s` is the number the api
 * sends and `42 min` is the number a reader can hold; the grid's own tooltip in
 * the sheet writes it exactly that way. Under a minute the rounding would turn a
 * thirty-second blip into "1 min", which is a worse statement than the raw
 * number, so the small case keeps its unit.
 *
 * `0` SURVIVES, as it does in every other reader here: a degraded day with no
 * downtime is a measurement, and the check is against `null`.
 */
export function downtimeLabel(downSec: unknown): string | null {
  const seconds = finiteNumber(downSec);
  if (seconds === null || seconds < 0) return null;
  return seconds < 60 ? `${String(seconds)} s` : `${String(Math.round(seconds / 60))} min`;
}

// ── SYS.02 · SELECTED WORK ──────────────────────────────────────────────────
//
// H5a. The homepage's system list reads `/api/systems`, which is the same
// `System` object the case study already reads one of — so everything below
// either reuses a judgement from above or is new because a LIST has questions a
// single system does not: how many are there, and in what order do they stand.

/** One row of SYS.02, with every judgement already made. */
export interface SystemRowView {
  /** The identifier the route uses. Never rendered — it decides the link. */
  readonly slug: string;
  /** The two-digit display number, as the answer sends it. */
  readonly no: string;
  /** The system's name. `timseil.dev`, with the dot the slug does not carry. */
  readonly name: string;
  /**
   * The state word, or `null` when this page has none for it.
   *
   * ALL THREE OF THE CONTRACT'S VALUES MAP SINCE H6 — #289. `in_build` was the
   * `null` case for five phases and was not a bug: the vocabulary had no word
   * that meant "being built", and a row for such a system read `— NO DATA`,
   * which is the true statement "this page cannot say". The Work Index is the
   * page where all three states stand next to each other under a legend that
   * defines them, so the word could be given a tone, a dot and a dictionary key
   * with something behind each. lib/state/words.ts carries that argument.
   *
   * `null` HAS NOT GONE, it has got rarer. A value the contract does not
   * enumerate still lands here, because ADR 0035's overlapping start means the
   * wire can carry a vocabulary this build does not have.
   */
  readonly state: StateWord | null;
  /** The stack, joined, or nothing. */
  readonly stack: string | null;
  /** How the code can be reached. The axis that is not `state` — K-21. */
  readonly source: SourceView;
}

/**
 * The rows of SYS.02, in the order the answer sends them.
 *
 * THE ORDER IS THE API'S, and that is a decision rather than a default. `ListSystems`
 * ends with `ORDER BY s.system_no`, so the list arrives 01, 02, and the display
 * number a reader sees is the position they read it in. Sorting again here would
 * be a second opinion about an order that is already decided, and it would be
 * the opinion that goes stale — the same argument lib/home/sections.ts makes
 * about HOME.01 from the other direction.
 *
 * A ROW WITH NO SLUG IS DROPPED, not rendered with an empty link. That is the
 * only row this function refuses, and it refuses it because the slug is what
 * decides whether the row leads anywhere; a row that cannot answer that question
 * has nothing to draw.
 *
 * EVERY OTHER FIELD MAY BE ABSENT AND THE ROW SURVIVES. The file header says why
 * the reading is defensive though the type is generated, and ADR 0035's
 * overlapping start is the case behind it: for a few seconds after a deploy the
 * answer can come from the previous build.
 */
export function systemRows(body: SystemList | null): readonly SystemRowView[] {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  if (!Array.isArray(raw.systems)) return [];

  const rows: SystemRowView[] = [];

  for (const entry of raw.systems as unknown[]) {
    const system = (entry ?? {}) as Record<string, unknown>;

    const slug = nonEmpty(system.slug);
    if (slug === null) continue;

    rows.push({
      slug,
      // The number is the answer's, padded there and not here. A system whose
      // row lost it reads `--` rather than borrowing its position in the list:
      // the position is where it stands, the number is what it is called.
      no: nonEmpty(system.systemNo) ?? "--",
      // And the name falls back to the slug rather than to nothing. H4 found
      // this pair the other way round — the evidence line carries a slug where
      // the sheet draws a name — and a row with neither would be a link with no
      // text on it.
      name: nonEmpty(system.name) ?? slug,
      state: systemStateWord(system.state),
      stack: stackLine(system as System),
      source: sourceView(system as System),
    });
  }

  return rows;
}

/**
 * The line in the section head of SYS.02.
 *
 * `02 SYSTEMS` IS `rows.length`, NEVER A CONSTANT. The sheet writes the figure
 * into the head and the seed happens to hold two, which is exactly the
 * coincidence that makes a typed number survive being wrong. `trainingMeta`
 * settled the shape for SYS.01 one section up, and this is the same shape with
 * one count instead of two.
 *
 * IT NAMES ITS SOURCE, AND THE SHEET DOES NOT ASK IT TO. `02 SYSTEMS` is the
 * whole meta there; `SOURCE: /api/training` appears only in SYS.01's. Added
 * anyway, for the reason the sentence this section used to carry gave before it
 * was deleted — "this list is read from the API rather than written here" — and
 * HOME.01 makes it the rule one section further on: "jeder nennt seine Quelle".
 * A claim about where a number comes from is worth nothing if the reader cannot
 * see where to check it. Recorded as an addition to the sheet, not a reading.
 *
 * `null` IS THE FALLBACK'S BODY and it produces `— NO DATA SYSTEMS`, keeping the
 * source line. The head that is still waiting names what it is waiting for —
 * TrainingLog.tsx's arrangement, and the reason the head is inside the streamed
 * region at all.
 */
export function systemsMeta(body: SystemList | null): string {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;

  // THREE CASES AND NOT TWO. No body at all, a body with no readable list, and
  // a body with an empty one — and only the third is `00`. `00 SYSTEMS` is a
  // measurement: it says the api answered and there are none. An answer whose
  // `systems` is missing or is not an array did not say that, and printing a
  // zero for it would be invariant 1 in a section head.
  const count = Array.isArray(raw.systems) ? systemRows(body).length : null;

  const label = count === null ? NO_DATA : padTwo(count);
  const noun = count === 1 ? "SYSTEM" : "SYSTEMS";

  return `${label} ${noun} · SOURCE: /api/systems`;
}
