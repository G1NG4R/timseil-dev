import { EmptyState } from "@/components/state/EmptyState";
import { WorkFilters, type FilterRowNode, type StatusChip } from "@/components/work/WorkFilters";
import { WorkHeader } from "@/components/work/WorkHeader";
import { WorkRow } from "@/components/work/WorkRow";
import type { SystemList } from "@/lib/api/systems";
import { padTwo } from "@/lib/api/values";
import type { PostMeta } from "@/lib/content/posts";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA, stateLabel } from "@/lib/state/words";
import { listed, statusCounts, workCount, workMeta } from "@/lib/work/counts";
import { workEntries } from "@/lib/work/entries";
import { stackTags } from "@/lib/work/stacks";

/**
 * `/work` whole: the head with its four counts, the filters, the counter, and
 * the list.
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
 * `WorkFilters` renders the `<ol>` and `WorkRow` renders each `<li>` inside it;
 * the island decides which rows are in the list, never what one looks like.
 *
 * TWO EMPTY LISTS, AND H6b SPLIT THEM. Until this phase the branch here was
 * `entries.length === 0`, and it told a reader whose api had answered
 * `{"systems": []}` that "that endpoint did not answer this request" — over a
 * counter reading `SHOWING 00 OF 00` and a rail reading `00 SYSTEMS`, both of
 * which are measurements. That is the same defect H6a found in the stat tiles,
 * one component further down: three claims about one answer, and the panel was
 * the one lying. `listed` is the guard both halves read, here as everywhere.
 *
 * THE THIRD EMPTY LIST IS NOT HERE AT ALL. Nought matching rows is the island's
 * to draw, because only the island knows a filter is on.
 *
 * THE ROWS ARE RENDERED HERE AND HANDED OVER AS OUTPUT. `FilterRowNode.node` is
 * a Server Component that has already run; Next's guide is explicit that a
 * component passed to a client component as a prop is "not imported into the
 * Client Component's module graph". So the island narrows a list it cannot draw
 * — which is the whole reason `/work` can have a filter and still keep `next/link`
 * and four state components off the wire.
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
  const counts = listed(body) ? statusCounts(entries) : null;

  return (
    <>
      {/* `null` rather than four zeroes when nothing countable arrived — the
          tiles and the counter under them have to make the same claim about the
          same answer, and `listed` is the one guard both read. */}
      <WorkHeader counts={counts} messages={messages} />

      {counts === null ? (
        <>
          <p className="work-count">{workMeta(body)}</p>
          <EmptyState heading={NO_DATA} reason={messages.workListDown} />
        </>
      ) : entries.length === 0 ? (
        <>
          <p className="work-count">{workCount(0, 0)}</p>
          <EmptyState heading={NO_DATA} reason={messages.workListNone} />
        </>
      ) : (
        <WorkFilters
          rows={entries.map(
            (entry): FilterRowNode => ({
              key: entry.slug,
              st: entry.state,
              sk: entry.tags.map((tag) => tag.key),
              node: <WorkRow entry={entry} messages={messages} />,
            }),
          )}
          statusChips={statusChipsOf(counts, messages)}
          // Read off the raw answer rather than off `entries`, because
          // `SystemRowView` prints the stack as a line and drops the array the
          // keys are derived from. `stackTags` sorts and deduplicates.
          stackChips={stackTags(rawStacks(body))}
          strings={{
            noMatchHead: messages.workNoMatchHead,
            noMatchReason: messages.workNoMatchReason,
            reset: messages.workReset,
          }}
        />
      )}
    </>
  );
}

/**
 * The status row: the sentinel, then the contract's three states in the sheet's
 * order.
 *
 * THE THREE ARE THE ENUM AND NOT THE ROWS' STATES, so `IN BUILD 00` is drawn
 * and is a legitimate chip — the vocabulary exists whether or not a row is in
 * that state today. `stackTags` makes the opposite call for the other row and
 * `lib/work/counts.ts` holds the argument for both.
 *
 * THE NUMBERS ARE PADDED BY THE FUNCTION THE RAIL USES. `WorkHeader` prints
 * `03` four inches above this row, and a chip reading `3` beside it would be
 * the same count in two notations — the shape the sheet avoids by making every
 * number on this page two digits and tabular.
 *
 * `ALL` CARRIES `counts.all`, WHICH MAY EXCEED THE OTHER THREE ADDED UP. A row
 * whose state this build cannot name is counted there and claimed by nothing —
 * the same arithmetic the stat rail above already prints.
 */
function statusChipsOf(
  counts: { all: number; live: number; in_build: number; queued: number },
  messages: Messages,
): readonly StatusChip[] {
  // The parameter is the three keys `StatusCounts` actually holds, not every
  // `StateWord`: the tally has no column for OFFLINE, and a cast here would
  // hide that rather than state it.
  const of = (state: "live" | "in_build" | "queued") => ({
    key: state,
    label: stateLabel(state, messages),
    count: padTwo(counts[state]),
  });

  return [
    { key: "all", label: "ALL", count: padTwo(counts.all) },
    of("live"),
    of("in_build"),
    of("queued"),
  ];
}

/**
 * Every `stack` the answer carried, untouched.
 *
 * Whatever arrived is passed through: `stackTags` refuses a non-array and
 * `stackKey` refuses an entry that is not a usable name, so nothing here has to
 * decide what a stack is a second time.
 */
function rawStacks(body: SystemList | null): readonly unknown[] {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  if (!Array.isArray(raw.systems)) return [];

  // `?.` would be flagged as unnecessary here and the guard is real: an entry
  // may be `null`, which is not a `Record` at run time however it is typed.
  return (raw.systems as unknown[]).map((entry) => {
    if (entry === null || typeof entry !== "object") return undefined;
    return (entry as Record<string, unknown>).stack;
  });
}
