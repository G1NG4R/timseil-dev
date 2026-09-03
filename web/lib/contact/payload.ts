// The request body, built out of what the visitor typed and two things they did
// not.
//
// THE THREE FIELDS NOBODY TYPES ARE THE INTERESTING ONES. `company` is the
// honeypot: a real input, hidden by CSS, whose value is read back and sent as it
// was found — empty for every visitor and not empty for whatever filled it.
// `ts` is the idempotency key together with the address and a hash of the
// message, so a double click delivers once. `dwellMs` is how long the form has
// been on the screen.
//
// AND `dwellMs` IS WHY THIS FILE IS NOT INSIDE THE COMPONENT. ADR 0021 §2 says a
// submission under three seconds is answered with a `202` that leads nowhere —
// no row, no mail, a receipt that means nothing — and its own "Was das kostet"
// names the price: "Ein Mensch, der eine vorbereitete Nachricht einfügt und in
// 2,5 Sekunden abschickt, landet in einem schwarzen Loch mit einer wertlosen
// Quittung. […] Wenn das je auffällt, ist die Antwort nicht, die Regel zu
// lockern, sondern das Formular so zu bauen, dass es die Zeit ehrlich misst."
//
// So the form does not send early and hope. `remainingDwellMs` below is the
// whole of that decision: the page waits out the difference and then sends a
// request that can succeed, rather than one that is discarded in silence. The
// number is a pure function of two timestamps so that a test can hold it,
// instead of a `setTimeout` nobody can ask a question of.

import type { components } from "../api/schema";

import type { Draft } from "./validate.ts";

export type ContactRequest = components["schemas"]["ContactRequest"];
export type ContactAccepted = components["schemas"]["ContactAccepted"];

/**
 * The floor, from `contract/openapi.yaml` (`dwellMs.minimum`) and
 * `api/internal/contact/policy.go` (`minDwell`).
 *
 * Written here as a number and not derived from the generated types because
 * openapi-typescript emits `number` and drops the bound — the constraint is in
 * the document, not in the type. The unit test holds it against the contract
 * text so the copy cannot drift quietly.
 */
export const MIN_DWELL_MS = 3000;

/**
 * How much longer the form must stay on the screen before a send can succeed.
 *
 * `0` once the floor is cleared, and never negative. A clock that jumped
 * backwards produces a wait longer than the floor rather than a negative one,
 * which is the safe direction: the visitor waits, and nothing is discarded.
 */
export function remainingDwellMs(openedAt: number, now: number): number {
  const elapsed = now - openedAt;
  if (!Number.isFinite(elapsed)) return MIN_DWELL_MS;
  if (elapsed >= MIN_DWELL_MS) return 0;
  if (elapsed < 0) return MIN_DWELL_MS;
  return MIN_DWELL_MS - elapsed;
}

/**
 * The payload, with every field trimmed the way the api trims it.
 *
 * `dwellMs` is floored to a whole millisecond: `performance.now()` returns a
 * fraction, the column is an `integer`, and a value with a decimal point would
 * be refused three layers away by Postgres with a message nobody can act on.
 *
 * `ts` is the send moment and not the open moment. It is the idempotency key,
 * and two sends of the same text a minute apart are two messages — the key is a
 * double-click lock, not a deduplicator (ADR 0021 §10).
 *
 * `dwellMs` IS REPORTED AND NOT ROUNDED UP TO THE FLOOR. Clamping it to 3000
 * would make every early send look like a legal one and hand the api a number
 * the form invented — invariant 1, on the one field whose whole purpose is to
 * be true. Waiting is the caller's job, and `remainingDwellMs` is how it knows
 * how long.
 */
export function buildBody(
  draft: Draft,
  honeypot: string,
  dwellMs: number,
  at: Date,
): ContactRequest {
  return {
    name: draft.name.trim(),
    email: draft.email.trim(),
    message: draft.message.trim(),
    // READ BACK OFF THE FIELD, NOT HARDCODED TO "", and the difference is
    // whether the trap is a trap. A form that always sends the empty string
    // catches nothing: the only submitter it could ever have caught is one that
    // filled the hidden input, and that submission would arrive looking clean.
    // The value travels exactly as typed and is compared untrimmed on the other
    // side — validate.go: "a browser that sends a space to a hidden input is
    // doing something worth refusing".
    company: honeypot,
    dwellMs: Math.floor(dwellMs),
    ts: at.toISOString(),
  };
}
