import { SOON } from "@/lib/state/words";

/**
 * `SYS.404.01 ERROR BUDGET` — the frame, without the game inside it.
 *
 * A SURFACE, NOT A DISABLED CONTROL, and ADR 0058 wrote the rule down before
 * this phase needed it: "Ein Bauteil einer späteren Stufe wird als Fläche
 * gebaut, nicht als abgeschaltetes Bedienelement. … Die Frage kommt in H5, H6,
 * H10 und J1 wieder." So there is no `<canvas>`, no requestAnimationFrame, no
 * key handler and no `ts404.best` — H11 builds the game after launch
 * (build-plan.md:52), and until then this is four lane names and a state.
 *
 * `[SOON]` AND NOT `— NO DATA`, which is the distinction lib/state/words.ts
 * exists to keep: `— NO DATA` says a measurement was attempted and did not
 * arrive, `[SOON]` says the thing does not exist yet. Nobody has served a
 * request here, so nothing failed to be measured.
 *
 * IT COSTS NO JAVASCRIPT, which is not a side benefit. ADR 0050 leaves 6 725
 * bytes for the terminal, this game, the contribution graph, the filter chips,
 * the trajectory rail and the contact form, and `/contact` alone already holds
 * 6 348 of them. A canvas here would have been spent budget for a page that,
 * per the sheet, must not need it: "das Spiel blockiert nichts, startet nie von
 * selbst … die 404 bleibt zuerst eine Wegbeschreibung."
 */
const LANES = ["API", "DB", "QUEUE", "CACHE"] as const;

export function ErrorBudgetSurface({ lede }: { lede: string }) {
  return (
    <section className="nf-budget" aria-labelledby="nf-budget-title">
      <p className="nf-budget-head">
        <span className="nf-budget-id">SYS.404.01</span>
        <span className="nf-budget-title" id="nf-budget-title">
          ERROR BUDGET
        </span>
        <span className="nf-budget-state" data-tone="dim">
          {SOON}
        </span>
      </p>

      <p className="nf-budget-lede">{lede}</p>

      {/* The four lanes the game will run on, drawn and still. They are labels
          rather than a picture of a game: a screenshot of something that does
          not work yet is the "abgeschaltetes Bedienelement" ADR 0058 refuses. */}
      <ul className="nf-lanes">
        {LANES.map((lane) => (
          <li key={lane} className="nf-lane">
            {lane}
          </li>
        ))}
      </ul>
    </section>
  );
}
