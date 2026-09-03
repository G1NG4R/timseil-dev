// The only island on `/contact`, and the first request a browser on this site
// makes.
//
// WHY `'use client'` AT ALL — and this is the one page where the question has a
// hard answer rather than a preference. Three of the six fields the contract
// requires cannot be produced by a server: `dwellMs` is how long the form has
// been on THIS visitor's screen, `ts` is the moment they pressed the button, and
// `company` is a value read back out of an input a bot may have filled. A page
// rendered on the server can guess all three, and a guessed `dwellMs` is exactly
// the invented number invariant 1 is about.
//
// AND THE POST GOES FROM THE BROWSER RATHER THAN THROUGH NEXT, which is the
// decision behind the island rather than a consequence of it. ADR 0021 §3 counts
// three sends per IP per ten minutes, and `middleware/clientip.go` only believes
// `X-Forwarded-For` from a trusted proxy. Posting to a Server Action and
// forwarding would put every message on this site behind the `web` container's
// single address: one bucket of three, shared by everyone. The rate limit is the
// design, and the island follows from it.
//
// WHAT A VISITOR WITHOUT JAVASCRIPT GETS, said plainly because it is a real
// gap: no form. `/about`'s rail was a radio group and cost nothing (ADR 0066),
// and that trick does not exist for a request that has to carry a duration and a
// clock reading. What they get instead is the address, in the lede, above this
// component and rendered on the server — the same mailbox, one step longer. The
// alternative was a Server Action fallback, which needs a decision at the trust
// boundary (ADR 0015) and would hand the whole site one bucket.
//
// VALIDATION HAPPENS ON SUBMIT, NEVER ON A KEYSTROKE. The sheet is explicit and
// Field's own header repeats it. A field that goes red while somebody is still
// typing their address is telling them they are wrong about something they have
// not finished saying.

"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TxTrace } from "@/components/contact/TxTrace";
import { apiPost } from "@/lib/api/post";
import { counterFor, FIELDS } from "@/lib/contact/fields";
import { buildBody, type ContactRequest, remainingDwellMs } from "@/lib/contact/payload";
import {
  firstInvalidField,
  type Draft,
  type InvalidParam,
  reasonFor,
  validateDraft,
} from "@/lib/contact/validate";

/**
 * The sentences this component may print, resolved on the server.
 *
 * PASSED IN RATHER THAN IMPORTED, and the reason is the bundle: importing
 * lib/i18n/messages/en.ts here would ship the whole dictionary — every page's
 * prose — to a visitor who came to send one message. ADR 0050 leaves 6 725
 * bytes for every island this site will ever have.
 */
export interface ContactCopy {
  emailHint: string;
  sending: string;
  accepted: string;
  invalid: string;
  refused: string;
  rateLimited: string;
  providerDown: string;
  noAnswer: string;
}

/**
 * Where the form is. Five, not the sheet's six: "focus" and "typing" are states
 * of a FIELD, and `Field` already draws both from its own props.
 *
 * `invalid` AND `failed` ARE BOTH REFUSALS AND THEY ARE NOT THE SAME EVENT. One
 * is this page refusing to send, the other is the api refusing what was sent.
 * They print the same sentence — nothing was stored either way, and the fields
 * carry the reasons — but they are reached differently and only one of them
 * spent a request. Collapsing them would mean either claiming the api answered
 * when it was never asked, or leaving the local refusal silent, which is what
 * this component did until it was driven with a bad address and the status line
 * said nothing.
 */
type Phase = "rest" | "invalid" | "sending" | "accepted" | "failed";

interface Failure {
  status: number;
  retryAfterSec: number | null;
}

const EMPTY: Draft = { name: "", email: "", message: "" };

/**
 * The two values the visitor does not type and the page cannot invent.
 *
 * IT IS STATE SET IN AN EVENT HANDLER, and never a clock read during render.
 * `performance.now()` in a render body makes the render non-idempotent: React
 * may run it twice and get two answers, and the trace on the right would then
 * show a number that depends on when the component happened to re-render rather
 * than on anything the visitor did. It is not an effect either — a mount effect
 * that sets state is the same clock reading with a hydration mismatch attached,
 * because the server renders this markup too and the server's clock is not this
 * one.
 *
 * SO THE CLOCK STARTS AT THE FIRST KEYSTROKE, not at first paint, and that is a
 * decision rather than a convenience. It measures LESS time than the form has
 * been on the screen, so it can only ever make the wait before sending longer —
 * the safe direction, since the unsafe one is a request the api discards in
 * silence. It is also the closer reading of what the floor is for: three
 * seconds of a page sitting in a background tab is not evidence of a person.
 *
 * AND `null` IS THE HONEST REST STATE. Before anything is typed there is no
 * dwell and no send moment, and that is exactly what the server-rendered copy
 * of this markup holds — the copy a visitor without JavaScript is left with.
 * The trace says it is waiting rather than drawing a request with a zeroed
 * clock.
 */
