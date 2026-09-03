// What happened, written as a log, while it happens.
//
// The sheet's TX panel runs a list under the drawn request, and its demo script
// pushes six lines through a send. Three of them are not lines this page may
// write, and finding that out is most of what this file is:
//
//   "> spam checks … ok"        the check runs in the api. This page knows the
//                               honeypot and the dwell it measured; it does not
//                               know the verdict.
//   "> handing to provider …"   this page never sees a provider. It posts to
//                               /api/contact and Traefik takes it from there.
//   "kopie an dich unterwegs"   there is no confirmation mail — ADR 0067 §7.
//
// So every line below is either a measurement this page took or a fact it can
// point at. That is the same standard the trace already holds itself to, and it
// is the reason the trace prints no protocol version.
//
// THE DURATION IS THE LOAD-BEARING LINE. ADR 0021 §2 answers a honeypot and a
// short dwell with the same well-formed 202 a real send gets, so a status code
// cannot tell a delivered message from one that went nowhere. What can is how
// long the answer took: a discarded submission short-circuits before the
// database and SMTP and returns in milliseconds, a real one carries an SMTP
// round trip. The H8a acceptance had to measure that by hand to believe its own
// receipt. This puts it on the page.
//
// A PURE FUNCTION AND NOT MARKUP, for lib/state/lines.ts's reason: the numbers
// here are numbers in the UI, and a number in the UI that no test recalculates
// is what invariant 1 is about.

import { formatUtc } from "../clock.ts";
import { stripControl } from "../scrub.ts";
import { AUTHOR } from "../site.ts";

import type { ContactStateKey } from "./states.ts";

/**
 * One line, and which side of the conversation it is.
 *
 * `dir` RATHER THAN A PREFIX IN THE STRING, for the reason `.st-log`'s `> `
 * lives in a `::before`: a prompt belongs to the drawing, not to the sentence.
 * Keeping it out of the string keeps it out of the accessibility tree and out
 * of anything a visitor copies, puts it in one declaration instead of in every
 * producer — and here it does a third job, because the phone shows only the
 * answer and the stylesheet needs to be able to say which lines those are.
 */
export interface LogLine {
  readonly dir: "out" | "in" | "cont";
  readonly text: string;
}

export interface SessionInput {
  readonly state: ContactStateKey;
  /** How many fields this page or the api marked. */
  readonly invalidCount: number;
  /** Whether the honeypot travelled empty, which is what it is for. */
  readonly honeypotEmpty: boolean;
  /** The dwell that was reported, in the unit it was reported in. */
  readonly dwellMs: number | null;
  /** The status the api answered with, `0` for no answer, `null` for not yet. */
  readonly status: number | null;
  /** The api's own title for the problem, when there was one. */
  readonly statusText?: string | null;
  /** The round trip, measured either side of the call. */
  readonly durationMs: number | null;
  /** The id of the row the api made. */
  readonly receipt?: string | null;
  /** `Date.now()` when the answer came back. */
  readonly answeredAt?: number | null;
  /** A line from `waitLine()`, or nothing. */
  readonly retry?: string | null;
}

/**
 * The log of this one transmission.
 *
 * ONE SEND, NOT A SESSION. The sheet's script wipes its list at the top of
 * every `send()`, and there is no history of past transmissions anywhere in it
 * — no heading, no store, nothing that outlives the attempt. The only thing in
 * the sheet that gestures at kept entries is `3 EINTRÄGE LOKAL` in a footer
 * strip that ADR 0067 §7 already struck, and a third localStorage key is
 * exactly what invariant 9 does not have. So this returns the lines for the
 * state the form is in, and nothing accumulates.
 *
 * A LINE WITH NOTHING BEHIND IT IS DROPPED, never printed empty. `errorLines`
 * makes the same call about its third line, and the reason is the same one:
 * dropping it says "there is nothing to say here", printing it blank says "here
 * is a value" and then shows none.
 */
export function sessionLines(input: SessionInput): readonly LogLine[] {
  switch (input.state) {
    case "rest":
    case "composing":
      // Nothing has been attempted. The panel says `waiting for input` in its
      // body and that is the whole of it — a log with no entries yet is not a
      // state that needs describing.
      return [];

    case "rejected":
      return rejected(input);

    case "sending":
      return sent(input);

    case "accepted":
    case "failed":
      return [...sent(input), ...answered(input)];
  }
}

