// The case study. Build plan H1 — the page that is the argument, and the first
// route on this site that is allowed to be indexed besides `/`.
//
// WHAT THIS PAGE IS FOR. Chapter 12.1: "Die Fallstudie **ist** die
// Systemdokumentation, öffentlich und datengetrieben." Every number on it comes
// out of `/api/systems/{slug}`, which anyone can curl, and the prose beside them
// comes out of content/case-studies. Nothing here computes a figure.
//
// THE EMPTY STATE IS THE ONE THAT SHIPS FIRST, and it is not an oversight:
// api/internal/seed/seed.sql writes no measurements, so against a fresh database
// this page renders `— NO DATA` five times under an amber note explaining that
// it will. Case Study 02 draws exactly that. Testing the full page and shipping
// the empty one is how a stage-H phase gets this backwards.
//
// THE PAGE IS COMPLETE AS OF H2b: `.01` through `.05`, and the 91-day grid with
// its notches. What that phase did NOT bring is the client component the earlier
// version of this comment expected. The notch is an anchor into the incident log
// and `:target` marks the one that was opened — components/case/OpsGrid.tsx
// argues it, and the short version is that with `incidents: []` in production a
// click-to-open panel would be a component shipped to every visitor that nothing
// can open. So this route still runs on zero bytes of its own JavaScript.
//
// WHAT THE FIVE SUSPENSE HOLES COST IS ONE REQUEST, not five. `systemCached` is
// keyed by the slug, so the first caller fills it and the rest read the fill;
// everything outside those holes is prose from the repository and prerenders
// whole.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BuildPhases } from "@/components/case/BuildPhases";
import { CaseCrumb } from "@/components/case/CaseCrumb";
import { CaseEyebrow } from "@/components/case/CaseEyebrow";
import { CaseHero } from "@/components/case/CaseHero";
import { ComposeExcerpt } from "@/components/case/ComposeExcerpt";
import { Constraints } from "@/components/case/Constraints";
import { DecisionTable } from "@/components/case/DecisionTable";
import { Lanes } from "@/components/case/Lanes";
import {
  CaseCrumbLive,
  CaseEyebrowLive,
  MetricRowLive,
  OpsLive,
  SpecRailLive,
} from "@/components/case/Live";
import { MetricRow } from "@/components/case/MetricRow";
import { NextSystem } from "@/components/case/NextSystem";
import { EMPTY_GRID, OpsSection } from "@/components/case/OpsSection";
import { Pipeline } from "@/components/case/Pipeline";
import { RequestPath } from "@/components/case/RequestPath";
import { Result } from "@/components/case/Result";
import { SpecRail } from "@/components/case/SpecRail";
import { SectionHead } from "@/components/ui/SectionHead";
import { CASE_STUDIES, caseStudyFor, caseStudyPath } from "@/content/case-studies/index";
import { metricTiles } from "@/lib/api/systems";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { seoFor } from "@/lib/seo/pages";

// THE SLUGS ARE KNOWN AT BUILD TIME, and saying so is not an optimisation — it
// is what makes the route prerenderable at all. Without this list Next has to
// build a shell for the literal segment `[slug]`, and the header's `usePathname()`
// then has no pathname to read: "Next.js encountered URL data usePathname() in a
// Client Component outside of <Suspense>", five times, and the build stops. The
// same shape as `generateStaticParams` in app/[lang]/layout.tsx, and for the
// same reason.
//
// It is NOT the complete list of segments the router will accept — Turbopack
// refuses `dynamicParams: false` under cacheComponents, exactly as the layout
// records. An unknown slug therefore reaches this component and leaves through
// `notFound()` below.
export function generateStaticParams() {
  return CASE_STUDIES.map((study) => ({ slug: study.slug }));
}

// The two systems the seed creates are not two case studies: `vat-check` is
// queued, has no repository and nothing written about it, so it has no page.
// The registry is the gate, and `caseStudyFor` is the only thing that decides
// which segments exist — an unknown one is a 404 before anything leaves this
// container. lib/http/url.ts proves a segment is safe to put in a URL; this
// proves the page was meant to exist, which is the half a character guard
// cannot give.
export async function generateMetadata({ params }: PageProps<"/[lang]/work/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const study = caseStudyFor(slug);
  if (study === null) notFound();

  return seoFor(asLocale(lang), caseStudyPath(study));
}

