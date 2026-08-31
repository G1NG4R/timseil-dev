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
import { dayState, type DayState } from "../state/derive.ts";
import { NO_DATA } from "../state/words.ts";

import type { GetBody } from "./client.ts";
// The generated declarations, by name and without an extension, as
// lib/api/client.ts explains. `Incident` is taken rather than written: the
// contract declares it, and CLAUDE.md's rule has no exception for a small
// object.
import type { components } from "./schema";
import { finiteNumber, nonEmpty } from "./values.ts";

/** One system in full, as the contract answers it. */
export type SystemDetail = GetBody<"/api/systems/{slug}">;

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
    { label: "DEPLOY · MEDIAN", value: deployMedianValue(raw.deploys), unit: "S" },
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

/** The stack as the spec rail prints it, or nothing. */
export function stackLine(body: SystemDetail | null): string | null {
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
 */
export function sourceView(body: SystemDetail | null): SourceView {
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
type Incident = components["schemas"]["Incident"];

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
