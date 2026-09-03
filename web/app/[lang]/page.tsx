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
// STILL THREE SUSPENSE HOLES AFTER H5c, AND THE FOURTH SECTION HAS NONE. SYS.04
// reads files that are in the image rather than an endpoint, so it is
// prerendered whole with the hero and the shell — components/home/Log.tsx says
// what that buys, and it is more than one less file: it is the first section
// since H3 the end-to-end rig can measure on this page instead of in the gallery.
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
import { Suspense, type ReactNode } from "react";

import { Bio } from "@/components/home/Bio";
import { Hero } from "@/components/home/Hero";
import { Log } from "@/components/home/Log";
import { Systems } from "@/components/home/Systems";
import { SystemsLive } from "@/components/home/SystemsLive";
import { ContributionGraph } from "@/components/home/ContributionGraph";
import { ContributionGraphLive } from "@/components/home/ContributionGraphLive";
import { OpsStrip } from "@/components/home/OpsStrip";
import { OpsStripLive } from "@/components/home/OpsStripLive";
import { Uplink } from "@/components/home/Uplink";
import { TrainingLive } from "@/components/home/Training";
import { TrainingLog } from "@/components/home/TrainingLog";
import { TerminalPanelLive } from "@/components/home/Live";
import { TerminalPanel } from "@/components/home/TerminalPanel";
import { JsonLd } from "@/components/JsonLd";
import { homePosts } from "@/lib/home/posts";
import { SECTIONS } from "@/lib/home/sections";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { siteLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { SITE_SYSTEM_SLUG } from "@/lib/site";
import { caseStudyFor, caseStudyPath } from "@/content/case-studies/index";
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

  // The exit off the same list the sections declare it on, so a section keeps
  // its way out when its source does not answer. H5a dropped SYS.02's once by
  // swapping the component and not the link.
  //
  // BY ID AND NOT BY INDEX. `SECTIONS[1]` would be a second place that knows
  // the order, and the order is HOME.01's — the marker is the key everywhere
  // else on this page, including in the table below.
  const exitFor = (id: string) => {
    const exit = SECTIONS.find((section) => section.id === id)?.exit ?? null;
    return exit === null
      ? null
      : { href: localeHref(locale, exit.path), label: messages[exit.labelKey] };
  };

  // The study this site's own log points at. `caseStudyFor` is the gate in front
  // of /work/[slug] and the only list of which systems have a page, so asking it
  // is the same question the route asks — and `null` here is a head with no link
  // rather than a link to a 404.
  const study = caseStudyFor(SITE_SYSTEM_SLUG);

  // One object, handed to both the fallback and the answer. Two calls would give
  // the waiting page and the answered page two links that merely agree.
  const systemsExit = exitFor("SYS.02");

  // A LOOKUP TABLE AT LAST, AND H4's COMMENT HERE PREDICTED IT TWO PHASES EARLY.
  // It said H5 was "the phase in which this probably becomes a lookup", and H5a
  // and H5b both answered no with the same argument: at two and at three entries
  // a table is a map from a string to a closure, read once, standing beside the
  // `if`s it replaced.
  //
  // WHAT CHANGED IS NOT THE COUNT, IT IS THE FALLTHROUGH. Until this phase the
  // chain ended in a fourth shape — the `[SOON]` shell, rendered from
  // `reasonKey` for whichever section had not been built — so the `if`s were not
  // four cases of one kind but three exceptions in front of a default. With
  // SYS.04 built there is no default left, and four keys with no fallthrough is
  // a table by definition. components/home/SysSection.tsx went with it.
  //
  // A MISSING KEY WOULD DROP A SECTION SILENTLY, and the thing that catches it
  // is already written: e2e/home.spec.ts reads the four markers off the rendered
  // page and asserts they are HOME.01's, in HOME.01's order. A table with three
  // entries fails that test on its first run rather than shipping a page with a
  // hole where a marker belongs.
  const drawn: Record<string, ReactNode> = {
    // THE HEAD IS INSIDE THE FIRST TWO REGIONS AND OUTSIDE THE THIRD, and that
    // is a difference worth reading rather than a slip. SYS.01 and SYS.02 put
    // their heads in the stream because the meta line carries the answer's own
    // count. SYS.03's meta carries a statement instead, so it is prerendered —
    // and its two blocks stream under it separately, because they read two
    // endpoints with two freshnesses.
    "SYS.01": (
      <Suspense key="SYS.01" fallback={<TrainingLog body={null} messages={messages} />}>
        <TrainingLive messages={messages} />
      </Suspense>
    ),

    "SYS.02": (
      <Suspense
        key="SYS.02"
        fallback={<Systems body={null} exit={systemsExit} messages={messages} />}
      >
        <SystemsLive exit={systemsExit} messages={messages} />
      </Suspense>
    ),

    // TWO BOUNDARIES INSIDE ONE SECTION, the first on this site. The fallback of
    // each is its own component in its resting state, which is the ADR 0044
    // split every streamed region here uses — and it is what lets
    // /dev/components draw both with no api at all.
    "SYS.03": (
      <Uplink
        key="SYS.03"
        graph={
          <Suspense fallback={<ContributionGraph body={null} messages={messages} />}>
            <ContributionGraphLive messages={messages} />
          </Suspense>
        }
        strip={
          <Suspense fallback={<OpsStrip body={null} messages={messages} />}>
            <OpsStripLive messages={messages} />
          </Suspense>
        }
      />
    ),

    // NO BOUNDARY AND NO FALLBACK, because there is nothing to wait for: the
    // entries are files in this image. It is the one section on this page whose
    // emptiness would be a build that shipped without its own content, and
    // lib/home/posts.ts turns that into the `null` its head reports.
    "SYS.04": (
      <Log
        key="SYS.04"
        read={homePosts()}
        caseStudyHref={study === null ? null : localeHref(locale, caseStudyPath(study))}
        exit={exitFor("SYS.04")}
        messages={messages}
      />
    ),
  };

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
          availability={messages.availability}
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
      {SECTIONS.map((section) => drawn[section.id] ?? null)}

      {/* THE LAST BLOCK INSIDE `<main>`, and not a fifth marker. HOME.01 counts
          four; the foot is the sixth item of its sequence and carries no
          `SYS.NN`. Everything below it — the address, the profiles, the meta bar
          — is the chrome's long footer and has shipped since G3. */}
      <Bio
        text={messages.homeBio}
        about={{ href: localeHref(locale, "/about"), label: messages.navAbout }}
      />
    </>
  );
}
