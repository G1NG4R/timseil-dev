import { IncidentLog } from "@/components/case/IncidentLog";
import { OpsGrid } from "@/components/case/OpsGrid";
import type { Incident, OpsGrid as Grid } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The measured half of `.04`: the grid, and the log its notches point into.
 *
 * ONE COMPONENT, TWO CALLERS, WHICH IS THE POINT. `Live.tsx` renders it with an
 * answer and `page.tsx` renders it as a Suspense fallback with nothing, and the
 * seam ADR 0044 describes only holds if both draw the SAME markup — "no answer
 * yet" and "no answer at all" have to be one layout or a reader learns to tell
 * them apart. The first version of this phase wrote the wrapper twice, once in
 * each place, which is how two layouts start.
 *
 * THEY ARE ONE REGION AND NOT TWO because they point at each other. A notch is a
 * link into an entry below it, so a reader who saw the grid settle before the
 * log would have a link to something that is not there yet. `STREAMED_REGIONS`
 * in e2e/streaming.ts names `.ops-live` for the same reason.
 */
export function OpsSection({
  grid,
  incidents,
  label,
  messages,
}: {
  grid: Grid;
  incidents: readonly Incident[] | null;
  /** The grid's own accessible name. The `<section>` is named by its head. */
  label: string;
  messages: Messages;
}) {
  return (
    <div className="ops-live">
      <OpsGrid grid={grid} label={label} messages={messages} />
      <IncidentLog incidents={incidents} messages={messages} />
    </div>
  );
}

/**
 * The resting state, and the only place it is written.
 *
 * `opsGrid(null)` produces exactly this, so the fallback and the render of an
 * answer that never came are the same picture by construction rather than by two
 * people agreeing. A system that is not `live` reaches it too.
 */
export const EMPTY_GRID: Grid = { cells: [], weeks: 0 };
