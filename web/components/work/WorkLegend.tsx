import Link from "next/link";

import { StateWord } from "@/components/state/StatusDot";
import type { Messages } from "@/lib/i18n/messages/en";
import { stateLabel } from "@/lib/state/words";

/**
 * What the three status words mean, under the list that uses them.
 *
 * THE SHEET MAKES THIS THE ARGUMENT FOR THE BLOCK: "Die Legende unten definiert
 * LIVE, BUILD, QUEUED — Statuswörter sind nur so viel wert wie ihre
 * Definition." It is the only place on this site where the vocabulary explains
 * itself to a reader rather than to a developer reading `words.ts`.
 *
 * THE WORDS COME FROM `MARKS` AND THE SENTENCES FROM THE DICTIONARY. A legend
 * that spelled a state one way while the row beside it spelled it another would
 * be worse than no legend, so the three labels here are the same call
 * `WorkRow` makes — and that is also what makes this block the reason #289 had
 * to be closed in this phase rather than deferred again: a legend cannot define
 * a word the page has no way to draw.
 *
 * THE COLOURS ARE NOT REPEATED HERE. The sheet paints each word in its own
 * value inline, including `#B9C6D4` for BUILD — which is `--ink-3`, a TEXT ink,
 * used as if it were a signal. That is exactly the confusion `Tone` exists to
 * prevent: there are four tones and they are named. `StateWord` is what puts
 * the word on the page, so each term takes its tone out of `MARKS` and no value
 * is written twice — a ternary here would be a second, smaller copy of the
 * table, which is the shape every drift in this repository has had. ADR 0055's
 * rule decides the disagreement with the sheet: where the drawing and the
 * delivered stylesheet differ, the stylesheet is right.
 */
export function WorkLegend({ href, messages }: { href: string; messages: Messages }) {
  const terms = [
    { state: "live", text: messages.workLegendLive },
    { state: "in_build", text: messages.workLegendInBuild },
    { state: "queued", text: messages.workLegendQueued },
  ] as const;

  return (
    <aside className="work-legend" aria-labelledby="work-legend-head">
      <div className="work-legend-body">
        <p className="work-legend-kicker" id="work-legend-head">
          {messages.workLegendKicker}
        </p>
        <p className="work-legend-text">
          {terms.map((term) => (
            <span key={term.state}>
              <StateWord state={term.state} label={stateLabel(term.state, messages)} />{" "}
              {term.text}{" "}
            </span>
          ))}
          {messages.workLegendRule}
        </p>
      </div>

      {/* THE SHEET DRAWS THIS BUTTON AT 1440 AND DROPS IT AT 390, which is the
          second, shorter word set again (#293) — and here it costs a whole
          exit rather than a clause. It is the only in-content link from this
          page to the training log, and the Routes matrix expects every claim to
          reach its evidence. One button, both widths. */}
      <Link className="work-legend-exit" href={href}>
        {messages.workTrainingLog} →
      </Link>
    </aside>
  );
}
