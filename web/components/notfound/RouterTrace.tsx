import { NoData } from "@/components/state/NoData";
import type { TraceLine } from "@/lib/notfound/trace";

/**
 * What the router did, printed as a log.
 *
 * THIS PANEL IS THE ARGUMENT OF THE PAGE. The sheet: "Die Seite bleibt in der
 * Erzählung: Router-Trace zeigt, dass die Anfrage ankam und nur kein Handler
 * passte." A 404 that only apologises leaves the visitor unable to tell a typo
 * from an outage; this one shows the request arriving and every step that
 * failed to claim it.
 *
 * IT IS THE SAME SHAPE AS AN ERROR PANEL, ON PURPOSE. STATE.05: "FEHLER SIND
 * LOGS: Code, Zeitpunkt, Retry-Zähler. Keine Entschuldigungen, keine
 * Illustrationen, kein 'Oops'." `ErrorPanel` renders lib/state/lines.ts the
 * same way; this renders lib/notfound/trace.ts. Neither component decides what
 * to say.
 *
 * THE TWO VALUES ARE MEASURED OR THEY ARE ABSENT. `path` and `traceId` come
 * from `proxy.ts` by way of the request headers, and either can be missing — a
 * route reached outside the proxy's matcher has neither. Invariant 1 decides
 * what that looks like: `— NO DATA`, never a placeholder id and never a `/` we
 * guessed. The sheet's claim that they come "aus der Antwort der Go-API" is
 * corrected in lib/notfound/trace.ts; a 404 never reaches the api.
 */
export function RouterTrace({
  path,
  traceId,
  lines,
}: {
  path: string | null;
  traceId: string | null;
  lines: readonly TraceLine[];
}) {
  return (
    <aside className="nf-trace" aria-label="Router trace">
      <dl className="nf-trace-facts">
        <div className="nf-fact">
          <dt>REQUESTED</dt>
          <dd className="nf-fact-path">{path ?? <NoData />}</dd>
        </div>
        <div className="nf-fact">
          <dt>METHOD</dt>
          <dd>GET</dd>
        </div>
        <div className="nf-fact">
          <dt>TRACE</dt>
          <dd>{traceId ?? <NoData />}</dd>
        </div>
      </dl>

      <div className="nf-term">
        <p className="nf-term-head">tim@vps: ~ — router trace</p>

        {/* NO `role` ON THIS ELEMENT, and axe found the reason rather than a
            reviewer: `role="status"` REPLACES the implicit `list` role, so
            every <li> under it stops being contained by a list and the whole
            log becomes seven orphans. The first draft had it, for ErrorPanel's
            reason — the panel is the page rather than an interruption of it —
            and a live region was never what this needed anyway: the log is
            content, and a screen reader reaches it by reading the page. */}
        <ol className="nf-log">
          {lines.map((line, index) => (
            <li key={`${String(index)}-${line.text}`} data-tone={line.tone}>
              {line.text}
            </li>
          ))}
        </ol>

        <p className="nf-term-prompt" aria-hidden="true">
          tim@vps:~$
        </p>
      </div>
    </aside>
  );
}
