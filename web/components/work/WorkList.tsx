import { EmptyState } from "@/components/state/EmptyState";
import { WorkHeader } from "@/components/work/WorkHeader";
import { WorkRow } from "@/components/work/WorkRow";
import type { SystemList } from "@/lib/api/systems";
import type { PostMeta } from "@/lib/content/posts";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA } from "@/lib/state/words";
import { listed, statusCounts, workMeta } from "@/lib/work/counts";
import { workEntries } from "@/lib/work/entries";

/**
 * `/work` whole: the head with its four counts, the counter line, and the list.
 *
 * ONE COMPONENT FOR THE RESTING STATE AND THE ANSWER, which is the seam ADR
 * 0044 described and every streamed region on this site uses. `body` is `null`
 * both while the request is in flight and after it has failed, and the two look
 * the same to a reader on purpose: "no answer yet" and "no answer at all" are
 * both "this page cannot say", and a spinner would claim to know which.
 *
 * THE HEAD IS INSIDE THE STREAMED REGION, unlike the legend and the contact
 * line under it. Its four tiles and its counter are all statements about the
 * answer, so a prerendered head would have to draw four numbers it does not
 * have yet. `workMeta(null)` writes `— NO DATA · FIGURES FROM /api/systems`,
 * which keeps the source clause: the head that is still waiting names what it
 * is waiting for. TrainingLog settled that arrangement in H4.
 *
 * THE LIST IS AN `<ol>` BECAUSE THE NUMBER IS THE ORDER. `ListSystems` ends
 * with `ORDER BY s.system_no` and the row prints that number, so the sequence
 * is the data's rather than the markup's — the same reason `.sys-list` is one.
 *
 * THE EMPTY CASE NAMES THE ENDPOINT. An empty list would read as "there are no
 * systems", which is a claim about the work; what actually happened is that the
 * api did not answer, which is a claim about the api. `workListDown` says which.
 *
 * NO FILTER HERE, AND THAT IS THE PHASE BOUNDARY. H6b adds the two chip rows
 * and the `0 treffer` empty state; `workMeta` already takes the filtered count
 * so that the island narrows a line this component renders rather than owning
 * one that exists only where JavaScript ran.
 */
export function WorkList({
  body,
  posts,
  messages,
}: {
  /** The answer, or `null` for both the fallback and a failed read. */
  body: SystemList | null;
  /** The log entries, read from this image's own content/posts. */
  posts: readonly PostMeta[];
  messages: Messages;
}) {
  const entries = workEntries(body, posts, messages);

  return (
    <>
      {/* `null` rather than four zeroes when nothing countable arrived — the
          tiles and the counter under them have to make the same claim about the
          same answer, and `listed` is the one guard both read. */}
      <WorkHeader counts={listed(body) ? statusCounts(entries) : null} messages={messages} />

      <p className="work-count">{workMeta(body)}</p>

      {entries.length === 0 ? (
        <EmptyState heading={NO_DATA} reason={messages.workListDown} />
      ) : (
        <ol className="work-list">
          {entries.map((entry) => (
            <WorkRow key={entry.slug} entry={entry} messages={messages} />
          ))}
        </ol>
      )}
    </>
  );
}
