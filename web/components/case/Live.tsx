// The five regions of a case study that wait for the api, and the only place
// this page calls it.
//
// WHY THEY ARE SEPARATE FROM THE COMPONENTS THEY RENDER. Each one is an async
// Server Component the page puts inside a `<Suspense>`, and the fallback is the
// SAME component with the same props in their resting state. That is the seam
// ADR 0044 described and G4 built for the footer: one component draws both
// answers, so "we have no numbers" and "we have these numbers" cannot drift
// into two different layouts. Keeping the fetch out of the presentational
// components is what lets the gallery render them without an api at all.
//
// FIVE SINCE H2b, AND THE FIFTH IS ONE BOUNDARY AROUND TWO COMPONENTS. The grid
// and the incident log read the same two arrays of the same answer and stand
// against each other — a notch in the grid is a link into the log — so a reader
// who saw one settle before the other would see a link to something not yet
// there. They wait together, in one region, behind one fallback.
//
// WHY SEVERAL BOUNDARIES AND NOT ONE. Under `cacheComponents` everything outside
// a Suspense boundary has to be prerenderable, and `systemNow` calls
// `connection()` — it is runtime data by construction. One boundary around the
// whole page would put the headline, the lead, the problem section and all of
// `.02`, `.03` and `.05` behind the api too, and every one of those is in the
// repository. Five boundaries keep the static shell static and leave five small
// holes for the measured words.
//
// FIVE CALLS ARE ONE REQUEST. `systemCached` is a `use cache` function keyed by
// the slug, so the later callers read the fill the first one made. The footer
// and the mobile menu have shared `footerHealthNow` the same way since G4, and
// /about measured zero upstream calls over ten loads. H2b adds a fifth caller
// and no fifth request; the acceptance measures it rather than assuming it.

import { CaseCrumb } from "@/components/case/CaseCrumb";
import { CaseEyebrow } from "@/components/case/CaseEyebrow";
import { IncidentLog } from "@/components/case/IncidentLog";
import { MetricRow } from "@/components/case/MetricRow";
import { OpsGrid } from "@/components/case/OpsGrid";
import { SpecRail } from "@/components/case/SpecRail";
import { systemNow } from "@/lib/api/readers";
import { incidentList, metricTiles, opsGrid, sourceView, stackLine } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { systemStateWord } from "@/lib/state/derive";

/** What every one of them needs, and what the fallbacks repeat. */
interface Common {
  slug: string;
  messages: Messages;
}

export async function CaseCrumbLive({
  slug,
  href,
  back,
}: Omit<Common, "messages"> & { href: string; back: string }) {
  const system = await systemNow(slug);

  return (
    <CaseCrumb
      href={href}
      back={back}
      // `02 TIMSEIL.DEV` as the sheet draws it, or the address itself. The
      // display name and the number live in `systems`, so they are what waits;
      // the slug is in the URL bar and never has to.
      label={system === null ? slug : `${system.systemNo} ${system.name}`}
    />
  );
}

export async function CaseEyebrowLive({ slug, name, messages }: Common & { name: string }) {
  const system = await systemNow(slug);

  return (
    <CaseEyebrow
      systemNo={system?.systemNo ?? null}
      // The registry's slug is the fallback, not a blank: a heading that says
      // nothing is worse than one that says the address you are at.
      name={system?.name ?? name}
      state={systemStateWord(system?.state)}
      messages={messages}
    />
  );
}

export async function SpecRailLive({
  slug,
  role,
  year,
  hosting,
  messages,
}: Common & { role: string; year: string; hosting: string }) {
  const system = await systemNow(slug);

  return (
    <SpecRail
      role={role}
      // The stack is never typed on this site: it comes from `systems.stack`,
      // which make gen fills out of go.mod, package.json and compose.yaml. That
      // is what makes design corrections #1 and #2 unreachable rather than
      // fixed — there is no place here where a version could be written.
      stack={stackLine(system)}
      year={year}
      state={systemStateWord(system?.state)}
      hosting={hosting}
      source={sourceView(system)}
      messages={messages}
    />
  );
}

export async function MetricRowLive({
  slug,
  note,
  messages,
}: Common & { note: { label: string; text: string } }) {
  const system = await systemNow(slug);

  // `null` goes straight in: metricTiles draws the same five labels with
  // nothing under them, so the row that says "no answer" and the row that says
  // "nothing measured yet" are the same markup and cannot drift.
  return <MetricRow tiles={metricTiles(system, messages)} note={note} />;
}

/**
 * `.04`'s two measured parts, waiting together.
 *
 * THE FALLBACK IS THE SAME PAIR WITH NOTHING IN IT, which is the seam ADR 0044
 * describes: an empty grid and an empty log are exactly what a system with no
 * history renders, so "no answer yet" and "no answer at all" cannot drift into
 * two different layouts. There is no spinner here for the same reason there is
 * none anywhere else on this page.
 *
 * `null` GOES STRAIGHT IN. `opsGrid(null)` is no cells and `incidentList(null)`
 * is `null`, and both components already draw that — the api being down and the
 * system never having run produce one picture, and it is the honest one.
 */
export async function OpsLive({ slug, messages, gridLabel }: Common & { gridLabel: string }) {
  const system = await systemNow(slug);

  return (
    <div className="ops-live">
      <OpsGrid grid={opsGrid(system)} label={gridLabel} messages={messages} />
      <IncidentLog incidents={incidentList(system)} messages={messages} />
    </div>
  );
}
