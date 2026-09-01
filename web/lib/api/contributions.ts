// What the homepage reads off one `/api/contributions` answer.
//
// Separate from lib/api/readers.ts for the reason lib/api/systems.ts gives one
// file over: the readers import `next/cache`, so `node --test` cannot load
// them. Every judgement about what this answer means is therefore here, where a
// test can reach it, and the reader is left with nothing to decide.
//
// THE ANSWER IS A CALENDAR AND THE PICTURE IS A GRID, and the whole of this file
// is the step between them. GitHub hands back weeks that start on Sunday, the
// first and last of which may be short; the grid is seven rows deep and grows
// sideways. A week that carries three days has to land on the three rows its
// dates name, not on the first three — which is why the row comes from the DATE
// and never from a position in an array.
//
// EVERY FIELD IS READ DEFENSIVELY THOUGH THE TYPE IS GENERATED, for the reason
// lib/api/values.ts carries: the generated type describes the contract, not the
// bytes, and ADR 0035's overlapping start puts a real case behind the difference.

import { NO_DATA } from "../state/words.ts";

import type { GetBody } from "./client.ts";
import type { components } from "./schema";
import { finiteNumber, nonEmpty } from "./values.ts";

/** The calendar, as the contract answers it. */
export type Contributions = GetBody<"/api/contributions">;

/** The five steps, as the contract names them. `--l0`…`--l4` in tokens.css. */
export type ContributionLevel = components["schemas"]["ContributionLevel"];

const LEVELS: readonly string[] = ["l0", "l1", "l2", "l3", "l4"];

/** One day of the calendar, placed. */
export interface GraphCell {
  /** ISO date, as it arrived. The cell's accessible name is built from it. */
  date: string;
  /** How many contributions. `null` when the field did not arrive as a number. */
  count: number | null;
  /**
   * Which of the five steps, or nothing.
   *
   * `null` IS NOT `l0`, and that is the point of the union. `l0` says "this day
   * was measured and it was empty"; a level outside the contract's five says
   * "this arrived and we cannot read it", which is a different sentence and gets
   * the different shape — the dashed outline the operation grid already uses for
   * exactly that statement.
   */
  level: ContributionLevel | null;
  /** Which of the seven rows, 1–7, from the date's weekday. Sunday is row 1. */
  row: number;
  /** Whether this cell opens a column. Only these carry an explicit row in the markup. */
  startsWeek: boolean;
}

/** The calendar as a grid can draw it. Every number counted, none typed. */
export interface GraphView {
  /** Columns, which is weeks. 53 today; 52 in a year that lines up differently. */
  columns: number;
  /** Cells, in the order they are drawn. */
  cells: readonly GraphCell[];
  /** Days the calendar covers. `cells.length`, and the sheet's "365" is not it. */
  days: number;
  /** The total the api counted. Never recounted here — see `contributionsMeta`. */
  total: number | null;
  /** How old the calendar is, in seconds, or nothing. */
  ageSec: number | null;
  /** First and last date, for the one accessible name the graph carries. */
  from: string | null;
  to: string | null;
}

/** The empty graph. The shape a fallback and a failed read both render. */
const EMPTY: GraphView = {
  columns: 0,
  cells: [],
  days: 0,
  total: null,
  ageSec: null,
  from: null,
  to: null,
};

/**
 * Which of the seven rows a date belongs on, 1–7, with Sunday first.
 *
 * FROM THE DATE AND NOT FROM THE POSITION, which is the one thing this function
 * exists to insist on. A short week is short at one END, and which end depends
 * on whether it is the first week or the last: a calendar that starts on a
 * Wednesday hands back a first week of five days that belong on rows 4–7 plus
 * one, and placing them on rows 1–5 would slide the entire year up by three.
 * Today's answer starts on a Sunday, so nothing about it would catch this — the
 * test has to make the case up, and it does.
 *
 * `Date.UTC` and not the local zone: the dates are plain days, and a browser in
 * Auckland must not read the same string as the day before.
 */
function rowOf(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) return null;

  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(stamp)) return null;

  return new Date(stamp).getUTCDay() + 1;
}

/**
 * The calendar, placed on the grid.
 *
 * Reads whatever arrived: a missing `weeks`, a week that is not an array, a day
 * without a readable date. A day it cannot place is DROPPED rather than guessed
 * onto row 1 — one cell short of a picture is a smaller lie than one cell in the
 * wrong week, and `days` counts what was actually placed, so the caption stays
 * true to what is drawn.
 */
