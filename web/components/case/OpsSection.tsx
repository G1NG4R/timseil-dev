import { IncidentLog } from "@/components/case/IncidentLog";
import { OpsGrid } from "@/components/case/OpsGrid";
import { EmptyState } from "@/components/state/EmptyState";
import { LoadingLines } from "@/components/state/LoadingLines";
import { incidentList, opsGrid, type SystemDetail } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { readData, type Read } from "@/lib/state/read";
import { NO_DATA } from "@/lib/state/words";

/**
 * The measured half of `.04`: the grid, and the log its notches point into.
 *
 * ONE COMPONENT, TWO CALLERS, WHICH IS THE POINT. `Live.tsx` renders it with an
 * answer and `page.tsx` renders it as a Suspense fallback, and the seam ADR 0044
 * describes only holds if both draw the same region — the first version of this
 * phase wrote the wrapper twice, once in each place, which is how two layouts
 * start.
 *
 * THEY ARE ONE REGION AND NOT TWO because they point at each other. A notch is a
 * link into an entry below it, so a reader who saw the grid settle before the
 * log would have a link to something that is not there yet. `STREAMED_REGIONS`
 * in e2e/streaming.ts names `.ops-live` for the same reason.
 *
 * THE DERIVATIONS MOVED IN HERE IN U7, and that is what the `Read` bought. The
 * two callers used to pass `grid` and `incidents`, which meant page.tsx had to
 * hold an `EMPTY_GRID` constant and an `incidents={null}` beside it — two
 * spellings of "nothing has answered" maintained by hand in the place least
 * likely to be read again. Now one prop carries the answer's three states and
 * the component derives both halves from it.
 *
 * THE GRID IS THE SAME FIGURE IN ALL THREE STATES. Its caption cannot tell a
 * wait from an outage — `OPERATION · — NO DATA` is the honest line for both, and
 * the sheet's own day-one artboard draws exactly that — so only the panel under
 * it changes. The 129px of empty grid that a region with no cells draws is
 * unchanged by this phase and noted in backlog.md; it is a frame, not a claim.
 */
export function OpsSection({
  read,
  postHrefs,
  label,
  waitSource,
  messages,
}: {
  read: Read<SystemDetail>;
  /** Slug → address for the post-mortems this repository holds. */
  postHrefs: ReadonlyMap<string, string>;
  /** The grid's own accessible name. The `<section>` is named by its head. */
  label: string;
  /**
   * The address the wait names, resolved.
   *
   * IT COMES FROM THE CALLER because only the route knows which system this page
   * is about, and a wait that named `/api/systems` would send a reader to the
   * list instead of to the document these numbers came from. lib/state/lines.ts:
   * naming the address is what turns a wait into a statement someone can check.
   */
  waitSource: string;
  messages: Messages;
}) {
  const body = readData(read);

  // `null` here is a system that is not `live` and was never asked about a
  // window — a third meaning, and the reason this branches on `read.kind` first.
  // incidentList's own head keeps the distinction; before U7 this component
  // threw it away and said NO INCIDENTS IN THIS WINDOW for all three.
  const incidents = incidentList(body);

  return (
    <div className="ops-live">
      <OpsGrid grid={opsGrid(body)} label={label} messages={messages} />

      {read.kind === "waiting" ? (
        <LoadingLines what="operation days and incidents" source={waitSource} />
      ) : read.kind === "down" ? (
        <EmptyState heading={NO_DATA} reason={messages.csOpsDown} />
      ) : (
        <IncidentLog incidents={incidents} postHrefs={postHrefs} messages={messages} />
      )}
    </div>
  );
}

/**
 * The resting state of the post-mortem addresses, and the only place it is
 * written.
 *
 * A fallback that built `new Map()` inline would be a second spelling of "we
 * have resolved nothing yet", and the seam above only holds while there is one.
 * There is nothing to resolve before the answer arrives: the slugs are IN the
 * answer.
 *
 * ITS TWIN `EMPTY_GRID` IS GONE, taken by U7. It stood for the same idea one
 * level down — `{ cells: [], weeks: 0 }`, hand-written beside the fallback —
 * and the component now derives its grid from the `Read` with `opsGrid(null)`,
 * which is what that constant was a transcription of. This one stays because
 * nothing derives it: the map is resolved from the repository, one layer up.
 */
export const NO_POST_HREFS: ReadonlyMap<string, string> = new Map();
