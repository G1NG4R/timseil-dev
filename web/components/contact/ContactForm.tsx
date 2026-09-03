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

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TxTrace } from "@/components/contact/TxTrace";
import { apiPost } from "@/lib/api/post";
import { secondServerSnapshot, secondSnapshot, subscribeClock } from "@/lib/clock";
import { counterFor, FIELDS } from "@/lib/contact/fields";
import { sessionLines } from "@/lib/contact/log";
import { buildBody, type ContactRequest, remainingDwellMs } from "@/lib/contact/payload";
import { contactState } from "@/lib/contact/states";
import { waitLine } from "@/lib/state/retry";
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
  unexpected: string;
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

/**
 * What came back, and how long it took to come back.
 *
 * THE DURATION IS NOT DECORATION AND IT IS THE REASON THIS RECORD REPLACED A
 * BARE STATUS. ADR 0021 §2 answers a filled honeypot and a short dwell with the
 * same well-formed 202 a real send gets — no row, no mail, a receipt that names
 * nothing. From outside, the status cannot tell the two apart. What can is the
 * round trip: a discarded submission short-circuits before the database and the
 * relay and returns in milliseconds, a real one carries an SMTP exchange. The
 * H8a acceptance had to measure this by hand to believe its own 202, and it
 * stood in no instruction afterwards.
 *
 * `status: 0` IS "NOBODY WAS THERE" and not a code — the same value `apiPost`
 * reports for a deadline, a refused connection and a visitor who left.
 */
interface Answer {
  readonly status: number;
  /** The api's own title for the problem, or `null` for a 202 and for silence. */
  readonly statusText: string | null;
  readonly durationMs: number;
  /** `Date.now()` when it arrived, for the second printed beside the receipt. */
  readonly answeredAt: number;
  readonly retryAfterSec: number | null;
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
  const [answer, setAnswer] = useState<Answer | null>(null);
  // When the api's measured `Retry-After` runs out, as wall-clock milliseconds.
  // `null` whenever nothing is being waited out, which is almost always.
  const [freeAt, setFreeAt] = useState<number | null>(null);
  // THE DWELL THAT ACTUALLY LEFT, which is not the one the trace draws. The
  // request body above is the state of the last keystroke — ADR 0067 says so and
  // means it, because a live-ticking preview would re-render once a second for a
  // number nobody reads. What is SENT is measured fresh at submit, after the
  // floor has been waited out, and the log is a record of the departure rather
  // than of the draft. Driving the form with three fields filled in seven
  // milliseconds is what showed the difference: the panel logged `dwell 7ms`
  // for a request that carried 3000.
  const [sentDwellMs, setSentDwellMs] = useState<number | null>(null);
  // THE REQUEST THAT ACTUALLY LEFT, drawn from the moment it leaves.
  //
  // The panel's whole claim is that it is the request — not a drawing of one —
  // and until the log stood underneath it, the one field where that was untrue
  // could not be seen. `dwellMs` in the preview is the state of the last
  // keystroke by design (ADR 0067: a live-ticking number would cost a re-render
  // a second for something nobody reads), but the value that travels is
  // measured fresh after the floor has been waited out. On screen those were
  // `"dwellMs": 6` in the body and `dwell 7255ms` in the log, two lines apart,
  // both about the same field.
  //
  // So the drawing switches to the sent body when there is one. Everything on
  // the screen after a send — the sentence, the receipt, the log and now the
  // body — describes that send, until the next one starts and clears this.
  const [sentBody, setSentBody] = useState<ContactRequest | null>(null);

  const [clock, setClock] = useState<Clock | null>(null);

  // THE SECOND HAND THIS PAGE ALREADY HAS. lib/clock.ts keeps one interval for
  // however many clocks are on the screen, refcounted, and the header's has
  // been subscribed on every page since G3 — so joining it costs a listener and
  // not a timer. A second `setInterval` here would tick out of phase with the
  // one in the header, and on a slow frame the two would show different
  // seconds.
  //
  // THE CLOCK IS READ IN THE SNAPSHOT AND NOT HERE. A `Date.now()` in this
  // render body would make the render non-idempotent — React may run it twice
  // and get two answers — which is the same rule that keeps `performance.now()`
  // out of it thirty lines above, and `react-hooks/purity` refuses it outright.
  // `secondServerSnapshot()` is zero by construction, so the server pass and
  // the hydration pass count nothing down.
  const second = useSyncExternalStore(subscribeClock, secondSnapshot, secondServerSnapshot);

