// `/about` — the operator, and the third page on this site that is allowed to
// be indexed.
//
// THE STUB THAT STOOD HERE IS GONE. It shipped in G3 so the chrome could prove
// three things a 404 cannot show — the active entry is white, nothing is active
// on `/`, and the footer comes in two versions — and its own comment said what
// this phase does with it: "H7 REPLACES this file. Nothing here is a decision
// about the page."
//
// NO SUSPENSE, AND NO `await` ON AN ENDPOINT. This is the first page of stage H
// that reads nothing: every word comes from lib/about/ and lib/i18n/, so the
// whole route prerenders into the static shell and there is no fallback to
// design, no region to settle and no `— NO DATA` to reach. It is worth saying
// out loud because the last four pages all needed one, and a reader of this file
// would otherwise look for the hole.
//
// AND THE ONE CONTROL ON THE PAGE STILL COSTS NOTHING. H7a cut at the operable
// boundary the way H6a did, expecting H7b to spend the budget on an island.
// H7b did not: the rail is a radio group, so this route is Server Components
// end to end and `/about` stays byte-identical to `/`. ADR 0066.

import type { Metadata } from "next";

import { AboutHero } from "@/components/about/AboutHero";
import { OperatorCard } from "@/components/about/OperatorCard";
import { Principles } from "@/components/about/Principles";
import { StackTiles } from "@/components/about/StackTiles";
import { TrajectoryPanel } from "@/components/about/TrajectoryPanel";
import { TrajectoryRail } from "@/components/about/TrajectoryRail";
import { JsonLd } from "@/components/JsonLd";
import { EmptyState } from "@/components/state/EmptyState";
import { SectionHead } from "@/components/ui/SectionHead";
import { caseStudyFor, caseStudyPath } from "@/content/case-studies/index";
import { SECTIONS } from "@/lib/about/sections";
import { STATIONS } from "@/lib/about/trajectory";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { aboutLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { SITE_SYSTEM_SLUG } from "@/lib/site";
import { SOON, stateLabel } from "@/lib/state/words";

import type { ReactNode } from "react";

// SEO, in one call, out of the table in lib/seo/pages.ts — where `/about` is
// `indexable: true` as of this phase. The stub wrote `robots: { index: false }`
// because a crawler that found `ABOUT [SOON]` would file that away as what this
// site has to say on the subject. It has something to say now, and
// app/sitemap.ts picks the page up from the same boolean with no edit.
export async function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/about");
}

/** The id of the head that names a section, so a landmark and a control can
 *  both point at the one title already on the screen. */
function titleIdFor(id: string): string {
  return `about-${id.replaceAll(".", "-")}`;
}

export default async function Page() {
  // `resolved` is the language the STRINGS on this page are in, which is not
  // always the language of the route: `/de` serves English until P6 fills the
  // dictionary. The graph gets that value rather than the route's, so it never
  // claims a translation the page does not have.
  const { locale, resolved, messages } = await getDictionary();

  // The evidence SYS.05.02 points at. `caseStudyFor` is the gate in front of
  // /work/[slug] and the only list of which systems have a page, so asking it
  // is the same question the route asks — and `null` here is a sentence with no
  // link rather than a link to a 404. The homepage resolves its log head the
  // same way and for the same reason.
  const study = caseStudyFor(SITE_SYSTEM_SLUG);

  // WHY A TABLE AND NOT FOUR `if`s: the same argument app/[lang]/page.tsx
  // reached in H5c. Four keys with no fallthrough is a table by definition, and
  // a missing key would drop a section silently — which e2e/about.spec.ts
  // catches by reading the markers back off the rendered page and holding them
  // against the sheet's order, exactly as home.spec.ts does for HOME.01.
  // THE PANELS ARE BUILT HERE AND HANDED TO THE RAIL AS NODES. The rail owns
  // the selection, the stylesheet owns which panel that reveals, and neither
  // knows what a panel contains — the seam ADR 0064 drew for the work index,
  // kept in a phase that needed no island to keep it.
  //
  // `caseStudyFor` GATES THE ONE LINK, and it is the same question `/work/[slug]`
  // asks: a station whose system has no page gets no shipped cell rather than a
  // link into a 404. Invariant 5.
  const panels = STATIONS.map((station) => {
    const study = station.shipped === null ? null : caseStudyFor(station.shipped.slug);
    return (
      <TrajectoryPanel
        key={station.key}
        station={station}
        soon={messages.aboutStationSoon}
        pickedUp="PICKED UP"
        shippedLabel="SHIPPED"
        href={study === null ? null : localeHref(locale, caseStudyPath(study))}
      />
    );
  });

  const drawn: Record<string, ReactNode> = {
    "SYS.05.01": (
      <TrajectoryRail name="tl" labelledBy={titleIdFor("SYS.05.01")} panels={panels} />
    ),
    "SYS.05.02": (
      <StackTiles
        note={messages.aboutStackNote}
        study={
          study === null
            ? null
            : {
                href: localeHref(locale, caseStudyPath(study)),
                label: messages.aboutCaseStudy,
              }
        }
      />
    ),
    "SYS.05.03": <Principles />,
    // K2. The one line on this page nobody can derive.
    "SYS.05.04": null,
  };

  return (
    <>
      {/* `.hero` is layout.css's two-column row and it belongs to the page, not
          to either component in it — the same split components/home/Hero.tsx
          makes. `.hero-head` is the vertical rhythm and is shared for the same
          reason: two heroes on this site, one pair of numbers, --s-72 over
          --s-96. */}
      <div className="hero hero-head">
        <AboutHero
          headline={messages.aboutHeadline}
          lede={messages.aboutLede}
          available={stateLabel("available", messages)}
          availability={messages.availability}
        />
        <OperatorCard />
      </div>

      {SECTIONS.map((section) => {
        // THE SECTION IS NAMED BY THE TITLE ALREADY ON THE SCREEN. SectionHead
        // renders a `<div>` rather than an `<h2>` — its own comment says why —
        // so `titleId` plus `aria-labelledby` is how a landmark gets a name
        // without a second sentence only some readers get. H2a is where three
        // unnamed `<section>`s turned out to be worse than none.
        const titleId = titleIdFor(section.id);
        return (
          <section className="about-section" key={section.id} aria-labelledby={titleId}>
            <SectionHead
              id={section.id}
              title={section.title}
              meta={section.meta ?? undefined}
              titleId={titleId}
            />
            {section.reasonKey === null ? (
              drawn[section.id]
            ) : (
              // `[SOON]` AND NOT `— NO DATA`. The two are different sentences
              // and lib/state/words.ts owns both: `— NO DATA` says a
              // measurement was attempted and did not arrive, `[SOON]` says the
              // thing does not exist yet. Nothing was measured here.
              <EmptyState heading={SOON} reason={messages[section.reasonKey]} />
            )}
          </section>
        );
      })}

      <JsonLd data={aboutLd(resolved, localeHref(locale, "/about"))} />
    </>
  );
}
