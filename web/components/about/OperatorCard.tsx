import { Fragment } from "react";

import { OPERATOR } from "@/lib/about/content";

/**
 * The right column of the hero: the same spec grammar the case study uses.
 *
 * WHY A CARD AND NOT A CV LIST, in the sheet's own words: "Operator-Card statt
 * Lebenslauf-Liste: dieselbe Spec-Grammatik wie die Case Study, damit die Seite
 * Teil desselben Systems bleibt."
 *
 * A `<dl>` AND NOT A GRID OF SPANS. Six label/value pairs are a description
 * list by definition, and the sheet draws them as one — `grid-template-columns:
 * 80px 1fr`. The grid is declared on the `<dl>` itself and the `<dt>`/`<dd>`
 * are its items, so the markup carries the relationship and the stylesheet
 * carries the arrangement. `.spec` on the case study made the same call.
 *
 * `.marks` IS THE FOURTH CONSUMER. ui.css says why the eight corner gradients
 * became a class in H4 — a third copy was the incident — and this is the fourth
 * box in the handoff drawn with them. It sets the pair the class asks for and
 * inherits the geometry.
 *
 * `LANGUAGES` IS NOT A ROW, and lib/about/content.ts carries the argument: the
 * sheet's value for it is `[LANGUAGES]`.
 */
export function OperatorCard() {
  return (
    <div className="op-card marks">
      <p className="op-kicker">OPERATOR</p>
      {/* THE `<dt>` AND `<dd>` ARE THE GRID ITEMS, with no wrapper between them
          and the list. A `<div>` per row would need `display: contents` to let
          the columns line up across rows, and a box that exists only to be
          removed from the box tree is a box that should not have been added. */}
      <dl className="op-grid">
        {OPERATOR.map((row) => (
          <Fragment key={row.label}>
            <dt className="op-label">{row.label}</dt>
            {/* `data-accent` is presence and not a value — `false` would render
                `data-accent="false"` and match `[data-accent]`, which is the
                trap FilterChip's `data-sentinel` wrote down in H6b. */}
            <dd className="op-value" data-accent={row.accent === true ? "" : undefined}>
              {row.value}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
