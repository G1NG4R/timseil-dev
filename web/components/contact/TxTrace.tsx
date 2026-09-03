import type { LogLine } from "@/lib/contact/log";
import type { ContactRequest } from "@/lib/contact/payload";
import { CONTACT_MARKS, type ContactStateKey } from "@/lib/contact/states";
import { bodyBytes, traceLines } from "@/lib/contact/trace";

/**
 * The request the form is about to send, drawn as text.
 *
 * NOT A SERVER COMPONENT, and it is the one part of this page that could not
 * be. The panel's whole claim is that it is the request — "sie erklärt, was sie
 * tut, während sie es tut" — and a value that only changes on the server does
 * not change while somebody is typing. It renders inside the island and reads
 * the same object `apiPost` serialises.
 *
 * IT TAKES A BODY AND NOT A DRAFT, deliberately. Handed the three typed strings
 * it would have to assemble a request of its own, and the day that assembly
 * disagreed with `buildBody` the page would be drawing one request and sending
 * another — on the panel that exists to prove it does not.
 *
 * NO `'use client'` OF ITS OWN. It is imported by one, which is enough; a
 * directive here would say this file is a boundary, and it is not one.
 */
export function TxTrace({
  body,
  lines: log,
  state,
}: {
  body: ContactRequest | null;
  lines: readonly LogLine[];
  state: ContactStateKey;
}) {
  const mark = CONTACT_MARKS[state];

  // `null` IS THE REST STATE AND NOT A LOADING STATE. Before the form has
  // mounted there is no dwell and no send moment, and this is also exactly what
  // a visitor without JavaScript is left holding — the server-rendered copy of
  // this markup. Printing a request with a zeroed clock would be a drawing of
  // something that will never be sent; the sheet's own rest state is a line
  // that says it is waiting.
  const lines = body === null ? null : traceLines(body);

  return (
    // `data-log` IS WHAT THE PHONE SWITCHES ON. Below 720 this panel is two
    // lines under the button rather than a drawing of the request, and in the
    // resting state it has no lines at all — an empty bordered box on a phone
    // would be a component announcing that it has nothing to say. layout.css
    // reads the attribute; the count is not a design value.
    <aside className="tx" aria-label="Request preview" data-log={log.length > 0 ? "" : undefined}>
      {/* THE TONE IS ON THE HEAD AND NOT ON A WRAPPER INSIDE IT. state.css sets
          `--st-color` from `[data-tone]` on any element and `.st-dot` and
          `.st-word` paint with it, so the dot can stay where the sheet draws it
          — hard left, before the label — while the word sits at the other end
          of the strip. A `.st` around the pair would have had to hold both, and
          the sheet puts the byte counter between them. */}
      <div className="tx-head" data-tone={mark.tone}>
        {/* The dot is the same fact as the word, drawn a second way — so it is
            hidden from a screen reader, which should hear SENDING and not
            "bullet SENDING". It was `--acc` in every state until H8b, including
            the failed one. */}
        {mark.dot === null ? null : (
          <span
            className="st-dot"
            data-dot={mark.dot}
            // Presence, not a value: state.css matches `[data-pulse]`, and
            // `false` would render `data-pulse="false"` and match it too.
            data-pulse={mark.pulse ? "" : undefined}
            aria-hidden="true"
          />
        )}
        <span className="tx-name">TX</span>
        <span className="tx-state st-word">{mark.label}</span>
        {/* Bytes of the body, not of the drawing. lib/contact/trace.ts says why,
            and a test recalculates it. */}
        <span className="tx-bytes">{body === null ? "—" : `${String(bodyBytes(body))} B`}</span>
      </div>

      {/* `<pre>` because the alignment IS the content here, and a screen reader
          should be offered it as one block rather than as eleven fragments —
          the note beside the honeypot only means something next to the line it
          annotates.

          NO `\n` INSIDE A LINE. Each line is a block and a block already breaks,
          so a newline character on top of it is invisible on screen — a browser
          drops a line break at the end of a block box — and doubles in every
          text extraction: `innerText`, a test reading the panel back, and a
          visitor selecting the request to paste it somewhere. The blank line
          between the headers and the body gets its height from contact.css
          instead, which is the layer that owns heights. Measured before it was
          changed: the separator was 20.34px of newline. */}
      <pre className="tx-body">
        {lines === null
          ? "waiting for input"
          : lines.map((line, index) => (
              <span className="tx-line" data-kind={line.kind} key={index}>
                {line.text}
                {line.note === undefined ? null : <span className="tx-note"> ← {line.note}</span>}
              </span>
            ))}
      </pre>

      {/* WHAT HAPPENED, UNDER WHAT WAS ABOUT TO HAPPEN. `.st-log` rather than
          new markup, for the reason TerminalPanel gives when it does the same:
          it already draws the prompt in a `::before`, which keeps the prompt
          out of the accessibility tree and out of anything a visitor copies.
          `data-dir` picks which prompt.

          NOT A LIVE REGION. `.cf-status` is the one `aria-live` on this page
          and it already says what happened in a sentence; announcing the log as
          well would read the same event twice, once as prose and once as a
          transcript. */}
      {log.length === 0 ? null : (
        <ul className="st-log tx-log">
          {log.map((line, index) => (
            <li data-dir={line.dir} key={index}>
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
