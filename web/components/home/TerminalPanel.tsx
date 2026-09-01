import { NoData } from "@/components/state/NoData";
import { StateWord, StatusDot } from "@/components/state/StatusDot";
import type { Messages } from "@/lib/i18n/messages/en";
import { SOON, stateLabel, type StateKey } from "@/lib/state/words";

/**
 * The frame the terminal will live in, reporting the one thing this page can
 * already ask the api.
 *
 * IT HAS NO INPUT, AND THAT IS THE DECISION. ADR 0058. The sheet draws a live
 * terminal here — a prompt, a blinking block and `<input aria-label="terminal
 * input — type help">` — and the build plan gives the component to stage J and
 * this phase the placeholder. An input that accepts nothing is precisely the
 * dead control STATE.05 calls a bug ("DISABLED SAGT WARUM"), and it would be a
 * tab stop leading nowhere in the phase that has to hand axe a green run.
 *
 * SO IT SAYS WHAT IT IS INSTEAD OF STANDING THERE GREYED OUT. `TRY: HELP`
 * becomes `[SOON]`, and the body is the state language rather than fiction: the
 * sheet's eight boot lines are "postgres 16: accepting connections", "4/4
 * healthy" and "#a41f9c2 · 42s", which is four numbers no system on this host
 * produced. Invariant 1 does not have an exception for a decorative log.
 *
 * AND THE FRAME STAYS, at its drawn width and its drawn height. Two reasons,
 * and neither is decoration. `.hero` is `minmax(0,1fr) 480px` above 1080 and a
 * flex column below it; with nothing in the rail there is no 1080 switch to
 * measure and the rule keeps the empty consumer it has had since G1. And the
 * height is `.st-wait`'s rule one component larger — "a wait holds the height
 * the answer will need, so nothing below it moves when the answer arrives" —
 * so stage J fills a box rather than pushing the page down.
 *
 * THE LOG IS `.st-log`, NOT NEW MARKUP. It already draws `> ` before every line
 * from CSS, which is the prompt this frame needs and is the reason the prefix
 * is in no string: out of the accessibility tree, out of anything a visitor
 * copies, and in one declaration rather than in every producer.
 */
export function TerminalPanel({
  status,
  messages,
}: {
  /** What `/api/health` said about the api, or `null` when it said nothing —
   *  which is also the resting state the Suspense fallback renders. */
  status: StateKey | null;
  messages: Messages;
}) {
  return (
    <div className="term marks">
      <div className="term-bar">
        {/* Three window lights and a shell prompt: nomenclature, not prose, so
            neither is in the dictionary. LANG.01. */}
        <span className="term-lights" aria-hidden="true">
          <span className="term-light" />
          <span className="term-light" />
          <span className="term-light" />
        </span>
        <span className="term-title">tim@vps: ~ — ssh</span>
        <span className="term-soon">{SOON}</span>
      </div>

      <div className="term-body">
        <ul className="st-log">
          <li className="term-row">
            <span className="term-key">api</span>
            {/* The one measured word on this page. `null` is `— NO DATA` and
                never a guess — the same reading lib/api/health.ts gives the
                footer, so the two cannot disagree about what a missing field
                means. LIVE rather than ONLINE because the subject is one
                system and not the delivery of this page: STATE.05 keeps those
                two words apart, and lib/state/derive.ts makes the choice. */}
            {status === null ? <NoData /> : <StatusDot state={status} label={stateLabel(status, messages)} />}
          </li>
          <li className="term-row">
            <span className="term-key">terminal</span>
            {/* QUEUED: planned, not built. Not DEGRADED — there nothing runs
                yet, here something runs badly. */}
            <StateWord state="queued" label={stateLabel("queued", messages)} />
          </li>
        </ul>

        <p className="term-why">{messages.homeTerminalWhy}</p>
      </div>
    </div>
  );
}
