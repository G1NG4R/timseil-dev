// The two panels that speak in lines: LOADING and ERROR.
//
// STATE.05: "FEHLER SIND LOGS: Code, Zeitpunkt, Retry-Zähler. Keine
// Entschuldigungen, keine Illustrationen, kein 'Oops'." And for the other one:
// "Kein Spinner. Die Seite sagt, was sie holt und woher."
//
// THESE LINES ARE NOT TRANSLATED, and it is the same rule messages/en.ts
// follows for `SYS.INIT` and `BUILD`: a log line is the machine's voice, not
// prose addressed to a reader. A translated status code would be unsearchable,
// and searching is the only reason to print one.
//
// THE `>` PROMPT IS NOT IN THESE STRINGS. styles/state.css draws it with a
// `::before`, which keeps it out of the accessibility tree (a screen reader
// should read the line, not the decoration) and out of anything a visitor
// copies — and puts it in one declaration instead of in every producer.

import { stripControl } from "../scrub.ts";

import { NO_DATA } from "./words.ts";

/** `14:02` out of an ISO timestamp, or nothing.
 *
 *  Sliced rather than parsed with `Date`, for lib/clock.ts's reason: the slice
 *  is UTC by definition and cannot pick up the machine's zone. A value that is
 *  not an ISO timestamp yields `null` and the caller drops the line — an
 *  unreadable timestamp is not a time, and printing it half-formatted would put
 *  a number on screen that nothing measured. */
export function utcHm(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}):\d{2}/.exec(iso);
  return match === null ? null : match[1];
}

export interface ErrorInput {
  /** Which system did not answer. `ops-api`, `github`, whatever asked. */
  readonly source: string;
  /**
   * The HTTP status.
   *
   * THE SAME THREE STATES `digest` HAS, and for once the middle one is the
   * common case rather than the edge:
   *
   *   `undefined`  nobody measured it. `— NO DATA`.
   *   `null`       nothing answered at all — a refused connection, a timeout.
   *   a number     what came back.
   *
   * The distinction was bought by H13. An error boundary is a client component
   * and cannot see the response it is part of, so the honest reading comes from
   * `PerformanceNavigationTiming.responseStatus` — and a browser that does not
   * serve one leaves this `undefined` rather than letting the page claim the
   * 500 it would like to have had.
   */
  readonly status?: number | null;
  /** The reason phrase, if there was one. */
  readonly statusText?: string | null;
  /** When the last usable measurement was taken, as an ISO timestamp. */
  readonly lastGoodAt?: string | null;
  /** A line from retryLine(), or nothing. This page may not retry at all. */
  readonly retry?: string | null;
  /**
   * The framework's hash of the error, for the panels that have one.
   *
   * THREE STATES, NOT TWO, and the difference is the whole reason this is not a
   * plain `string`:
   *
   *   `undefined`  this panel has no such concept — an upstream that answered
   *                503 was never given a digest, and a line saying so would be
   *                noise. No line.
   *   `null`       there IS one and it is missing. `— NO DATA`, because a page
   *                that owes an identifier and has none must say so rather than
   *                stay quiet about it.
   *   a string     the identifier itself.
   *
   * Invariant 1 is the distinction between the middle row and the top one.
   */
  readonly digest?: string | null;
}

/**
 * The error panel's lines, in the order the sheet draws them.
 *
 * TWO LINES ALWAYS, THE THIRD ONLY IF IT IS TRUE. The retry line is dropped when
 * there is nothing to retry, because a counter over a page that never tries
 * again is an invented number in a monospace font.
 *
 * The second line is NOT dropped when there is no timestamp — it says
 * `— NO DATA`, the same word every other empty value on this site uses. Leaving
 * it out would hide the more useful half of the answer: that the panel has no
 * older measurement to fall back on either. The sheet's own annotation is about
 * the opposite case and says why the line earns its place at all: "die zahlen
 * unten sind 20 minuten alt. das ist der ehrlichere zustand als keine zahlen."
 */
export function errorLines(input: ErrorInput): string[] {
  const source = clean(input.source) || "upstream";
  const lines = [`${source}: ${statusPhrase(input.status, input.statusText)}`];

  const at = utcHm(input.lastGoodAt);
  lines.push(at === null ? `last good measurement: ${NO_DATA}` : `last good measurement: ${at} UTC`);

  const retry = clean(input.retry ?? "");
  if (retry !== "") lines.push(retry);

  // Last, because it is the line you copy rather than the line you read. See
  // ErrorInput.digest for why `undefined` and `null` part ways here.
  if (input.digest !== undefined) {
    const digest = clean(input.digest ?? "");
    lines.push(`digest: ${digest === "" ? NO_DATA : digest}`);
  }

  return lines;
}

/**
 * The lines a skeleton shows while it waits.
 *
 * Two sentences, and the second one is the load-bearing half: naming the address
 * turns a wait into a statement a reader can check. A spinner says only that
 * something is happening.
 */
export function loadingLines(what: string, source: string): string[] {
  return [`fetching ${clean(what)}`, `source: ${clean(source)}`];
}

/** `503 service unavailable`, or what is left when parts are missing. */
function statusPhrase(status: number | null | undefined, statusText?: string | null): string {
  const text = clean(statusText ?? "").toLowerCase();

  // Nobody looked. Distinct from the line below, and the distinction is the
  // point: `no answer` is a measurement, `— NO DATA` is the absence of one.
  if (status === undefined) {
    return text === "" ? NO_DATA : `${NO_DATA} (${text})`;
  }

  // Nothing answered. Not a code, and not an invented one either — `no answer`
  // is what a refused connection or a timeout actually was.
  if (status === null || !Number.isInteger(status)) {
    return text === "" ? "no answer" : `no answer (${text})`;
  }

  return text === "" ? String(status) : `${String(status)} ${text}`;
}

/**
 * Control characters out, ends trimmed.
 *
 * These strings come from an upstream answer, and lib/scrub.ts says why that
 * matters even here: a reason phrase carrying a newline would break one log line
 * into two, and the second would look like a line this site wrote.
 */
function clean(value: string): string {
  return stripControl(value).trim();
}
