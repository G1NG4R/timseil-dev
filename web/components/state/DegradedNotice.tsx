import { StatusDot } from "@/components/state/StatusDot";

/**
 * A partial outage, said out loud beside the content.
 *
 * STATE.05: "Teilausfall ist kein Totalausfall: Inhalte bleiben, nur die
 * Live-Teile melden sich ab. seite bleibt vollständig lesbar." So this is a
 * notice IN the flow — never an overlay, never a dialog, nothing that takes the
 * page away from someone who came to read it.
 *
 * `reduced` NAMES WHAT IS OFF, one line each, because that is the difference
 * between a notice and a shrug. The sheet's own list is "terminal: read-only ·
 * graph: aus cache, 6h alt · metriken: ausgeblendet" — three facts a reader can
 * check. "Some features are unavailable" is not one.
 *
 * The list is required for the same reason EmptyState's reason is.
 */
export function DegradedNotice({
  label,
  reduced,
}: {
  /** The word, from the dictionary via stateLabel("degraded", messages). */
  label: string;
  reduced: readonly string[];
}) {
  return (
    <div className="st-notice" role="status" aria-live="polite">
      <p className="st-notice-head">
        <StatusDot state="degraded" label={label} />
      </p>
      <ul className="st-notice-list">
        {reduced.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