export default async function Page({ params }: PageProps<"/[lang]/work/[slug]">) {
  const { slug } = await params;
  const study = caseStudyFor(slug);
  if (study === null) notFound();

  const { locale, messages } = await getDictionary();
  const backHref = localeHref(locale, "/work");

  // Everything below this line is in the repository. The five `<Suspense>`
  // holes are the only places the api is asked, and each fallback is the same
  // component in its resting state — never a spinner and never a blank, because
  // "no answer yet" and "no answer at all" look the same to a reader and this
  // page has to be honest about both.
  return (
    <>
      <Suspense fallback={<CaseCrumb href={backHref} back={messages.navWork} label={study.slug} />}>
        <CaseCrumbLive slug={study.slug} href={backHref} back={messages.navWork} />
      </Suspense>

      <div className="cs-spec cs-head">
        <CaseHero
          eyebrow={
            <Suspense
              fallback={<CaseEyebrow systemNo={null} name={study.slug} state={null} messages={messages} />}
            >
              <CaseEyebrowLive slug={study.slug} name={study.slug} messages={messages} />
            </Suspense>
          }
          headline={study.headline}
          lead={study.lead}
          alert={study.alert}
        />

        <Suspense
          fallback={
            <SpecRail
              role={study.role}
              stack={null}
              year={study.year}
              state={null}
              hosting={study.hosting}
              source={null}
              messages={messages}
            />
          }
        >
          <SpecRailLive
            slug={study.slug}
            role={study.role}
            year={study.year}
            hosting={study.hosting}
            messages={messages}
          />
        </Suspense>
      </div>

      <div className="cs-metrics">
        <Suspense fallback={<MetricRow tiles={metricTiles(null, messages)} note={study.emptyNote} />}>
          <MetricRowLive slug={study.slug} note={study.emptyNote} messages={messages} />
        </Suspense>
      </div>

      <section className="cs-section" aria-labelledby="sec-01">
        {/* The head spans both columns and the body below it is the two-column
            row — that is how the sheet draws it, and it is also the only way the
            hairline reaches the full content width. `.cs-prob` is the 380px
            rail; the hero above uses the 400px one. */}
        <SectionHead id="01" title={messages.csProblem} titleId="sec-01" />

        <div className="cs-prob">
          <div className="cs-prose">
            {study.problem.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          <Constraints items={study.constraints} label={messages.csConstraints} />
        </div>
      </section>

      {/* H2a. NEITHER SECTION IS BEHIND A SUSPENSE BOUNDARY, and that is the
          shape of the phase rather than an omission: nothing below reads
          /api/systems/{slug}. The request path, the decisions and the phases are
          prose from content/case-studies; the compose block is a build artefact
          written by `make gen`. So this half of the page prerenders whole, costs
          no upstream call, and adds nothing to the initial JS. */}
      <section className="cs-section" aria-labelledby="sec-02">
        <SectionHead id="02" title={messages.csArchitecture} titleId="sec-02" />

        {/* Full width, unlike `.01` and `.03`. The Template draws no rail beside
            the path: five stations across the content column is the picture, and
            a 380px column taken out of it would break the row at 1440 before any
            breakpoint did. */}
        <RequestPath
          hops={study.architecture.hops}
          lanes={study.architecture.lanes}
          lanesLabel={messages.csSideLanes}
        />

        <DecisionTable
          rows={study.architecture.decisions}
          caption={messages.csDecisions}
          headings={{
            decision: messages.csDecision,
            alternative: messages.csAlternative,
            why: messages.csWhyThisOne,
          }}
        />
      </section>

      <section className="cs-section" aria-labelledby="sec-03">
        <SectionHead id="03" title={messages.csBuild} titleId="sec-03" />

        {/* `.cs-arch` — 1fr and a 420px rail with a 60px gap, copied into
            layout.css in G1 and without a consumer until now. Its name says
            architecture and its measurements say this row: the Template draws
            `grid-template-columns:1fr 420px;gap:60px;align-items:start` exactly
            once, here, around the compose block and the phases. The same rule
            that settled the five tiles in H1a — when the sheets and the shipped
            stylesheet disagree, the stylesheet is the one that was executed. */}
        <div className="cs-arch">
          <ComposeExcerpt caption={study.build.composeCaption} />

          <BuildPhases phases={study.build.phases} label={messages.csPhases} />
        </div>
      </section>

      {/* H2b. The one section on this page with a measured half and a written
          half standing next to each other: the pipeline and the observability
          panel are prose, the grid and the incident log are the answer.

          WHAT IS NOT HERE is the Template's DATA SAFETY panel — backup target,
          backup schedule, the date of the last restore drill, where the secrets
          live. Three of those four are named in the `Operations` sheet's own
          list of what must not be published, and CLAUDE.md's rule is wider. It
          is left out rather than drawn as `— NO DATA`, because an em dash says a
          number is coming and this one is being withheld. ADR 0057. */}
      <section className="cs-section" aria-labelledby="sec-04">
        <SectionHead id="04" title={messages.csOperations} titleId="sec-04" />

        <Pipeline stages={study.operations.stages} label={messages.csPushToLive} />

        <Lanes lanes={study.operations.observability} label={messages.csObservability} />

        <Suspense
          fallback={
            <OpsSection
              grid={EMPTY_GRID}
              incidents={null}
              label={messages.csOperation}
              messages={messages}
            />
          }
        >
          <OpsLive slug={study.slug} gridLabel={messages.csOperation} messages={messages} />
        </Suspense>
      </section>

      <section className="cs-section" aria-labelledby="sec-05">
        <SectionHead id="05" title={messages.csResult} titleId="sec-05" />

        <Result
          holds={study.result.holds}
          change={study.result.change}
          holdsLabel={messages.csWhatHolds}
          changeLabel={messages.csWhatIdChange}
        />

        <NextSystem
          next={study.result.next}
          label={messages.csNextSystem}
          href={backHref}
          more={messages.navWork}
        />
      </section>
    </>
  );
}