export function graphView(body: Contributions | null): GraphView {
  if (body === null) return EMPTY;

  const raw = body as unknown as Record<string, unknown>;
  const weeks = Array.isArray(raw.weeks) ? raw.weeks : [];

  const cells: GraphCell[] = [];
  let columns = 0;

  for (const week of weeks) {
    const days = Array.isArray((week as { days?: unknown } | null)?.days)
      ? ((week as { days: unknown[] }).days)
      : [];

    let opened = false;
    for (const day of days) {
      const entry = (day ?? {}) as Record<string, unknown>;
      const date = nonEmpty(entry.date);
      if (date === null) continue;

      const row = rowOf(date);
      if (row === null) continue;

      const level = typeof entry.level === "string" && LEVELS.includes(entry.level)
        ? (entry.level as ContributionLevel)
        : null;

      cells.push({ date, count: finiteNumber(entry.count), level, row, startsWeek: !opened });
      opened = true;
    }

    if (opened) columns += 1;
  }

  return {
    columns,
    cells,
    days: cells.length,
    total: finiteNumber(raw.totalContributions),
    ageSec: finiteNumber(raw.cacheAgeSec),
    from: cells.length === 0 ? null : cells[0].date,
    to: cells.length === 0 ? null : cells[cells.length - 1].date,
  };
}

/**
 * How old the calendar is, in the coarsest unit that still says something.
 *
 * `22M`, `6H`, `2D`. Rounded down, because "6H" for five and a half hours reads
 * as a promise the number has not made — and rounded up it would claim an age
 * the answer does not have.
 */
export function ageLabel(seconds: number): string {
  if (seconds < 60) return `${String(Math.max(0, Math.floor(seconds)))}S`;
  if (seconds < 3_600) return `${String(Math.floor(seconds / 60))}M`;
  if (seconds < 86_400) return `${String(Math.floor(seconds / 3_600))}H`;
  return `${String(Math.floor(seconds / 86_400))}D`;
}

/**
 * The line under the graph: how many, over how long, from where, how old.
 *
 * `652 CONTRIBUTIONS · LAST 367 DAYS · SOURCE: /api/contributions · 22M OLD`
 *
 * THE DAY COUNT IS COUNTED. The sheet writes "LAST 365 DAYS" and the answer
 * carries 367 — 53 weeks, the last of them short. 365 is a round number about a
 * year, and the picture above this line is neither round nor a year; invariant 7
 * asks that a number stay recountable, and this one is recounted from the cells
 * that were actually drawn.
 *
 * THE TOTAL IS NOT. It is the api's own count over the calendar it fetched, the
 * way `trainingMeta` takes its two numbers from the answer rather than walking
 * the tree — the line above the picture cannot disagree with the picture, and
 * two counts of one thing is how it starts.
 *
 * THE SOURCE IS THIS API AND NOT GITHUB, which is where the sheet says something
 * else. `SOURCE GITHUB API` names the upstream; SYS.01 and SYS.02 name the
 * endpoint a reader can open in a second tab, and that is the promise this whole
 * line makes. That GitHub is behind it is what UPLINK and CONTRIBUTIONS already
 * say.
 *
 * THE AGE IS AN ADDITION TO THE SHEET, which draws none. The answer is served
 * from a cache by design — the contract says so in `s-maxage=3600` and the
 * refresher holds an hour as stale (api/internal/contributions/policy.go) — so a
 * total without its age is a number whose evidence is a moment nobody names.
 * It is printed at EVERY age rather than past a threshold: the refresher ticks
 * every five minutes against an hour-old row, so a healthy calendar crosses any
 * hour-shaped line regularly, and a threshold picked to avoid that would be a
 * number invented here.
 *
 * The words are nomenclature and stay English, the call `trainingMeta` and
 * `systemsMeta` already make.
 */
export function contributionsMeta(view: GraphView): string {
  const parts: string[] = [];

  parts.push(view.total === null ? NO_DATA : `${String(view.total)} CONTRIBUTIONS`);
  parts.push(view.days === 0 ? NO_DATA : `LAST ${String(view.days)} DAYS`);
  parts.push("SOURCE: /api/contributions");
  if (view.ageSec !== null) parts.push(`${ageLabel(view.ageSec)} OLD`);

  return parts.join(" · ");
}

/**
 * The one name the graph carries, because it is one picture and not 367.
 *
 * components/case/OpsGrid gives every cell of the operation grid its own
 * accessible name, and at 91 cells that is a list somebody can listen to. At 367
 * it is not a list, it is a wall — and what a listener is owed here is the claim
 * the picture makes, which is the total over the span. So the cells are hidden
 * and the figure is a single `role="img"` with this name.
 */
export function graphLabel(view: GraphView): string {
  if (view.total === null || view.from === null || view.to === null) {
    return `Contribution calendar ${NO_DATA}`;
  }
  return `${String(view.total)} contributions over ${String(view.days)} days, ${view.from} to ${view.to}`;
}