  // WHOLE SECONDS, ROUNDED UP, so the last one is a second the visitor actually
  // waits. Rounding down would free the button while the api would still refuse
  // it, which is a countdown that lies at exactly the moment it matters.
  const waitSec =
    freeAt === null || second === 0 ? 0 : Math.max(0, Math.ceil((freeAt - second * 1000) / 1000));
  const waiting = waitSec > 0;

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

  // WHICH OF THE SHEET'S SIX THE PAGE IS IN, derived rather than stored. The
  // island holds five phases; the sixth is the line between "nothing typed" and
  // "the clock is running", which `preview` already draws. Keeping a sixth
  // value in state beside `phase` would be two variables free to disagree, and
  // the day they did the badge would name a state the form was not in.
  const state = contactState({
    phase,
    typed: preview !== null,
    invalidCount: invalid.length,
  });

  // THE COUNTDOWN IS THE LINE, so it is recomputed on the tick rather than
  // frozen when the answer arrived. `waitLine` refuses a wait that has run out
  // and the log then drops the line, which is the same second the button comes
  // back — one fact, drawn twice, and it cannot come apart.
  //
  // AND THERE IS NO `n/3` BESIDE IT, which is a measurement rather than a
  // preference: two limiters answer this route with a 429 and both write it
  // through `httpx.WriteRateLimitProblem`, so the documents carry the same type
  // and the same title. A counter here would be naming which of the two refused
  // the request, and this page cannot see that. lib/state/retry.ts carries the
  // argument at length.
  const retry = waiting ? waitLine(waitSec) : null;

  const log = sessionLines({
    state,
    invalidCount: invalid.length,
    honeypotEmpty: honeypot === "",
    dwellMs: sentDwellMs,
    status: answer?.status ?? null,
    statusText: answer?.statusText ?? null,
    durationMs: answer?.durationMs ?? null,
    receipt,
    answeredAt: answer?.answeredAt ?? null,
    retry,
  });

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
    // The api would refuse it anyway, and spending the request would only move
    // the wait it reports without shortening it.
    if (waiting) return;

    const local = validateDraft(draft);
    if (local.length > 0) {
      // NOTHING IS SENT. A round trip here would spend one of three attempts in
      // ten minutes to be told what this page already knew.
      setInvalid(local);
      setAnswer(null);
      setReceipt(null);
      // Back to the draft. This branch spends no request, so what the panel
      // should be drawing is the one the visitor is being asked to fix — not
      // whatever last went out.
      setSentBody(null);
      setSentDwellMs(null);
      setPhase("invalid");
      focusFirst(local);
      return;
    }

    setInvalid([]);
    setAnswer(null);
    setSentDwellMs(null);
    setSentBody(null);
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
    // The log may name it from here on: it is the number in the body that is
    // about to go, not the one the preview was holding.
    setSentDwellMs(Math.floor(spent));

    // MEASURED HERE AND NOT IN `apiPost`, deliberately. The round trip is a
    // fact of this page — it is what the panel prints — and `apiPost` is the
    // module every later browser caller on this site inherits. Giving the
    // shared transport a stopwatch because one page wanted a number is how a
    // transport grows a reporting concern.
    //
    // The monotonic clock rather than `Date.now()`: a system clock corrected
    // mid-request would otherwise produce a negative duration, and the log
    // would print it.
    const departedAt = performance.now();
    const body = buildBody(draft, honeypot, spent, new Date());
    setSentBody(body);
    const result = await apiPost("/api/contact", body);
    const durationMs = performance.now() - departedAt;
    const answeredAt = Date.now();

    if (result.kind === "ok") {
      // THE TEXT STAYS IN THE FIELD. The build plan and the handbook both say
      // so, and the handbook says why: "die ID ist der Beleg, den der Absender
      // zitieren kann, und der Text geht nicht verloren, wenn er ihn noch
      // braucht". Clearing a form is the convention; this is the exception, and
      // it is the sender's copy of what they sent.
      setReceipt(result.data.id);
      setAnswer({
        status: result.status,
        statusText: null,
        durationMs,
        answeredAt,
        retryAfterSec: null,
      });
      setPhase("accepted");
      return;
    }

