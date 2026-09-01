import { ModuleCard } from "@/components/home/ModuleCard";
import { ScaleLegend } from "@/components/home/ScaleLegend";
import { EmptyState } from "@/components/state/EmptyState";
import { SectionHead } from "@/components/ui/SectionHead";
import { modules, trainingMeta, type Training } from "@/lib/api/training";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA } from "@/lib/state/words";

/**
 * SYS.01 whole: the head with its counts, five module cards, and the scale.
 *
 * THE HEAD IS INSIDE THIS COMPONENT AND NOT ABOVE IT, which is the one
 * structural decision here. The sheet puts the counts in the section head —
 * `SELF-TRACKED · 22 TRACKS · EVIDENCE: 01 SYSTEM · SOURCE: /api/training` —
 * and those are the answer's numbers, so the head cannot be rendered before the
 * answer is. Keeping the head outside the streamed region would have meant
 * either a head with no meta (H2a's compromise, taken when there were no
 * numbers at all) or a second render pass for one line.
 *
 * SO THE FALLBACK IS THIS SAME COMPONENT WITH `body={null}`, which is
 * TerminalPanel's arrangement and ADR 0044's rule: "no answer yet" and "no
 * answer at all" must not be two layouts. `trainingMeta(null)` puts `— NO DATA`
 * where each count goes and keeps `SOURCE: /api/training`, so even the waiting
 * head names what it is waiting for.
 *
 * THE EMPTY CASE IS `EmptyState` AND NOT A GRID OF NOTHING. An empty five-card
 * grid would read as "this person has no skills"; invariant 1 is about numbers
 * and this is the same claim one level up. STATE.05 asks the panel for what is
 * missing and why, and `homeSys01Down` answers both by naming the endpoint.
 *
 * A REDUCED ANSWER IS NOT AN EMPTY ONE. If the api answers with modules but
 * fewer than the seed holds, that is what gets drawn — this component does not
 * know how many there should be, and a component that did would be a second
 * source of truth for the log's size.
 */
export function TrainingLog({
  body,
  messages,
}: {
  /** The answer, or `null` for both the fallback and a failed read. */
  body: Training | null;
  messages: Messages;
}) {
  const cards = modules(body);

  return (
    <section className="home-section trn" aria-labelledby="sec-sys-01">
      <SectionHead
        id="SYS.01"
        title="TRAINING LOG"
        titleId="sec-sys-01"
        meta={trainingMeta(body)}
      />

      {cards.length === 0 ? (
        <EmptyState heading={NO_DATA} reason={messages.homeSys01Down} />
      ) : (
        <div className="trn-grid">
          {cards.map((module) => (
            <ModuleCard key={module.no} module={module} messages={messages} />
          ))}
        </div>
      )}

      {/* The scale stands under the log whether or not there are rows: it
          explains the rule, not the data, and a reader who arrives during an
          outage should still be able to find out what CORE would have meant. */}
      <ScaleLegend messages={messages} />
    </section>
  );
}
