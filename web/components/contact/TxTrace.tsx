import type { ContactRequest } from "@/lib/contact/payload";
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
export function TxTrace({ body, state }: { body: ContactRequest | null; state: string }) {
  // `null` IS THE REST STATE AND NOT A LOADING STATE. Before the form has
  // mounted there is no dwell and no send moment, and this is also exactly what
  // a visitor without JavaScript is left holding — the server-rendered copy of
  // this markup. Printing a request with a zeroed clock would be a drawing of
  // something that will never be sent; the sheet's own rest state is a line
  // that says it is waiting.
  const lines = body === null ? null : traceLines(body);

  return (
    <aside className="tx" aria-label="Request preview">
      <div className="tx-head">
        <span className="tx-dot" aria-hidden="true" />
        <span className="tx-name">TX</span>
        <span className="tx-state">{state}</span>
        {/* Bytes of the body, not of the drawing. lib/contact/trace.ts says why,
            and a test recalculates it. */}
        <span className="tx-bytes">{body === null ? "—" : `${String(bodyBytes(body))} B`}</span>
      </div>

      {/* `<pre>` because the alignment IS the content here, and a screen reader
          should be offered it as one block rather than as eleven fragments —
          the note beside the honeypot only means something next to the line it
          annotates. */}
      <pre className="tx-body">
        {lines === null
          ? "waiting for input"
          : lines.map((line, index) => (
              <span className="tx-line" data-kind={line.kind} key={index}>
                {line.text}
                {line.note === undefined ? null : <span className="tx-note"> ← {line.note}</span>}
                {"\n"}
              </span>
            ))}
      </pre>
    </aside>
  );
}