    // A 400 is the only failure with fields attached, and the api lists them in
    // the order of this form (validate.go:53-55) so the focus needs no sorting.
    const params = result.status === 400 ? (result.problem?.invalidParams ?? []) : [];
    setInvalid(params);
    setReceipt(null);
    setAnswer({
      status: result.status,
      statusText: result.problem?.title ?? null,
      durationMs,
      answeredAt,
      retryAfterSec: result.retryAfterSec,
    });
    setPhase("failed");

    // THE PAGE NOW HOLDS THE WAIT INSTEAD OF DESCRIBING IT. ADR 0021 §3 derives
    // `Retry-After` from `min(received_at)`, so it is a measurement — and a
    // wait a page prints but does not keep is one the visitor spends a request
    // discovering. `null` leaves the button alone rather than inventing a
    // duration to lock it for.
    setFreeAt(
      result.status === 429 && result.retryAfterSec !== null
        ? answeredAt + result.retryAfterSec * 1000
        : null,
    );

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
          {/* LOCKED WHILE A MEASURED WAIT RUNS, and released by the same second
              that removes the line from the log. A button that stayed live
              through a 429 would invite the visitor to spend a request finding
              out what the api has already told this page. */}
          <Button disabled={phase === "sending" || waiting} type="submit">
            SEND →
          </Button>
        </div>

        {/* THE ONE `aria-live` REGION, and everything that is not a field error
            goes through it. A status that only changes colour is a status a
            screen reader never hears, and `polite` rather than `assertive`
            because none of these interrupt anything the visitor is doing. */}
        {/* `data-state` RATHER THAN `data-phase`. The six are what the page
            says about itself and the five are how it is implemented, and it was
            the phase that leaked into the stylesheet — where a 400 that named
            no field and a 400 that named three were one colour. */}
        <p className="cf-status" data-state={state} role="status" aria-live="polite">
          <StatusText
            copy={copy}
            failure={answer}
            invalidCount={invalid.length}
            phase={phase}
            receipt={receipt}
            retry={retry}
          />
        </p>
      </form>

      <TxTrace body={sentBody ?? preview} lines={log} state={state} />
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
  retry,
}: {
  copy: ContactCopy;
  failure: Answer | null;
  invalidCount: number;
  phase: Phase;
  receipt: string | null;
  retry: string | null;
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
    //
    // AND IT COUNTS DOWN, because the page is holding the wait rather than
    // reporting it: the button comes back at zero, and a sentence that still
    // said "in 7 minutes" then would be describing a lock that is gone. The
    // seconds come from the same countdown the log prints, so the two cannot
    // disagree. Zero prints nothing at all — there is no wait left to name.
    // THE COUNTDOWN IS NOT PROSE AND SO IT IS NOT IN THE DICTIONARY. `retry in
    // 412s` is the sheet's own wording for this line and the same register as
    // `202`, `SYS.06` and the receipt beside it — LANG.01 keeps nomenclature
    // out of the dictionary, and a German page would still print it. It is also
    // the one line here that a visitor might quote back, which is the argument
    // for the same monospace treatment the receipt gets.
    return (
      <>
        {copy.rateLimited}
        {retry === null ? null : (
          <>
            {" "}
            <span className="cf-receipt">{retry}</span>
          </>
        )}
      </>
    );
  }

  if (failure.status === 502) return <>{copy.providerDown}</>;

  // 0 IS NO ANSWER AT ALL AND ANYTHING ELSE IS AN ANSWER NOBODY EXPECTED, and
  // they are different sentences because they are different facts. A refused
  // connection and a 404 from something that is not our api both used to print
  // "No answer within eight seconds" — a claim about which failure it was, and
  // wrong in both cases.
  if (failure.status === 0) return <>{copy.noAnswer}</>;

  return (
    <>
      {copy.unexpected} <span className="cf-receipt">{failure.status}</span>. {copy.noAnswer}
    </>
  );
}
