// The request, as text, so the page can show what it is about to send.
//
// THIS IS THE PAGE'S ARGUMENT AND NOT AN ORNAMENT. The system handbook, ch. 16:
// "Das ist der thematisch dichteste Moment der Seite: Sie erklärt, was sie tut,
// während sie es tut. Und es beantwortet die Frage 'wo geht das hin?' ohne ein
// Wort Erklärtext." A visitor can read the honeypot sitting empty, see that
// there is no third party in the address, and check that the message they typed
// is the message that leaves.
//
// SO IT IS BUILT FROM THE BODY THAT ACTUALLY GOES OUT, never from a second
// description of it. `buildBody` produces the object, `apiPost` serialises the
// same object, and this renders it. A trace assembled from the draft instead
// would be a drawing of a request rather than the request — and the first time
// the two disagreed, the page would be lying in the one place it is trying
// hardest to be honest.
//
// A PURE FUNCTION AND NOT MARKUP, for the reason lib/state/retry.ts gives: the
// byte count is a number in the UI, and a number in the UI that no test
// recalculates is what invariant 1 is about.

import { SITE_URL } from "../site.ts";

import type { ContactRequest } from "./payload.ts";

/** One line of the trace, and what it is, so the stylesheet can colour it
 *  without the component parsing text back apart. */
export interface TraceLine {
  readonly kind: "request" | "header" | "blank" | "body" | "note";
  readonly text: string;
  /** The note the sheet writes to the right of the honeypot. */
  readonly note?: string;
}

/** The host the request is addressed to, from the canonical origin rather than
 *  from anything the browser reports — one fact, one source. */
const HOST = new URL(SITE_URL).host;

/**
 * The request line, the two headers that matter, and the body.
 *
 * NO `HTTP/2`, AND THE SHEET DRAWS ONE. The trace is written BEFORE the request
 * leaves, and at that moment nothing on this page knows which protocol version
 * the connection will negotiate — it is decided by Traefik and the browser, and
 * a local build over plain HTTP would print `HTTP/2` and be wrong. A version
 * this page did not observe is an invented fact, and invariant 1 does not make
 * an exception for a detail that would look convincing.
 *
 * `content-type` IS SHOWN because it is not decoration either: the api compares
 * it strictly, and the Origin check is only enforceable because a cross-origin
 * `<form>` cannot send this value without a preflight (ADR 0021 §9).
 */
export function traceLines(body: ContactRequest): readonly TraceLine[] {
  return [
    { kind: "request", text: "POST /api/contact" },
    { kind: "header", text: `host: ${HOST}` },
    { kind: "header", text: "content-type: application/json" },
    { kind: "blank", text: "" },
    { kind: "body", text: "{" },
    { kind: "body", text: `  "name": ${JSON.stringify(body.name)},` },
    { kind: "body", text: `  "email": ${JSON.stringify(body.email)},` },
    { kind: "body", text: `  "message": ${JSON.stringify(body.message)},` },
    // The one line the visitor is meant to stop at. It is the whole anti-spam
    // argument in a field they can read and a bot cannot resist.
    { kind: "body", text: `  "company": ${JSON.stringify(body.company)},`, note: "honeypot, stays empty" },
    { kind: "body", text: `  "dwellMs": ${String(body.dwellMs)},` },
    { kind: "body", text: `  "ts": ${JSON.stringify(body.ts)}` },
    { kind: "body", text: "}" },
  ];
}

/**
 * How many bytes the body will be on the wire.
 *
 * THE BODY AND NOT THE TRACE. What travels is `JSON.stringify(body)` — no
 * indentation, no header lines, no comment about the honeypot — so counting the
 * rendered text would produce a number that is about the drawing rather than
 * about the request. `apiPost` serialises the same object the same way, which
 * is what makes this a measurement and not an estimate.
 *
 * Counted in bytes rather than characters, because that is what the wire and
 * the api's 64 KB limit count in.
 */
export function bodyBytes(body: ContactRequest): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}
