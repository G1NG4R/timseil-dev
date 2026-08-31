import type { Decision } from "@/content/case-studies/types";

/**
 * DECISION · ALTERNATIVE · WHY THIS ONE.
 *
 * A REAL `<table>` ABOVE 720, AND LABELLED BLOCKS BELOW IT — which is what both
 * sheets draw, and the second half was decided by looking rather than by
 * reading. The first build scrolled the table sideways on a phone: rows are as
 * tall as their tallest cell, so a 390px screen showed two sparse columns
 * separated by 180px of nothing and the argument was off-screen. It read as
 * broken, not as scrollable.
 *
 * SO THE LABELS MOVE INSTEAD OF THE READER. Each cell carries its column word
 * as real text, hidden above 720 where `<th scope="col">` already supplies it,
 * shown below 720 where the header row is gone. Exactly one source of labels is
 * in the accessibility tree at each width, so nothing is announced twice and
 * nothing is lost — and below 720 the section stops being a table for a screen
 * reader at the same width it stops being one on the screen. `Case Study 02`
 * does the same thing in its 390 artboard, where the rejected option becomes a
 * sentence that begins with the word "Rejected".
 *
 * `layout.css:78` — `.decision-table { grid-template-columns: 1fr }` — is still
 * without a consumer after this, and that is recorded rather than worked
 * around: the rule presumes a grid of divs, and a grid of divs only reflows if
 * its rows carry `display: contents`, which browsers strip from the
 * accessibility tree along with the row and cell roles.
 *
 * WHICH SHEET'S COLUMNS. The two disagree, again: `Case Study Template` draws
 * `230px 1fr 1fr` with ALTERNATIVE in the middle, `Case Study 02` draws
 * `200px 1fr 1fr` with WHY in the middle and "REJECTED — AND WHAT IT COSTS"
 * last. H1 settled the precedence for this page in ADR 0052 — it builds the
 * Template — and nothing here reopens it.
 *
 * THE COLUMN HEADS ARE THE ONLY WORDS THIS COMPONENT OWNS, so they arrive as
 * messages. Everything else is content.
 *
 * `aria-label` RATHER THAN A `<caption>`, because a caption that must not be
 * seen needs a visually-hidden utility, and this repository has none — adding a
 * global class for one element is how a utility layer starts. `Constraints`
 * names its own region the same way.
 */
export function DecisionTable({
  rows,
  caption,
  headings,
}: {
  rows: readonly Decision[];
  caption: string;
  headings: { decision: string; alternative: string; why: string };
}) {
  return (
    <table className="decision-table" aria-label={caption}>
      <thead>
        <tr>
          <th scope="col">{headings.decision}</th>
          <th scope="col">{headings.alternative}</th>
          <th scope="col">{headings.why}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.decision}>
            {/* The decision names the row, so it is the row's header. */}
            <th scope="row">{row.decision}</th>
            <td className="dt-alt">
              <span className="dt-label">{headings.alternative}</span>
              {row.alternative}
            </td>
            <td>
              <span className="dt-label">{headings.why}</span>
              {row.why}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
