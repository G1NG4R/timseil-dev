import { EmptyState } from "@/components/state/EmptyState";
import { downtimeLabel, incidentDate, type Incident } from "@/lib/api/systems";
import { NO_DATA } from "@/lib/state/words";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * Every incident of the window, with what caused it and what fixed it.
 *
 * THE EMPTY STATE IS THE ONE THAT SHIPS. Production answered `incidents: []` on
 * the day this was written, so the panel below is what a visitor actually sees —
 * the list is the case that has never rendered outside a test. Building the list
 * and treating the empty answer as an afterthought is how a stage-H phase gets
 * this backwards, which the page's own header has said since H1.
 *
 * AND IT SAYS WHY IT IS EMPTY, because STATE.05 requires it: "Leer heißt:
 * erklären, warum leer" — `EmptyState` will not render without a reason. The
 * reason here is the one thing an empty incident log must not be mistaken for.
 * Nothing recorded is not the same as nothing happened, and the grid above
 * carries the coverage that says which.
 *
 * `id` IS THE NOTCH'S TARGET. Lowercased because it is a URL fragment and the
 * api sends `INC-001`; `lib/api/systems.ts` has already dropped any incident
 * missing `cause`, `fix` or `postSlug`, so a heading here is never a red mark
 * with no explanation under it — invariant 4, enforced before this component
 * sees the data.
 *
 * THE POST-MORTEM LINK IS NOT BUILT YET AND IS NOT FAKED. `postSlug` names an
 * entry under content/posts, and H9 is the phase that renders them. Until then
 * the slug is shown as what it is — the name of the entry — rather than wrapped
 * in an `<a>` to a route that answers 404. Invariant 5 is about exactly this:
 * evidence never points into nothing.
 */
export function IncidentLog({
  incidents,
  messages,
}: {
  /** `null` is a system that was never asked; `[]` is a window with none. */
  incidents: readonly Incident[] | null;
  messages: Messages;
}) {
  if (incidents === null || incidents.length === 0) {
    return <EmptyState heading={messages.csNoIncidentsHead} reason={messages.csNoIncidentsWhy} />;
  }

  return (
    <ol className="incidents">
      {incidents.map((incident) => (
        <li className="incident" id={incident.id.toLowerCase()} key={incident.id}>
          <p className="incident-head">
            <span className="incident-id">{incident.id}</span>
            {/* Both are read rather than trusted. The contract requires
                `startedAt` and `durationSec`, and an entry that arrived without
                a usable one still has a cause and a fix worth reading — so the
                missing half says `— NO DATA` and the entry stays. */}
            <span className="incident-when">{incidentDate(incident.startedAt) ?? NO_DATA}</span>
            <span className="incident-down">{downtimeLabel(incident.durationSec) ?? NO_DATA}</span>
          </p>

          <dl className="incident-body">
            <dt>{messages.csCause}</dt>
            <dd>{incident.cause}</dd>
            <dt>{messages.csFix}</dt>
            <dd>{incident.fix}</dd>
            <dt>{messages.csPostMortem}</dt>
            <dd className="incident-post">{incident.postSlug}</dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}
