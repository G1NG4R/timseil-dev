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
// ONE SUSPENSE HOLE, NOT FIVE. The case study has five because it has five
// measured regions; this page has one thing to ask and one place to put the
// answer. Everything else — the hero, the four section shells and their reasons
// — is in the repository and prerenders whole.

import type { Metadata } from "next";
import { Suspense } from "react";

import { Hero } from "@/components/home/Hero";
import { TerminalPanelLive } from "@/components/home/Live";
import { TerminalPanel } from "@/components/home/TerminalPanel";
import { JsonLd } from "@/components/JsonLd";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { siteLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { asLocale } from "@/lib/i18n/routes";
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
  const { resolved, messages } = await getDictionary();

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
    </>
  );
}
