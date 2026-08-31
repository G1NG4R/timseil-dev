import type { OpsGrid as Grid } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { dayLabel, NO_DATA } from "@/lib/state/words";

/**
 * Ninety-one days of operation, one cell each, and the notches that open them.
 *
 * NO JAVASCRIPT, AND THAT IS A DECISION RATHER THAN A SHORTCUT. The `Operation
 * Grid` sheet draws a click-to-open detail panel beside the grid, held in
 * component state. Four things argued against building it here and one argued
 * for the alternative:
 *
 *   1. There are no incidents. Production answered `incidents: []` on the day
 *      this shipped, so a panel would be a component that is delivered to every
 *      visitor and can never be opened — a bundle cost with no reachable state.
 *   2. #244: under `cacheComponents` a streamed region's placeholder stays put
 *      without JavaScript. A panel that also needed it would be the second thing
 *      on this page that does not work, on the page whose argument is honesty.
 *   3. The budget. 143 581 B of 150 000 B, and #237 has said since 29.08. that
 *      the room left is thin. This costs none of it.
 *   4. The sheet itself selects with `:target` — `.dv-opt:target .dv-oid` is how
 *      its own artboard links highlight. The mechanism is not a workaround for
 *      the drawing; it is the drawing's own.
 *
 * So a notch is a link to its entry in the incident log below, `:target` marks
 * the one that was opened, and the `selected` state the component inventory asks
 * for is a stylesheet rule instead of a field.
 *
 * ONLY NOTCHES ARE LINKS. The Template's caption is precise — "Kerben sind hier
 * anklickbar", not every cell — and ninety-one tab stops in a row would be a
 * keyboard trap dressed as thoroughness. Today the grid has none at all, which
 * is the honest number for a window with no incidents in it.
 *
 * EVERY CELL CARRIES ITS OWN NAME. `2026-06-12 · OUTAGE` on the element, not in
 * a visually-hidden span: this repository has no such utility and ADR 0055 turned
 * one down when `<th scope>` already provided the name. Here nothing else would
 * provide it, and a grid of ninety-one anonymous list items is a picture a screen
 * reader cannot read. `aria-label` is the mechanism for that, and it costs
 * markup rather than script.
 *
 * THE CAPTION COUNTS. `91 days (13 weeks)` is `cells.length` and `grid.weeks`,
 * both from lib/api/systems.ts — invariant 7 asks that the window stay countable,
 * and a caption anyone could type would be the first place it stopped being.
 */
export function OpsGrid({
  grid,
  label,
  messages,
}: {
  grid: Grid;
  /** The `<section>`'s own name is elsewhere; this names the picture. */
  label: string;
  messages: Messages;
}) {
  const days = grid.cells.length;

  // No days is not a window of zero — it is a system that is not `live`, or an
  // api that did not answer. Either way the honest caption is the placeholder,
  // and the sheet's own day-one artboard draws exactly that: "DAY 1 · NO HISTORY
  // YET · — NO DATA".
  const caption =
    days === 0
      ? `${messages.csOperation} · ${NO_DATA}`
      : `${messages.csOperation} · ${String(days)} ${messages.csDays} ` +
        `(${String(grid.weeks)} ${messages.csWeeks}) · ${messages.csOneCellOneDay}`;

  return (
    <figure className="ops-figure">
      {/* Caption and legend share one baseline row above the grid, which is the
          sheet's own construction: `display:flex; align-items:baseline; gap:14px`
          with a spacer between them. Reading order matters here — what the cells
          mean is said before they are met, not after. */}
      <figcaption className="ops-head">
        <span className="ops-label">{caption}</span>

        <ul className="ops-legend">
          {(["ok", "degraded", "outage", "nodata"] as const).map((state) => (
            <li key={state} data-state={state}>
              <span className="ops-swatch" aria-hidden="true" />
              {dayLabel(state, messages)}
            </li>
          ))}
        </ul>
      </figcaption>

      {/* An `<ol>` because the order is the meaning — the cells run oldest to
          newest, column by column, and `grid-auto-flow: column` in case.css puts
          seven of them in each. The list is what tells a reader the count
          without the stylesheet. */}
      <ol className="ops-grid" aria-label={label}>
        {grid.cells.map((cell, index) => {
          const name = `${cell.date} · ${dayLabel(cell.state, messages)}`;
          return (
            <li
              className="ops-cell"
              data-state={cell.state}
              // The date is not unique in a fixture and must not be the key: a
              // window is a sequence of positions, and the position is the
              // identity. Two rows for one day would silently collapse.
              key={`${cell.date}-${String(index)}`}
              {...(cell.incidentId === null ? { "aria-label": name } : {})}
            >
              {cell.incidentId === null ? null : (
                // The link is empty on purpose: the mark is the cell's own
                // fill, and the anchor is the hull over it. Its accessible name
                // is the `aria-label` — the sheet asks for a target reached
                // "über eine unsichtbare Hülle, nicht über größere Zellen", and
                // case.css centres it so `pointer: coarse`'s 44px grows around
                // the cell instead of resizing the picture.
                <a className="ops-notch" href={`#${cell.incidentId.toLowerCase()}`} aria-label={name} />
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
