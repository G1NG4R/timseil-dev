import type { CSSProperties } from "react";

import { EmptyState } from "@/components/state/EmptyState";
import { contributionsMeta, graphLabel, graphView, type Contributions } from "@/lib/api/contributions";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA } from "@/lib/state/words";

/**
 * The first block of SYS.03: a year of commits, seven rows deep.
 *
 * THE FIRST CONSUMER OF `--l0`…`--l4`. The five steps have been in all seven
 * palettes since G1 with nobody drawing them, and styles/case.css:672 says in as
 * many words why the operation grid did NOT borrow them: "the two grids share a
 * grammar and not a scale". This is the other grid, and the scale is its own.
 *
 * ITS WIDTH IS COUNTED, NOT DRAWN. The sheet gives 53 columns of 15px with a 3px
 * gap, which is 951px — and the content column is `min(1160px, 100% - 80px)`, so
 * the drawing overflows from a 1031px window down, three checked widths before
 * anything is supposed to move. Rather than a switch, `--cols` comes out of the
 * answer and home.css caps the figure at the width those columns actually need:
 * exactly 15px wherever the sheet drew it, and smaller below, with the same 53
 * columns and the same caption at every width. The mobile artboard's other
 * answer — show the last 26 weeks and say so — was turned down because it splits
 * the caption's number from the picture it counts.
 *
 * IT IS ONE PICTURE AND NOT 367. components/case/OpsGrid names every cell of the
 * operation grid, and at 91 that is a list somebody can listen to; at 367 it is
 * a wall. `graphLabel` says the claim the picture makes and the cells are
 * hidden — see lib/api/contributions.ts, where that decision lives with its
 * reason.
 *
 * A LEVEL THE CONTRACT DOES NOT DECLARE IS DRAWN AS THE OUTLINE, not as the
 * empty step: `l0` means measured and empty, `null` means unreadable, and giving
 * them one shape would file the second under the first.
 */
export function ContributionGraph({
  body,
  messages,
}: {
  /** The answer, or `null` for both the fallback and a failed read. */
  body: Contributions | null;
  messages: Messages;
}) {
  const view = graphView(body);

  if (view.days === 0) {
    return (
      <div className="upl-graph">
        <EmptyState heading={NO_DATA} reason={messages.homeUplinkGraphDown} />
      </div>
    );
  }

  return (
    <figure className="upl-graph">
      {/* The grid before its caption, which is the sheet's order: the picture
          reads first and the line under it says what was counted. */}
      <div
        className="upl-cols"
        role="img"
        aria-label={graphLabel(view)}
        style={{ "--cols": view.columns } as CSSProperties}
      >
        {view.cells.map((cell) => (
          <span
            className="upl-cell"
            key={cell.date}
            aria-hidden="true"
            {...(cell.level === null ? {} : { "data-level": cell.level })}
            // Only the cell that opens a column carries a row, and it carries
            // the one its DATE names. Everything after it flows. A first week of
            // four days belongs on rows 4–7; placed on 1–4 the whole year slides
            // up three rows, and no live answer produces that case today.
            {...(cell.startsWeek ? { style: { gridRowStart: cell.row } } : {})}
          />
        ))}
      </div>

      <figcaption className="upl-head">
        <span className="upl-label">{contributionsMeta(view)}</span>

        {/* LESS ▢▢▢▢▢ MORE — the only place the five steps are named, and they
            are named by position rather than by number, because what the reader
            needs is the direction and not the buckets. */}
        <span className="upl-scale" aria-hidden="true">
          LESS
          {(["l0", "l1", "l2", "l3", "l4"] as const).map((level) => (
            <span className="upl-step" data-level={level} key={level} />
          ))}
          MORE
        </span>
      </figcaption>
    </figure>
  );
}
