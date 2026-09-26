// The case study. Build plan H1 — the page that is the argument, and the first
// route on this site that is allowed to be indexed besides `/`.
//
// EXCEPT IT IS NO LONGER THE ARGUMENT, and U6 is the phase that took the word
// back. Chapter 12.1 said "die Fallstudie **ist** die Systemdokumentation,
// öffentlich und datengetrieben", and the second half of that sentence was the
// only half this page could keep: every number here comes out of
// `/api/systems/{slug}`, which anyone can curl, and the argument that used to
// stand beside them was typed by an assistant on the author's behalf. ADR 0079 §4
// said that about the log and named no other directory; ADR 0081 is where it was
// extended to this one, and it states what may stand here until Tim writes the
// rest — what a system produces, or what a check holds, and nothing else.
//
// SO THE PAGE IS FIVE MEASUREMENTS AND TWO SENTENCES. The crumb, the eyebrow, the
// spec rail, the five tiles and the 91-day grid with its incident log all come
// from one answer. The compose block is cut out of `compose.yaml` by `make gen`.
// The pipeline is seven names that lib/content/pipeline.test.ts holds against
// `.github/workflows/ci.yml`. The `<h1>` and the caption are the two lines a
// person typed, and both are about the system rather than about its author.
//
// THE EMPTY STATE IS STILL THE ONE THAT SHIPS FIRST, and it is not an oversight:
// api/internal/seed/seed.sql writes no measurements, so against a fresh database
// this page renders `— NO DATA` five times under an amber note explaining that
// it will. Case Study 02 draws exactly that.
//
// THE NOTCH IS AN ANCHOR AND NOT A BUTTON — `:target` marks the one that was
// opened, and components/case/OpsGrid.tsx argues it. With `incidents: []` in
// production a click-to-open panel would be a component shipped to every visitor
// that nothing can open. So this route still runs on zero bytes of its own
// JavaScript, and U6 removed nothing that would have changed that.
//
// WHAT THE FIVE SUSPENSE HOLES COST IS ONE REQUEST, not five. `systemCached` is
// keyed by the slug, so the first caller fills it and the rest read the fill;
// everything outside those holes is prose from the repository and prerenders
// whole.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CaseCrumb } from "@/components/case/CaseCrumb";
import { CaseEyebrow } from "@/components/case/CaseEyebrow";
import { CaseHero } from "@/components/case/CaseHero";
import { ComposeExcerpt } from "@/components/case/ComposeExcerpt";
import {
  CaseCrumbLive,
  CaseEyebrowLive,
  MetricRowLive,
  OpsLive,
  SpecRailLive,
} from "@/components/case/Live";
import { MetricRow } from "@/components/case/MetricRow";
import { EMPTY_GRID, NO_POST_HREFS, OpsSection } from "@/components/case/OpsSection";
import { Pipeline } from "@/components/case/Pipeline";
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

// The two systems the seed creates are not two case studies: `talos-prod` is
// in_build, its repository is private and nothing is written about it, so it
// has no page.
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

  // The five `<Suspense>` holes are the only places the api is asked, and each
  // fallback is the same component in its resting state — never a spinner and
  // never a blank, because "no answer yet" and "no answer at all" look the same
  // to a reader and this page has to be honest about both. U7 separates the two.
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
        />

        <Suspense
          fallback={
            <SpecRail
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

      {/* `.01` USED TO BE `.03`, and the numbers are renumbered rather than left
          with gaps: they are visible, and a page that opens at `.03` claims two
          sections a reader cannot find. The head spans the content column and the
          block runs its full width — `.cs-arch` stood here, a 1fr/420px row with
          the build phases in the rail, and with the phases gone the rail would be
          the empty frame this phase's acceptance criterion forbids. */}
      <section className="cs-section" aria-labelledby="sec-01">
        <SectionHead id="01" title={messages.csBuild} titleId="sec-01" />

        <ComposeExcerpt caption={study.composeCaption} />
      </section>

      {/* The one section with a written half and a measured half standing next to
          each other: the pipeline is seven names held against the workflow, the
          grid and the incident log are the answer.

          WHAT IS NOT HERE is the Template's DATA SAFETY panel — backup target,
          backup schedule, the date of the last restore drill, where the secrets
          live. Three of those four are named in the `Operations` sheet's own
          list of what must not be published, and CLAUDE.md's rule is wider. It
          is left out rather than drawn as `— NO DATA`, because an em dash says a
          number is coming and this one is being withheld. ADR 0057. */}
      <section className="cs-section" aria-labelledby="sec-02">
        <SectionHead id="02" title={messages.csOperations} titleId="sec-02" />

        <Pipeline stages={study.stages} label={messages.csPushToLive} />

        <Suspense
          fallback={
            <OpsSection
              grid={EMPTY_GRID}
              incidents={null}
              postHrefs={NO_POST_HREFS}
              label={messages.csOperation}
              messages={messages}
            />
          }
        >
          <OpsLive
            slug={study.slug}
            locale={locale}
            gridLabel={messages.csOperation}
            messages={messages}
          />
        </Suspense>
      </section>
    </>
  );
}
