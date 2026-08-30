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
// SECTIONS .02 TO .05 ARE H2's — architecture, build, operations, result, and
// the 91-day grid with its clickable notches. This file ends after `.01
// PROBLEM`, and `coverage()` is the reason the uptime tile can stand here at all
// without the grid beside it: it says how much of the window was measured.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CaseCrumb } from "@/components/case/CaseCrumb";
import { CaseEyebrow } from "@/components/case/CaseEyebrow";
import { CaseHero } from "@/components/case/CaseHero";
import { Constraints } from "@/components/case/Constraints";
import { CaseCrumbLive, CaseEyebrowLive, MetricRowLive, SpecRailLive } from "@/components/case/Live";
import { MetricRow } from "@/components/case/MetricRow";
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

  // Everything below this line is in the repository. The four `<Suspense>`
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

      <section>
        {/* The head spans both columns and the body below it is the two-column
            row — that is how the sheet draws it, and it is also the only way the
            hairline reaches the full content width. `.cs-prob` is the 380px
            rail; the hero above uses the 400px one. */}
        <SectionHead id="01" title={messages.csProblem} />

        <div className="cs-prob">
          <div className="cs-prose">
            {study.problem.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          <Constraints items={study.constraints} label={messages.csConstraints} />
        </div>
      </section>
    </>
  );
}
