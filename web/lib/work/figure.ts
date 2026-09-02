// The operating figure a work row carries, and the two states that carry none.
//
// THE SHEET ASKS FOR THREE FIGURES AND THE CONTRACT HAS ONE. Its design note is
// the page's headline idea — "jede Zeile trägt eine Betriebszahl, und welche,
// hängt vom Status ab — Uptime bei LIVE, letzter Commit bei BUILD, Spec-Zustand
// bei QUEUED". `System` carries `slug`, `systemNo`, `name`, `state`, `source`,
// `stack` and four metrics. There is no commit, no date, no spec state, and
// nothing anywhere else in the contract that could stand in for one.
//
// SO TWO OF THE THREE ARE NOT BUILT, and the sheet agrees with itself about
// that even while its note does not: both non-live rows it actually draws carry
// `— NO DATA`, not a commit and not a spec state. The note is an intention, and
// an intention is not a measurement.
//
// AND THE ANSWER IS NO CELL, NOT `— NO DATA`. The two say different things.
// `— NO DATA` means a measurement was attempted and did not arrive; nobody
// attempts the uptime of a system that is not running, and the contract says so
// in SQL rather than in prose — every metric field of a non-live system is
// `null` by construction, inside the lateral. ADR 0055 made this exact call
// about the hop latencies, and lib/home/systems.ts made it about `blurb`: a
// thing nobody will ever measure gets no cell at all.

import { type MetricValue, uptimeValue } from "../api/systems.ts";
import { finiteNumber } from "../api/values.ts";
import type { Messages } from "../i18n/messages/en.ts";
import type { StateWord } from "../state/words.ts";

/**
 * The window `uptime90d` covers, as the contract describes the field.
 *
 * NOT `OPS_WINDOW_CASE`, THOUGH BOTH ARE 91. That one is the window this site
 * *asks* the detail endpoint for — a member of the `window` enum, passed as an
 * argument, part of a cache key, and the case study labels its tile with
 * whatever came back rather than with what it sent. `/api/systems` takes no
 * parameter at all, so nothing comes back to read: the window here is a
 * property of the field, fixed by its description, and the two numbers are
 * equal today by agreement rather than by identity.
 *
 * The contract, verbatim: "The name says 90 for historical reasons; the window
 * is **91 days** (13 × 7) everywhere else in this contract and on the site."
 * That is invariant 7, and the reason it stays countable.
 */
export const UPTIME_WINDOW_DAYS = 91;

/**
 * The figure for one row, or nothing at all.
 *
 * `null` FOR EVERY STATE BUT `live`, including the state this page cannot read.
 * A system whose `state` did not map is one whose word this build does not
 * have — ADR 0035's overlapping start — and a page that cannot say what a
 * system IS has no business printing a number about how well it runs.
 *
 * `live` WITH NO NUMBER IS A DIFFERENT ANSWER AND KEEPS ITS CELL. The label
 * stands and the value is `null`, which the row draws as `— NO DATA`. That is
 * the true state of this site today: the snapshot loop has written nothing yet,
 * so the measurement was attempted and has not arrived. Collapsing the two into
 * one absence would lose exactly the distinction invariant 1 is about.
 */
export function workFigure(
  state: StateWord | null,
  metrics: unknown,
  messages: Messages,
): MetricValue | null {
  if (state !== "live") return null;

  const raw = (metrics ?? {}) as Record<string, unknown>;

  return {
    label: `${messages.uptime} · ${String(UPTIME_WINDOW_DAYS)} D`,
    value: uptimeValue(finiteNumber(raw.uptime90d)),
    unit: "%",
  };
}
