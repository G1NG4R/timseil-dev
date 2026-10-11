import { errorLines, type ErrorInput } from "@/lib/state/lines";

/**
 * A failure, written as a log.
 *
 * STATE.05: "FEHLER SIND LOGS: Code, Zeitpunkt, Retry-Zähler. Keine
 * Entschuldigungen, keine Illustrationen, kein 'Oops'." So there is no
 * illustration to design, no apology to translate, and nothing here decides
 * what to say — lib/state/lines.ts composes the lines and this renders them.
 *
 * `role="status"` rather than `role="alert"`: the panel replaces a region that
 * was loading, it does not interrupt. `aria-live="polite"` lets a screen reader
 * finish the sentence it is on.
 *
 * ONE OF THESE PER PAGE. The sheet reserves red for a single moment per screen
 * ("Rot nur hier — pro Seite ein Alert-Moment"), and two error panels on one
 * page spend it twice. Nothing enforces that but a reviewer.
 *
 * `lang="en"` ON THE LIST AND NOT ON THE PANEL, which is the whole decision in
 * one attribute's placement. ADR 0083's second decision keeps a log in English
 * — a log line is the machine's voice, and `web: 500 render failed` is only
 * worth printing because it can be searched — so the list says which language
 * it is in rather than letting `<html lang="de">` claim it. The heading above
 * it is prose, comes from the dictionary, and is outside the list for exactly
 * this reason.
 */
export function ErrorPanel({ heading, ...input }: ErrorInput & { heading?: string }) {
  const lines = errorLines(input);

  return (
    <div className="st-panel" data-tone="alert" role="status" aria-live="polite">
      {heading === undefined ? null : <p className="st-empty-head">{heading}</p>}
      <ul className="st-log" lang="en">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
