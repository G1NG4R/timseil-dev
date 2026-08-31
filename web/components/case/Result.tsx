/**
 * What held and what would be done differently, side by side.
 *
 * TWO LISTS AND NO VERDICT, which is the section's whole form. The sheet gives
 * them equal width and equal weight — not a list of wins with a modest footnote
 * — and the second column is the one a reader is actually weighing. A page that
 * argues for measuring things has to be able to say what its own measurements
 * cost it.
 *
 * IT REUSES `.cs-panel` AND `.cs-constraints`, the plate and the marked list H1
 * built. Both lists are the same shape as the constraints — short lines with a
 * mark in front — and the sheet draws them on the same surface as every other
 * panel on this page. A third class with the same declarations would be a third
 * opinion about one surface, which is the thing `BuildPhases` already refused.
 */
export function Result({
  holds,
  change,
  holdsLabel,
  changeLabel,
}: {
  holds: readonly string[];
  change: readonly string[];
  holdsLabel: string;
  changeLabel: string;
}) {
  return (
    <div className="cs-result">
      <section className="cs-panel" aria-label={holdsLabel}>
        <p className="spec-label">{holdsLabel}</p>
        <ul className="cs-constraints">
          {holds.map((line) => (
            <li key={line.slice(0, 40)}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="cs-panel" aria-label={changeLabel}>
        <p className="spec-label">{changeLabel}</p>
        <ul className="cs-constraints">
          {change.map((line) => (
            <li key={line.slice(0, 40)}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
