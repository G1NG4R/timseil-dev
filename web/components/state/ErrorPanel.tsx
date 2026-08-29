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
 */
export function ErrorPanel({ heading, ...input }: ErrorInput & { heading?: string }) {
  const lines = errorLines(input);

  return (
    <div className="st-panel" data-tone="alert" role="status" aria-live="polite">
      {heading === undefined ? null : <p className="st-empty-head">{heading}</p>}
      <ul className="st-log">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
