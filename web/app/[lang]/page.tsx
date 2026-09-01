// Server Component by default — no 'use client' here and none without a
// comment saying why, anywhere. The homepage costs the initial bundle nothing:
// #237 measured 143 581 B of a 150 000 B budget before any page existed.
//
// THE ORDER OF THIS FILE IS THE ONE BINDING THING ABOUT IT. HOME.01 of the
// Homepage sheet: Hero → SYS.01 → SYS.02 → SYS.03 → SYS.04 → footer, and the
// build plan repeats it — "Reihenfolge ist in HOME.01 verbindlich, die Marker
// müssen aufsteigend stehen." The sheet also states the test: "die vier Marker
// müssen auf der Seite in aufsteigender Reihenfolge stehen. Das ist der ganze
// Test." lib/home/sections.ts is that list, and it is in lib/ so that
// `node --test` can hold it.
//
// THE ISLAND MOVED, IT DID NOT GO. Since F1b this page has carried the only
// call on this site that reaches the api with a visitor's request id and a
// child span attached, and that phase's acceptance reads it. It is now the api
// row inside the terminal frame — components/home/Live.tsx, which explains why
// that is its home and not merely its hiding place.
//
// THREE SUSPENSE HOLES SINCE H5a, AND TWO OF THEM ARE WHOLE SECTIONS. The
// terminal row asks the api one question and puts the answer in one word; the
// training log asks a second and puts the answer in twenty-two rows, five
// cards and the counts in its own heading; the system list asks a third and
// puts its count in its heading too. That is why those regions begin at the
// section head rather than under it — components/home/TrainingLog.tsx has the
// argument and components/home/Systems.tsx repeats it.
//
// Everything else — the hero, the two remaining shells and their reasons — is
// in the repository and prerenders whole. The case study has five holes because
// it has five measured regions; this page now has three.

import type { Metadata } from "next";
import { Suspense } from "react";

import { Hero } from "@/components/home/Hero";
import { SysSection } from "@/components/home/SysSection";
import { Systems } from "@/components/home/Systems";
import { SystemsLive } from "@/components/home/SystemsLive";
import { TrainingLive } from "@/components/home/Training";
import { TrainingLog } from "@/components/home/TrainingLog";
import { TerminalPanelLive } from "@/components/home/Live";
import { TerminalPanel } from "@/components/home/TerminalPanel";
import { JsonLd } from "@/components/JsonLd";
import { SECTIONS } from "@/lib/home/sections";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { siteLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { stateLabel } from "@/lib/state/words";

// The canonical, the four `hreflang` links, the feed and the social card — one
// call, out of the table in lib/seo/pages.ts.
//
// `/` IS THE ONE ROUTE WITH NO `robots` REFUSAL, and it is the only entry in
// `sitemap.xml`. Both follow from the same boolean: the six stubs are
// `indexable: false` and this one is not.
export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/");
}

export default async function Home() {
  // `resolved` is the language the STRINGS on this page are in, which is not
  // always the language of the route: `/de` serves English until P6 fills the
  // dictionary. The graph gets that value rather than the route's, so it never
  // claims a translation the page does not have.
  const { locale, resolved, messages } = await getDictionary();

  return (
    <>
      {/* Person and WebSite, on `/` only. The six stubs say `noindex`, so a
          graph on them would describe a page nothing is allowed to list. */}
      <JsonLd data={siteLd(resolved)} />

      {/* The row is the page's, not the hero's — `.cs-spec` belongs to the case
          study for the same reason. A component that owned the row would own
          the 1080 switch with it, and layout.css owns every switch here. */}
      <div className="hero hero-head">
        <Hero
          eyebrow={messages.homeEyebrow}
          headline={messages.homeHeadline}
          tagline={messages.homeTagline}
          available={stateLabel("available", messages)}
          availability={messages.homeAvailability}
        />

        {/* The fallback is the same frame with `status={null}`, which renders
            `— NO DATA`. Never a spinner and never a blank: "no answer yet" and
            "no answer at all" look the same to a reader, and this page has to
            be honest about both. */}
        <Suspense fallback={<TerminalPanel status={null} messages={messages} />}>
          <TerminalPanelLive messages={messages} />
        </Suspense>
      </div>

      {/* THE ORDER IS NOT WRITTEN HERE, and that is the point. HOME.01 is
          lib/home/sections.ts and a unit test holds it against a second
          transcription of the sheet, because four markers written out by hand
          in a page are four markers somebody can reorder without disagreeing
          with anything. K-26 records that happening once already. */}
      {SECTIONS.map((section) => {
        // TWO SECTIONS WITH COMPONENTS OF THEIR OWN, and the branch is still on
        // the id rather than on `reasonKey === null` because the id is what
        // decides WHICH component — the nullable field only says THAT there is
        // one.
        //
        // STILL NOT A LOOKUP TABLE, and H4's own comment here predicted the
        // wrong thing. It said H5 "is the phase in which this probably becomes a
        // lookup"; with two entries a table would be a map from a string to a
        // closure, read once, right beside the two `if`s it replaced. H5c is
        // where the question is worth asking again, because there the four
        // branches stand together and the shape of the fourth is known.
        //
        // The head is inside each streamed region and not above it, because its
        // meta line carries that answer's own counts. TrainingLog says why, and
        // Systems repeats it for its own count.
        if (section.id === "SYS.01") {
          return (
            <Suspense key={section.id} fallback={<TrainingLog body={null} messages={messages} />}>
              <TrainingLive messages={messages} />
            </Suspense>
          );
        }

        if (section.id === "SYS.02") {
          // The exit comes off the same list the shells read it from, so the
          // section keeps its way out when /api/systems does not answer. H5a
          // dropped it once by swapping the component and not the link.
          const exit =
            section.exit === null
              ? null
              : {
                  href: localeHref(locale, section.exit.path),
                  label: messages[section.exit.labelKey],
                };

          return (
            <Suspense
              key={section.id}
              fallback={<Systems body={null} exit={exit} messages={messages} />}
            >
              <SystemsLive exit={exit} messages={messages} />
            </Suspense>
          );
        }

        // Held by sections.test.ts: a section is either filled or owed, never
        // neither. A shell therefore has a reason, and this is that assertion
        // in the one place the type cannot make it.
        if (section.reasonKey === null) return null;

        return (
          <SysSection
            key={section.id}
            id={section.id}
            title={section.title}
            titleId={`sec-${section.id.toLowerCase().replace(".", "-")}`}
            reason={messages[section.reasonKey]}
            exit={
              section.exit === null
                ? null
                : {
                    href: localeHref(locale, section.exit.path),
                    label: messages[section.exit.labelKey],
                  }
            }
          />
        );
      })}
    </>
  );
}
