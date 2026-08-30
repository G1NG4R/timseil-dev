// The four regions of a case study that wait for the api, and the only place
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
// WHY FOUR BOUNDARIES AND NOT ONE. Under `cacheComponents` everything outside a
// Suspense boundary has to be prerenderable, and `systemNow` calls
// `connection()` — it is runtime data by construction. One boundary around the
// whole page would put the headline, the lead and the problem section behind
// the api too, and those are in the repository. Four boundaries keep the static
// shell static and leave four small holes for the measured words.
//
// FOUR CALLS ARE ONE REQUEST. `systemCached` is a `use cache` function keyed by
// the slug, so the later callers read the fill the first one made. The footer
// and the mobile menu have shared `footerHealthNow` the same way since G4, and
// /about measured zero upstream calls over ten loads.

import { CaseCrumb } from "@/components/case/CaseCrumb";
import { CaseEyebrow } from "@/components/case/CaseEyebrow";
import { MetricRow } from "@/components/case/MetricRow";
import { SpecRail } from "@/components/case/SpecRail";
import { systemNow } from "@/lib/api/readers";
import { metricTiles, sourceView, stackLine } from "@/lib/api/systems";
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
