// Server Component by default — no 'use client' here and none without a
// comment saying why, anywhere.
//
// This page exists so that `make dev` can prove hot reload on the web side.
// The homepage itself is stage H; nothing about it is decided here.
//
// SINCE F1B IT ALSO MAKES THE HOP. The island below is the only reason web talks
// to the api with a visitor's ids attached, and it is what that phase's
// acceptance reads: one request to `/` has to leave a line in this container and
// a line in the api's, joined by one trace id.
//
// H3 REPLACES THE CONTENT, NOT THE ISLAND. A correlated, uncached call has to
// survive somewhere on this page: the footer's numbers come from a shared cached
// answer that by construction carries nobody's request id (lib/api/readers.ts),
// so if this island goes, the hop stops being findable and no test says so.

import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { Hero } from "@/components/home/Hero";
import { JsonLd } from "@/components/JsonLd";
import { NoData } from "@/components/state/NoData";
import { StatusDot } from "@/components/state/StatusDot";
import { footerHealth } from "@/lib/api/health";
import { healthLive } from "@/lib/api/readers";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Messages } from "@/lib/i18n/messages";
import { asLocale } from "@/lib/i18n/routes";
import { siteLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { systemWord } from "@/lib/state/derive";
import { stateLabel } from "@/lib/state/words";

// `export const dynamic = "force-dynamic"` stood here until G4. Under Cache
// Components it is an error rather than a hint — every page is dynamic unless
// something is cached — and the job it did is now done by the <Suspense>
// boundary: the shell prerenders, the correlated call waits for a request.
//
// `const NO_DATA = "— NO DATA"` stood here too, a second copy of the string
// lib/api/health.ts already held. G6 gave it one home and one component: two
// literals of this site's most load-bearing sentence, either of which could
// have been edited alone, were one edit away from disagreeing.

// The canonical, the four `hreflang` links, the feed and the social card — one
// call, out of the table in lib/seo/pages.ts.
//
// `/` IS THE ONE ROUTE WITH NO `robots` REFUSAL, and it is the only entry in
// `sitemap.xml`. Both follow from the same boolean now: the six stubs are
// `indexable: false` and this one is not. It is also the address the Rich
// Results test reads, which is this phase's acceptance criterion.
export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/");
}

export default async function Home() {
  // `resolved` is the language the STRINGS on this page are in, which is not
  // always the language of the route: `/de` serves English until P6 fills the
  // dictionary. The graph gets that value rather than the route's, so it never
  // claims a translation the page does not have — and starts claiming one by
  // itself on the day the dictionary is filled.
  const { resolved, messages } = await getDictionary();

  return (
    <>
      {/* Person and WebSite, on `/` only. The six stubs say `noindex`, so a
          graph on them would describe a page nothing is allowed to list. */}
      <JsonLd data={siteLd(resolved)} />

      <div className="hero-head">
        <Hero
          eyebrow={messages.homeEyebrow}
          headline={messages.homeHeadline}
          tagline={messages.homeTagline}
          available={stateLabel("available", messages)}
          availability={messages.homeAvailability}
        />
      </div>

      {/* Still the F1b island, unchanged, and it moves in the next commit. It
          is the only correlated, uncached call on this site; the header above
          this file says what happens if it disappears. */}
      <dl>
        <Suspense fallback={<HealthRows status={<NoData />} build={<NoData />} />}>
          <HealthRowsLive messages={messages} />
        </Suspense>
      </dl>
    </>
  );
}

function HealthRows({ status, build }: { status: ReactNode; build: ReactNode }) {
  return (
    <>
      <dt>api</dt>
      <dd>{status}</dd>
      <dt>version</dt>
      <dd>{build}</dd>
    </>
  );
}

/**
 * The hop, with this visitor's request id and a child span on it.
 *
 * Invariant 1, and this is still the first place in web where it applies: a
 * number or a name this page cannot get from the api is absent, never zero and
 * never an empty string pretending to be one. The reading of the body is
 * lib/api/health.ts's, so this page and the footer cannot disagree about what a
 * missing field means.
 */
async function HealthRowsLive({ messages }: { messages: Messages }) {
  const body = await healthLive();
  if (body === null) return <HealthRows status={<NoData />} build={<NoData />} />;

  const { build } = footerHealth(body);

  // LIVE, not ONLINE, and the difference is the subject: this row is under a
  // `<dt>api</dt>` and is about one system, while the footer's bar is about the
  // delivery of this page. STATE.05 keeps the two words apart on purpose, and
  // lib/state/derive.ts is where that choice is made rather than here.
  //
  // Until G6 this printed `body.status` — the raw contract word, `ok`, straight
  // into the interface. The wire format is not a vocabulary a reader has.
  const word = systemWord(body.status);

  return (
    <HealthRows
      status={
        word === null ? <NoData /> : <StatusDot state={word} label={stateLabel(word, messages)} />
      }
      build={build ?? <NoData />}
    />
  );
}
