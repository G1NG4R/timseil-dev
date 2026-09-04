// The six states of the form, in the state language.
//
// SYS.06.01 of the Contact sheet draws six cards under the rule this file
// exists for: "Kein Zustand nur über Farbe: der Rahmen wechselt, das Wort
// wechselt, und im Fehlerfall stehen Code und Zeitpunkt da — wie in einem Log,
// nicht wie in einer Entschuldigung." Until H8b the page had the sentence and
// not the rule: `.cf-status[data-phase]` set `color` and nothing else, and the
// TX dot was `--acc` in every state including the failed one.
//
// THE VOCABULARY IS BORROWED, NOT COPIED. `Tone`, `Dot`, `Answer` and
// `DOT_ANSWER` come from lib/state/words.ts, so there are still four tones and
// four fills on this site and not eight. What is NOT borrowed is `MARKS`: those
// eight words are what this site says about a SYSTEM it delivers, and a form is
// not a system. Widening `StateKey` to hold `SENDING` would put a word in the
// footer's vocabulary that the footer can never be in.
//
// NOTHING FROM `next/*` AND NO JSX, for the reason words.ts gives: `npm test`
// reads lib/** only, and a table nothing recalculates is what invariant 1 is
// about.

import type { StateMark } from "../state/words.ts";

/**
 * The six, in the order the sheet draws them.
 *
 * `rest` and `composing` are the sheet's cards 01 and 02, which its own TX
 * badge collapses into one word — it prints `COMPOSING` for both. They are kept
 * apart here because the page can already tell them apart for free: `TxTrace`
 * takes `body: null` before the first keystroke and a request object after it,
 * which is exactly the line between "nothing typed" and "the clock is running".
 */
export type ContactStateKey =
  | "rest"
  | "composing"
  | "rejected"
  | "sending"
  | "accepted"
  | "failed";

/** The same shape the system states use, minus the dictionary key. */
export type ContactMark = Omit<StateMark, "messageKey">;

/**
 * NOT TRANSLATED, AND THAT IS LANG.01 RATHER THAN AN OMISSION. These six are
 * the badge on a panel that also prints `POST /api/contact`, `202` and a
 * `content-type` — the machine's voice, in the same set as `SYS.06`, `TX` and
 * `SEND →`, none of which is in the dictionary either. lib/state/lines.ts says
 * the same thing about a log line: "a translated status code would be
 * unsearchable, and searching is the only reason to print one."
 */
export const CONTACT_MARKS: Record<ContactStateKey, ContactMark> = {
  // Nothing typed. Not a loading state and not an error — the page is waiting,
  // and `dash` is the fill this site uses for "nothing has been measured here".
  rest: {
    label: "REST",
    tone: "dim",
    answer: "unmeasured",
    dot: "dash",
    pulse: false,
  },

  // The clock is running and nothing has been sent. IT SHARES ITS TONE AND ITS
  // FILL WITH REST, AND THAT IS THE DECISION — the same one ADR 0063 made for
  // `in_build` beside `queued`. Neither state has measured anything, so
  // DOT_ANSWER leaves exactly one fill available to both, and giving this one a
  // fifth tone would push tones and states towards the one-to-one
  // correspondence that the test below exists to refuse. What separates them is
  // the word, and a word is a whole feature: it survives greyscale, a palette
  // swap and a screen reader.
  composing: {
    label: "COMPOSING",
    tone: "dim",
    answer: "unmeasured",
    dot: "dash",
    pulse: false,
  },

  // A field is wrong: either this page said so before sending, or the api said
  // so with `invalidParams`. Both print the same sentence already, because the
  // same thing is true of both — nothing was stored and the fields say what to
  // fix.
  //
  // AMBER AND NOT ALERT, AND THE SHEET DRAWS RED. Its own rule one line above
  // the card is "EIN ALERT-MOMENT: DER FEHLSCHLAG", and the fields are already
  // red: `.field-input[aria-invalid="true"]` and `.field-error` have carried
  // `--alert` since G7. A red word over red fields spends the page's one alert
  // moment twice — which is issue #297's shape on another page — and it spends
  // it on the state where the visitor is being helped rather than told that
  // something broke. Nothing measured here either: this state is a refusal, not
  // an answer.
  rejected: {
    label: "REJECTED",
    tone: "amber",
    answer: "unmeasured",
    dot: "dash",
    pulse: false,
  },

  // In flight. NOT `solid`, however much a cyan disc would look right here:
  // solid is what this site draws around a value it has, and at this moment the
  // page is holding nothing but a deadline. The tone carries that it is live.
  sending: {
    label: "SENDING",
    tone: "acc",
    answer: "unmeasured",
    dot: "dash",
    pulse: false,
  },

  // A `202` with an id that names a row. This is the one state on this page
  // that HAS a measurement — the status and the round trip that produced it —
  // so it is the one that earns a measured fill.
  accepted: {
    label: "ACCEPTED",
    tone: "acc",
    answer: "measured-good",
    dot: "solid",
    pulse: true,
  },

  // The api answered with something else, or nothing answered at all. The one
  // alert moment of this page, and it never stands beside a red field: a `400`
  // that names fields is `rejected` above, not this.
  //
  // `barred` RATHER THAN `ring`: both are measured-bad, and the bar is the one
  // this site uses for "off" rather than "reduced". A send that did not happen
  // is not a degraded send.
  failed: {
    label: "FAILED",
    tone: "alert",
    answer: "measured-bad",
    dot: "barred",
    pulse: false,
  },
};

export const CONTACT_STATE_KEYS = Object.keys(CONTACT_MARKS) as ContactStateKey[];

/**
 * Which of the six the page is in.
 *
 * A DERIVATION AND NOT A SEVENTH PIECE OF STATE. `ContactForm` holds five
 * phases and the sheet draws six cards; the difference is not a state the
 * island has to keep, it is two facts it already has read together. Keeping a
 * `ContactStateKey` in `useState` beside `phase` would be two variables that
 * can disagree, and the day they did the badge would name a state the form was
 * not in — on the panel whose whole claim is that it shows what is happening.
 *
 * `typed` is "the dwell clock has started", which is the same thing `TxTrace`
 * already asks when it decides between a request and `waiting for input`.
 *
 * A `400` THAT NAMES FIELDS IS `rejected` AND NOT `failed`. The api sends
 * `validation-failed` for a rejected Origin too, with `invalidParams` empty and
 * deliberately so (ADR 0067 §5) — the two answers share a status code and are
 * not the same event. One is a visitor with a typo, the other is my deployment
 * being wrong, and only the second is this page's alert moment.
 */
export function contactState(input: {
  readonly phase: "rest" | "invalid" | "sending" | "accepted" | "failed";
  readonly typed: boolean;
  readonly invalidCount: number;
}): ContactStateKey {
  switch (input.phase) {
    case "sending":
      return "sending";
    case "accepted":
      return "accepted";
    case "invalid":
      return "rejected";
    case "failed":
      return input.invalidCount > 0 ? "rejected" : "failed";
    case "rest":
      return input.typed ? "composing" : "rest";
  }
}
