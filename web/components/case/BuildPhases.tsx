import type { Phase } from "@/content/case-studies/types";

/**
 * The order the system was built in, beside the compose block.
 *
 * AN `<ol>`, AND THE ORDINAL IS DRAWN BY A COUNTER — the same shape and the same
 * reason as `Constraints`: `01` is the sheet's form, a list marker cannot be
 * zero-padded, and the order is the whole claim. "Contract first" says nothing
 * on its own; first is the word that carries it.
 *
 * IT REUSES `.cs-panel`, the plate H1 built for the constraints. The sheet draws
 * this rail with the same fill, the same hairline and no corner brackets — "zwei
 * FUI-Devices pro Fläche", and this surface has none. A second class with the
 * same three declarations would be a second opinion about one surface.
 */
export function BuildPhases({ phases, label }: { phases: readonly Phase[]; label: string }) {
  return (
    <aside className="rail cs-panel" aria-label={label}>
      <p className="spec-label">{label}</p>
      <ol className="phases">
        {phases.map((phase) => (
          <li key={phase.title}>
            {/* Title and detail share one wrapper because the counter is the
                other grid item: three children in a two-column grid put the
                detail in the 18px ordinal column, one word per line. Found by
                looking at the built page, not by reading this file. */}
            <span>
              <span className="phase-title">{phase.title}</span>
              <span className="phase-detail">{phase.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