/**
 * The refusal, and it has two authors.
 *
 * With no status the page refused before spending a request — the whole point
 * of validating here at all, since a round trip would spend one of three
 * attempts in ten minutes to be told what this page already knew. With a status
 * the api refused, and then the request lines belong above it.
 */
function rejected(input: SessionInput): readonly LogLine[] {
  if (input.status !== null) return [...sent(input), ...answered(input)];

  const count = Math.max(0, Math.trunc(input.invalidCount));
  return [{ dir: "out", text: `validating … ${String(count)} invalid` }];
}

/** What left, and what this page had measured when it did. */
function sent(input: SessionInput): readonly LogLine[] {
  const lines: LogLine[] = [];

  // THE HONEYPOT AND THE DWELL ON ONE LINE, because they are the two things
  // ADR 0021 §2 discards a submission for, and this is the page saying it knows
  // that and has satisfied both. It does NOT say "spam checks ok": whether the
  // api agrees is the api's to answer, and it answers below.
  const dwell = input.dwellMs;
  const honeypot = input.honeypotEmpty ? "honeypot empty" : "honeypot filled";
  lines.push({
    dir: "out",
    text:
      dwell === null || !Number.isFinite(dwell)
        ? honeypot
        : // MILLISECONDS, AND THE SHEET WRITES SECONDS HERE AND MILLISECONDS
          // ten lines above in the body. One quantity in two units on one panel
          // is a reader doing arithmetic to check that they match. The body is
          // the request and cannot change, so this line moves.
          `${honeypot} · dwell ${String(Math.floor(dwell))}ms`,
  });

  lines.push({ dir: "out", text: "POST /api/contact" });

  return lines;
}

/** What came back. */
function answered(input: SessionInput): readonly LogLine[] {
  if (input.status === null) return [];

  const lines: LogLine[] = [{ dir: "in", text: statusPhrase(input) }];

  const at = timeOf(input.answeredAt);
  const receipt = clean(input.receipt ?? "");
  if (receipt !== "") {
    lines.push({ dir: "cont", text: at === null ? receipt : `${receipt} · ${at} UTC` });
  }

  const retry = clean(input.retry ?? "");
  if (retry !== "") lines.push({ dir: "cont", text: retry });

  // THE WAY OUT, ON EVERY FAILURE. The sheet asks for it twice — "immer mit
  // adresse als ausweg" — and it is the one line here that is not a
  // measurement: it is the address that was above the form before anything was
  // typed, repeated at the moment it becomes useful.
  if (input.state === "failed") lines.push({ dir: "cont", text: AUTHOR.email });

  return lines;
}

/**
 * `202 accepted · 1120ms`, or what is left when parts are missing.
 *
 * `accepted` IS THE CONTRACT'S WORD AND NOT A JUDGEMENT. It is the name of the
 * 202's schema and the reason phrase RFC 9110 gives that code, and it is
 * carefully not "delivered": ADR 0021 §1 has the handler try once and hand what
 * it could not send to a dispatcher, so the message may leave an hour later or
 * not at all. Every other status prints the api's own title, which is a string
 * this page received rather than one it chose.
 */
function statusPhrase(input: SessionInput): string {
  const status = input.status ?? 0;

  // 0 IS NOT A STATUS AND IS NOT PRINTED AS ONE. The deadline fired, the
  // connection never opened, or the visitor's network went away — the page
  // knows nothing came back and does not know why, and a `0` in a log reads
  // like a code somebody could look up.
  const head =
    status === 0
      ? "no answer"
      : `${String(status)} ${status === 202 ? "accepted" : clean(input.statusText ?? "")}`.trim();

  const ms = input.durationMs;
  if (ms === null || !Number.isFinite(ms) || ms < 0) return head;

  return `${head} · ${String(Math.round(ms))}ms`;
}

/** `14:22:07`, or nothing. Sliced out of an ISO string by `formatUtc`, so it is
 *  UTC by construction and cannot pick up the machine's zone. */
function timeOf(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return formatUtc(ms);
}

/** Control characters out, ends trimmed. `statusText` and `receipt` both come
 *  from an upstream answer, and a title carrying a newline would break one log
 *  line into two — the second of which would look like a line this page wrote. */
function clean(value: string): string {
  return stripControl(value).trim();
}
