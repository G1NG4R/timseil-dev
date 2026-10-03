import { ModuleCard } from "@/components/home/ModuleCard";
import { ScaleLegend } from "@/components/home/ScaleLegend";
import { EmptyState } from "@/components/state/EmptyState";
import { LoadingLines } from "@/components/state/LoadingLines";
import { SectionHead } from "@/components/ui/SectionHead";
import { modules, trainingMeta, type Training } from "@/lib/api/training";
import type { Messages } from "@/lib/i18n/messages/en";
import { readData, type Read } from "@/lib/state/read";
import { NO_DATA } from "@/lib/state/words";

/** What this region fetches, in the machine's voice. Not translated, for the
 *  reason lib/state/lines.ts gives: a log line is not prose addressed to a
 *  reader, and an address is only useful if it is the address. */
const WAIT_WHAT = "training log";
const WAIT_SOURCE = "ops-api /api/training";

/**
 * SYS.01 whole: the head with its counts, five module cards, and the scale.
 *
 * THE HEAD IS INSIDE THIS COMPONENT AND NOT ABOVE IT, which is the one
 * structural decision here. The sheet puts the counts in the section head —
 * `SELF-TRACKED · 14 TRACKS · EVIDENCE: 02 SYSTEMS · SOURCE: /api/training` —
 * and those are the answer's numbers, so the head cannot be rendered before the
 * answer is. Keeping the head outside the streamed region would have meant
 * either a head with no meta (H2a's compromise, taken when there were no
 * numbers at all) or a second render pass for one line.
 *
 * SO THE FALLBACK IS THIS SAME COMPONENT, and since U7 it is this same component
 * in a state of its own: `read.kind` is `waiting` there and `down` when the read
 * failed. ADR 0044's seam holds — one file draws all three, and the head, the
 * section and the scale are the same markup in each — but its old rule that "no
 * answer yet" and "no answer at all" should LOOK the same is what U7 revises.
 * `trainingMeta(null)` still puts `— NO DATA` where each count goes and keeps
 * `SOURCE: /api/training`, because a count cannot tell the two apart either.
 *
 * THE EMPTY CASE IS A PANEL AND NOT A GRID OF NOTHING. An empty five-card grid
 * would read as "this person has no skills"; invariant 1 is about numbers and
 * this is the same claim one level up. STATE.05 asks the panel for what is
 * missing and why, and each of the two says it: the wait names what it is
 * fetching and from where, `homeSys01Down` names the endpoint that did not
 * answer.
 *
 * AN `ok` ANSWER WITH NO MODULES REACHES THE DOWN PANEL TOO, and that is a
 * narrower version of the same defect U7 fixes: the sentence would say the
 * endpoint did not answer when it answered with nothing. It is unreachable
 * without a broken seed and it needs a sentence of its own rather than a branch,
 * so it is written down in backlog.md instead of guessed at here.
 *
 * A REDUCED ANSWER IS NOT AN EMPTY ONE. If the api answers with modules but
 * fewer than the seed holds, that is what gets drawn — this component does not
 * know how many there should be, and a component that did would be a second
 * source of truth for the log's size.
 */

export function TrainingLog({
  read,
  messages,
}: {
  read: Read<Training>;
  messages: Messages;
}) {
  const body = readData(read);
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
        // NO `lines` HERE, and it is the one prop this call leaves out on
        // purpose. `--st-lines` reserves the height of an answer that is a
        // number of lines; this answer is a five-card grid, and a line count
        // standing in for it would be a number nothing measured. The swap moves
        // the page exactly as far as it did before U7.
        read.kind === "waiting" ? (
          <LoadingLines what={WAIT_WHAT} source={WAIT_SOURCE} />
        ) : (
          <EmptyState heading={NO_DATA} reason={messages.homeSys01Down} />
        )
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
