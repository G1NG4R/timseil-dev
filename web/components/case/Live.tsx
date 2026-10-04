// The five regions of a case study that wait for the api, and the only place
// this page calls it.
//
// WHY THEY ARE SEPARATE FROM THE COMPONENTS THEY RENDER. Each one is an async
// Server Component the page puts inside a `<Suspense>`, and the fallback is the
// SAME component. That is the seam ADR 0044 described and G4 built for the
// footer: one component draws every answer, so "we have no numbers" and "we have
// these numbers" cannot drift into two different layouts. Keeping the fetch out
// of the presentational components is what lets the gallery render them without
// an api at all.
//
// SINCE U7 EACH OF THEM ALSO SAYS WHICH MISS IT IS. `systemNow` answers `null`
// for a read that failed, and `null` was what a fallback had to pass too, so
// three regions of this page said something about the api — or about a window
// nobody had measured — while the answer was still in flight. This layer is the
// only one that knows the difference, so this is where it is named: `DOWN` here,
// `WAITING` in page.tsx, and the component holds all three.
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
// whole page would put the headline, the compose block and the pipeline behind
// the api too, and none of those three waits for anything: two are in the
// repository and the third is generated into it. Five boundaries keep the static
// shell static and leave five small holes for the measured words.
//
// FIVE CALLS ARE ONE REQUEST. `systemCached` is a `use cache` function keyed by
// the slug, so the later callers read the fill the first one made. The footer
// and the mobile menu have shared `footerHealthNow` the same way since G4, and
// /about measured zero upstream calls over ten loads. H2b adds a fifth caller
// and no fifth request; the acceptance measures it rather than assuming it.

import { CaseCrumb } from "@/components/case/CaseCrumb";
import { CaseEyebrow } from "@/components/case/CaseEyebrow";
import { MetricRow } from "@/components/case/MetricRow";
import { OpsSection } from "@/components/case/OpsSection";
import { SpecRail } from "@/components/case/SpecRail";
import { systemNow } from "@/lib/api/readers";
import { postMortemHrefs } from "@/lib/case/postmortem";
import {
  OPS_WINDOW_CASE,
  incidentList,
  sourceView,
  stackLine,
  systemWaitSource,
} from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import type { Locale } from "@/lib/i18n/routes";
import { systemStateWord } from "@/lib/state/derive";
import { DOWN, readOk } from "@/lib/state/read";

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
  const system = await systemNow(slug, OPS_WINDOW_CASE);

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
  const system = await systemNow(slug, OPS_WINDOW_CASE);

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
  year,
  hosting,
  messages,
}: Common & { year: string; hosting: string }) {
  const system = await systemNow(slug, OPS_WINDOW_CASE);

  return (
    <SpecRail
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
  locale,
}: Common & { note: { label: string; text: string }; locale: Locale }) {
  const system = await systemNow(slug, OPS_WINDOW_CASE);

  // THE FIVE TILES STILL DRAW `— NO DATA` FOR EITHER MISS, and they have to: a
  // tile cannot tell a wait from an outage. What U7 changed is the note under
  // them. `EMPTY ON PURPOSE` explains a system that has not run yet, and a
  // failed read is not that, so the state goes in whole and MetricRow chooses.
  return (
    <MetricRow
      read={system === null ? DOWN : readOk(system)}
      note={note}
      waitSource={systemWaitSource(slug)}
      messages={messages}
      locale={locale}
    />
  );
}

/**
 * `.04`'s two measured parts, waiting together.
 *
 * THE FALLBACK IS THE SAME COMPONENT — literally the same one: `OpsSection` is
 * rendered here with an answer and in page.tsx with `WAITING`, which is the seam
 * ADR 0044 describes. The grid is the same figure in both, down to its caption.
 * There is no spinner here for the same reason there is none anywhere else.
 *
 * WHAT `null` USED TO COST. Until U7 the api being down and the system never
 * having run produced one picture and one sentence — `NO INCIDENTS IN THIS
 * WINDOW`, a claim about a window nobody had measured — and the fallback made
 * the same claim a beat earlier. Three meanings, one panel. The state goes in
 * whole now; `incidentList(null)` still means "not live", and that is the one of
 * the three that is still allowed to reach the incident log.
 */
export async function OpsLive({
  slug,
  locale,
  messages,
  gridLabel,
}: Common & { locale: Locale; gridLabel: string }) {
  const system = await systemNow(slug, OPS_WINDOW_CASE);

  return (
    <OpsSection
      read={system === null ? DOWN : readOk(system)}
      // RESOLVED HERE AND NOT IN THE COMPONENT, which is where every href on
      // this site is decided: `postMortemHrefs` reads the repository, and a
      // presentational component that read a directory could not be rendered by
      // the gallery. It is also the only place that has both halves — the api's
      // slugs and the page's locale.
      //
      // `incidentList` RUNS TWICE ON PURPOSE, here and inside the component. It
      // is a pure filter over one array, and the two calls have two jobs: this
      // one resolves addresses, that one draws entries. Passing the result down
      // instead would put the answer in two props that can disagree.
      postHrefs={postMortemHrefs(incidentList(system), locale)}
      label={gridLabel}
      waitSource={systemWaitSource(slug)}
      messages={messages}
    />
  );
}