interface Clock {
  /** From the monotonic clock, so a system clock that steps does not move it. */
  readonly openedAt: number;
  /** How long the visitor had been writing at the last keystroke. */
  readonly dwellMs: number;
  /** What `ts` would be, as of the last keystroke. */
  readonly tsAt: number;
}

export function ContactForm({ copy }: { copy: ContactCopy }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [invalid, setInvalid] = useState<readonly InvalidParam[]>([]);
  const [phase, setPhase] = useState<Phase>("rest");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const [clock, setClock] = useState<Clock | null>(null);

  // THE BODY AS IT STANDS, built by the one function that builds the body that
  // is sent. TxTrace's own header says why it takes this rather than the draft:
  // a panel that assembled its own request would be drawing one and sending
  // another, on the panel that exists to prove it does not.
  //
  // The two derived numbers are AS OF THE LAST KEYSTROKE rather than as of now.
  // A live-ticking dwell would need an interval and a re-render a second to
  // show a number nobody is reading; what is sent is measured fresh at submit,
  // and that is the number that has to be exact.
  const preview: ContactRequest | null =
    clock === null ? null : buildBody(draft, honeypot, clock.dwellMs, new Date(clock.tsAt));

  // `at` IS READ BY THE HANDLER AND PASSED IN, rather than read here. A
  // function declared in a component body could be called during render for all
  // anything can prove, so the clock reading happens where it is unambiguously
  // an event — in the `onChange` below.
  function set(name: keyof Draft, value: string, at: number) {
    setDraft((current) => ({ ...current, [name]: value }));
    setClock((current) =>
      current === null
        ? { openedAt: at, dwellMs: 0, tsAt: Date.now() }
        : { ...current, dwellMs: Math.max(0, at - current.openedAt), tsAt: Date.now() },
    );
  }

  function focusFirst(entries: readonly InvalidParam[]) {
    const first = firstInvalidField(entries);
    if (first === null) return;
    document.getElementById(first)?.focus();
  }

  async function submit() {
    if (phase === "sending") return;

    const local = validateDraft(draft);
    if (local.length > 0) {
      // NOTHING IS SENT. A round trip here would spend one of three attempts in
      // ten minutes to be told what this page already knew.
      setInvalid(local);
      setFailure(null);
      setReceipt(null);
      setPhase("invalid");
      focusFirst(local);
      return;
    }

    setInvalid([]);
    setFailure(null);
    setPhase("sending");

    // THE WAIT THAT MAKES THE DWELL HONEST. ADR 0021 §2 answers anything under
    // three seconds with a `202` that leads nowhere — no row, no mail — and its
    // own "Was das kostet" names the person it costs: someone who pastes a
    // prepared message and sends in 2.5 seconds, who "landet in einem schwarzen
    // Loch mit einer wertlosen Quittung", and says the repair belongs here:
    // "das Formular so zu bauen, dass es die Zeit ehrlich misst". So the form
    // waits out the difference and then sends a request that can succeed,
    // rather than sending one that is discarded in silence.
    // `clock === null` means nothing has been typed, which local validation has
    // already refused — the message needs twenty characters. Starting the clock
    // here anyway means such a submission waits the whole floor rather than
    // being sent with a duration nobody measured.
    const openedAt = clock?.openedAt ?? performance.now();

    // A LOOP AND NOT ONE `setTimeout`, and the difference is one millisecond
    // that this form sent in production terms before an e2e run caught it.
    // `setTimeout(2957)` may wake at 2956.8; the reading is then 2999.7, which
    // floors to 2999, which is under the floor — and the api answers that with
    // ADR 0021 §2's receipt that leads nowhere. Waking early is a property of
    // timers, so the repair is to re-measure after waking rather than to trust
    // the sleep or to round the number up afterwards. Rounding it up would be
    // the invented number this whole file is arranged to avoid.
    //
    // It terminates because `performance.now()` is monotonic and every sleep is
    // at least a millisecond; the bound is there so that a clock that somehow
    // stopped produces a request rather than a page that never answers.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const wait = remainingDwellMs(openedAt, performance.now());
      if (wait <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    const spent = performance.now() - openedAt;
    const result = await apiPost("/api/contact", buildBody(draft, honeypot, spent, new Date()));

    if (result.kind === "ok") {
      // THE TEXT STAYS IN THE FIELD. The build plan and the handbook both say
      // so, and the handbook says why: "die ID ist der Beleg, den der Absender
      // zitieren kann, und der Text geht nicht verloren, wenn er ihn noch
      // braucht". Clearing a form is the convention; this is the exception, and
      // it is the sender's copy of what they sent.
      setReceipt(result.data.id);
      setPhase("accepted");
      return;
    }

    // A 400 is the only failure with fields attached, and the api lists them in
    // the order of this form (validate.go:53-55) so the focus needs no sorting.
    const params = result.status === 400 ? (result.problem?.invalidParams ?? []) : [];
    setInvalid(params);
    setFailure({ status: result.status, retryAfterSec: result.retryAfterSec });
    setPhase("failed");
    if (params.length > 0) focusFirst(params);
  }

  return (
    <div className="cf">
      <form className="cf-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}>
        {FIELDS.map((field) => (
          <Field
            autoComplete={field.autoComplete}
            counter={counterFor(field, draft[field.name]) ?? undefined}
            error={reasonFor(invalid, field.name)}
            hint={field.name === "email" ? copy.emailHint : undefined}
            key={field.name}
            label={field.label}
            multiline={field.multiline}
            name={field.name}
            onChange={(event) => {
              set(field.name, event.target.value, performance.now());
            }}
            // `readOnly` AND NOT `disabled` WHILE SENDING, and the sheet asked
            // for exactly this — "felder gesperrt, nicht ausgegraut". It is
            // also the difference between a working focus and a silent one: a
            // disabled input cannot be focused, so moving the cursor to the
            // first wrong field after a 400 did nothing at all. Found by
            // driving the form rather than by reading it.
            readOnly={phase === "sending"}
            rows={field.multiline ? 8 : undefined}
            value={draft[field.name]}
          />
        ))}

        {/* THE HONEYPOT. Hidden by CSS and never by `display: none` on the
            label — the sheet says so twice and the handbook explains it: a bot
            reads the stylesheet too, and a field it can tell is hidden is a
            field it will leave alone.

            `aria-hidden` AND `tabIndex={-1}` ARE THE ACCESSIBILITY HALF. Without
            them a screen reader walks into a field with no purpose, fills it in
            good faith, and is discarded as a bot — the one failure mode of this
            technique that harms a person rather than a script. Build plan,
            appendix B. */}
        <div className="cf-hp" aria-hidden="true">
          <label htmlFor="company">Company</label>
          <input
            autoComplete="off"
            id="company"
            name="company"
            onChange={(event) => {
              setHoneypot(event.target.value);
            }}
            tabIndex={-1}
            value={honeypot}
          />
        </div>

        <div className="cf-actions">
          <Button disabled={phase === "sending"} type="submit">
            SEND →
          </Button>
        </div>

        {/* THE ONE `aria-live` REGION, and everything that is not a field error
            goes through it. A status that only changes colour is a status a
            screen reader never hears, and `polite` rather than `assertive`
            because none of these interrupt anything the visitor is doing. */}
        <p className="cf-status" data-phase={phase} role="status" aria-live="polite">
          <StatusText
            copy={copy}
            failure={failure}
            invalidCount={invalid.length}
            phase={phase}
            receipt={receipt}
          />
        </p>
      </form>

      <TxTrace body={preview} state={phase} />
    </div>
  );
}

/**
 * What the status line says, and it never says "delivered".
 *
 * ADR 0021 §1: the handler tries once and hands anything it could not send to a
 * dispatcher, so a `202` is "accepted" and a `502` is a message that is stored
 * and may well go out ten minutes later. Both sentences are written to stay
 * true either way — which is the whole reason this page has a state per status
 * rather than a success and a failure.
 */
function StatusText({
  copy,
  failure,
  invalidCount,
  phase,
  receipt,
}: {
  copy: ContactCopy;
  failure: Failure | null;
  invalidCount: number;
  phase: Phase;
  receipt: string | null;
}) {
  if (phase === "sending") return <>{copy.sending}</>;

  if (phase === "accepted") {
    return (
      <>
        {copy.accepted} <span className="cf-receipt">{receipt}</span>
      </>
    );
  }

  // Refused here, nothing sent. The same sentence a 400 gets, because the same
  // thing is true of both: nothing was stored, and the fields say what to fix.
  if (phase === "invalid") return <>{copy.invalid}</>;

  if (phase !== "failed" || failure === null) return null;

  if (failure.status === 400) {
    // A 400 HAS TWO MEANINGS AND ONLY ONE OF THEM IS ABOUT A FIELD. The api
    // sends `validation-failed` for a rejected Origin too, with `invalidParams`
    // empty — deliberately, since an Origin is not a field. Printing "the
    // fields below say what to change" there would send a visitor hunting for a
    // mistake that is not theirs and that no field is marked with.
    return <>{invalidCount > 0 ? copy.invalid : copy.refused}</>;
  }

  if (failure.status === 429) {
    // THE WAIT IS THE API'S NUMBER OR THERE IS NO NUMBER. ADR 0021 §3 derives it
    // from `min(received_at)` precisely so it is measured; printing a flat ten
    // minutes would be wrong for everybody who wrote nine minutes ago, which is
    // most of the people who see this.
    const wait = failure.retryAfterSec;
    return (
      <>
        {copy.rateLimited}
        {wait === null ? null : <> Try again in {Math.ceil(wait / 60)} min.</>}
      </>
    );
  }

  if (failure.status === 502) return <>{copy.providerDown}</>;

  // 0 is no answer at all, and anything else is a status this page was not told
  // about. Both get the sentence that admits it, because guessing between "it
  // arrived" and "it did not" is the one thing this page must not do.
  return <>{copy.noAnswer}</>;
}
