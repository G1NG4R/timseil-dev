import Link from "next/link";

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
 * THE POST-MORTEM IS A LINK WHEN THE ENTRY EXISTS AND TEXT WHEN IT DOES NOT.
 * H5c and H2b showed the slug as text because `/blog/<slug>` answered 404;
 * H9a ended that condition and #298 asked for the `<a>`. It is conditional
 * anyway, and lib/case/postmortem.ts holds the measurement that made it so: on
 * the day this was written NOT ONE `post_slug` in this project named a file
 * that exists. `postSlug` is a string from the api, the database constrains its
 * shape and cannot see a directory, and invariant 5 does not become optional
 * because a renderer arrived. So the resolved ones link and the rest read
 * exactly as they did — the name of an entry, which is still true.
 */
export function IncidentLog({
  incidents,
  postHrefs,
  messages,
}: {
  /** `null` is a system that was never asked; `[]` is a window with none. */
  incidents: readonly Incident[] | null;
  /** Slug → address, for the post-mortems this repository holds. */
  postHrefs: ReadonlyMap<string, string>;
  messages: Messages;
}) {
  if (incidents === null || incidents.length === 0) {
    return <EmptyState heading={messages.csNoIncidentsHead} reason={messages.csNoIncidentsWhy} />;
  }

  return (
    <ol className="incidents">
      {incidents.map((incident) => {
        // Looked up once and read as a nullable, rather than asked twice with a
        // `?? ""` under the second question — an empty href is a link to the
        // page you are on, which is the exact failure this component refuses.
        const href = postHrefs.get(incident.postSlug) ?? null;

        return (
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
            {/* THE SLUG IS THE LINK TEXT EITHER WAY. It is the name of the
                entry, so the linked and the unlinked entry read the same and
                differ only in whether the name goes anywhere — which is what
                the reader is entitled to know. */}
            <dd className="incident-post">
              {href === null ? incident.postSlug : <Link href={href}>{incident.postSlug}</Link>}
            </dd>
          </dl>
          </li>
        );
      })}
    </ol>
  );
}
