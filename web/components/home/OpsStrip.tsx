import { EmptyState } from "@/components/state/EmptyState";
import { SITE_SYSTEM_SLUG } from "@/lib/site";
import { opsGrid, type SystemDetail } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA, dayLabel } from "@/lib/state/words";

/**
 * The second block of SYS.03: thirty days of operation, one row deep.
 *
 * NOT components/case/OpsGrid, AND THE SHEET SAYS SO ITSELF. The Operation Grid
 * sheet lists the two places this picture appears and separates them in the same
 * sentence: "Startseite (30 Tage einreihig, die Seite selbst, reine Anzeige ohne
 * Klick)" against "jede Fallstudie (91 Tage = 13 Wochen à 7 Zellen, ihr System,
 * Kerben anklickbar)". That grid is seven rows deep and every incident in it is
 * a link; this one is a row of cells with nothing to press. Reusing the
 * component would mean passing a flag to switch off its whole second half.
 *
 * WHAT IS SHARED IS THE ARITHMETIC AND THE VOCABULARY. `opsGrid()` is window
 * independent — it counts the days the answer sent — and the cell states are the
 * same four words with the same four shapes, out of styles/case.css. Two
 * pictures of one idea, one derivation, one palette.
 *
 * IT WRAPS RATHER THAN SCROLLING OR SHRINKING, which both artboards draw: one
 * row at 1440, `flex-wrap` at 390 with the cells still 15px, and the Operation
 * Grid sheet's own note "MOBIL: das Raster kippt auf 30 Tage, umbrechend". So
 * home.css asks for as many 15px columns as fit and lets the rest fall to a
 * second line — 30 across at 1440, 18 and 12 at 390, and no media query anywhere
 * in it.
 *
 * NO WEEK COUNT IN THE CAPTION, unlike the case study's. The strip has no rows,
 * so "(4 weeks)" would be a number with no picture behind it — and this is why
 * the two captions are not one shared function. If a later phase merges them,
 * this is the sentence it has to answer first.
 */
export function OpsStrip({
  body,
  messages,
}: {
  /** The answer, or `null` for both the fallback and a failed read. */
  body: SystemDetail | null;
  messages: Messages;
}) {
  const grid = opsGrid(body);
  const days = grid.cells.length;

  if (days === 0) {
    return (
      <div className="upl-ops">
        <EmptyState heading={NO_DATA} reason={messages.homeUplinkStripDown} />
      </div>
    );
  }

  // Counted, never typed — the thirty is `cells.length`, and the window in the
  // source line is the one that was actually asked for.
  const caption =
    `${messages.csOperation} · LAST ${String(days)} ${messages.csDays.toUpperCase()} · ` +
    messages.csOneCellOneDay;

  return (
    <figure className="upl-ops">
      <figcaption className="upl-head">
        <span className="upl-label">{caption}</span>
        {/* Each block names its own source, which is what SYS.03's own meta line
            promises. The sheet writes `/api/health` here — the container that
            served `systems[].days[]` before ADR 0005 split it — and this is the
            endpoint that answers today.

            BOTH HALVES COME OUT OF THE ANSWER and neither is typed: the slug is
            the system this document is about, and the window is `cells.length`.
            Written from `SITE_SYSTEM_SLUG` and the constant instead, this line
            would say what was ASKED FOR while the cells above it show what came
            back, and the day those two disagree is the day the line matters.
            The constant is the unreachable fallback — there are no cells to
            caption without an answer. */}
        <span className="upl-source">
          SOURCE: /api/systems/{body?.slug ?? SITE_SYSTEM_SLUG}?window={String(days)}
        </span>
      </figcaption>

      {/* An `<ol>` because the order is the meaning: oldest to newest, left to
          right, and the list is what tells a reader the count without the
          stylesheet. Thirty names is a list somebody can listen to, which is the
          difference from the calendar above. */}
      <ol className="upl-strip">
        {grid.cells.map((cell, index) => (
          <li
            className="ops-cell"
            data-state={cell.state}
            // The date is not unique in a fixture and must not be the key: a
            // window is a sequence of positions, and the position is the
            // identity. OpsGrid says the same in the same words.
            key={`${cell.date}-${String(index)}`}
            aria-label={`${cell.date} · ${dayLabel(cell.state, messages)}`}
          />
        ))}
      </ol>
    </figure>
  );
}
