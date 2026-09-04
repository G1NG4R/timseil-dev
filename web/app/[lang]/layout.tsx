import type { Metadata } from "next";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeScript } from "@/components/ThemeScript";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LOCALES } from "@/lib/i18n/routes";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

import { fontVariables } from "../fonts";

// The stylesheet order is the whole point of this block, and it is the build
// plan's (G1), not a preference:
//
//   tailwind  utilities drawn from the tokens, no palette of its own
//   tokens    every colour, size, spacing, radius and duration — invariant 8
//   globals   reset, typography, focus, the three keyframes
//   chrome    the header, the menu and the footer — G3
//   state     the state language: dots, panels, empty and degraded — G6
//   ui        button, field, metric tile, section head — G7, site-wide since H1
//   case      the case study's own surfaces — H1
//   home      the homepage's own surfaces — H3
//   layout    the content column and the four breakpoints — LAST, so its
//             media queries win over anything above them
//
// chrome.css is the fifth file and it goes FOURTH, which is the part worth
// reading twice. It gives .nav-desktop and .nav-button their desktop values;
// layout.css's `@media (max-width: 899px)` has to keep overriding them. Put
// chrome after layout and the 900 switch inverts without a single error.
//
// Since G2 the faces arrive over next/font/google and reach `--display`,
// `--body` and `--mono` through the three `--face-*` variables the classes on
// <html> carry.
//
// The paths gained a `../` in G5, and nothing else about them changed: this
// file moved from `app/` into `app/[lang]/` when the language became part of
// the route. ADR 0046.
//
// state.css is sixth, and its position against chrome decides nothing: the two
// do not define the same selectors, and where the chrome adjusts a state — the
// footer and the menu strip draw a 6px dot where the rest of the site draws 7 —
// it does so through `.foot-cell .st`, which wins on specificity whatever the
// order. What does matter is the same thing that mattered in G1: it stays
// BEFORE layout.css. ADR 0048.
import "../../styles/tailwind.css";
import "../../styles/tokens.css";
import "../../styles/globals.css";
import "../../styles/chrome.css";
import "../../styles/state.css";
// ui.css was the gallery's alone until H1. Its own header set the condition —
// "the first H phase to use one moves the import to app/[lang]/layout.tsx — H1
// for MetricTile and SectionHead" — and the case study is that page.
//
// case.css sits between them for the reason the whole list exists: it may not
// override chrome or state, and layout.css's media queries have to win over it.
// Its one specificity-sensitive rule, the 52px h1, is written with `:where()`
// so that source order and not a class decides against globals and layout.
import "../../styles/ui.css";
import "../../styles/case.css";
// home.css sits beside case.css and under the same condition: it may not
// override the chrome or the state language, and layout.css's media queries
// have to win over it. H3.
import "../../styles/home.css";
// work.css joins them on the same condition, and it is the third page-scoped
// sheet rather than a new kind of file. H6. It declares no media query at all:
// `.work-row`'s three switches have been in layout.css since G1, waiting for a
// component to answer to them.
import "../../styles/work.css";
// about.css is the fourth page-scoped sheet and joins on the same condition.
// H7. Like work.css it declares no media query: the page answers to three of
// the four declared switches — 1080 for the hero it inherits, 900 for its two
// grids, 720 for the display step — and layout.css owns every one of them, as
// it owns every switch on this site.
import "../../styles/about.css";
// contact.css is the fifth page-scoped sheet and joins on the same condition.
// H8. Like work.css and about.css it declares no media query: the page answers
// to two of the four declared switches — 1080, where the form and its TX trace
// stop standing beside each other, and 720 for the display step — and
// layout.css owns both.
import "../../styles/contact.css";
// H9a. `/blog/<slug>`'s own surfaces. After contact.css, before layout.css, for
// the reason every page sheet is: it may not override the chrome or the state
// language, and layout.css's media queries have to win over its geometry.
import "../../styles/blog.css";
import "../../styles/layout.css";

// THE THREE LANGUAGES THAT GET PRERENDERED. Under Cache Components a root
// parameter MUST have at least one value here or the build fails outright —
// this list is what makes `/`, `/de` and `/fr` part of the static shell.
//
// IT IS NOT THE COMPLETE LIST, AND IT CANNOT BE MADE ONE HERE. The obvious
// companion is `export const dynamicParams = false`, which would have the
// router answer `/es/about` with a 404 before any component ran. Turbopack
// refuses it: "Route segment config 'dynamicParams' is not compatible with
// nextConfig.cacheComponents." So the refusal lives one layer down instead, in
// getDictionary() — `/es` reaches a component, that component calls notFound(),
// and the visitor gets the same 404. Measured, not assumed: the build said so.
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ lang: locale }));
}

export const metadata: Metadata = {
  // Every `canonical` and every `hreflang` on this site is resolved against
  // this. lib/site.ts explains why it is a constant and not an environment
  // variable: it is a claim about which address is the real one.
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
};

// NO `openGraph` AND NO `alternates` HERE, and that is the trap this phase
// walked into rather than around. Next merges these two FLAT: a page that sets
// `alternates` REPLACES the layout's instead of extending it, and its own
// example shows a page setting only `title` still emitting the layout's
// `og:title` (generate-metadata.md:1405-1418). Every page names its own
// canonical, so anything social put here would be dropped by all seven of them
// while looking perfectly correct in this file. lib/seo/pages.ts carries it.

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  // THE ROUTE CARRIES THE LANGUAGE, NOT THE HEADER, and that is the one
  // constraint G4 handed to this phase. `headers()` here would take every page
  // out of the static pass and cost the prerendered shell — the same trade ADR
  // 0043 made for the theme, which lives on the <html> element for the same
  // reason. `next/root-params` reads the segment, which is part of the URL and
  // therefore part of the prerender. lib/i18n/dictionaries.ts holds the call.
  //
  // `textLang` is the language the STRINGS are in, and it is `undefined`
  // whenever that is the route's own language — so a translated page carries no
  // extra attribute at all. In G5 it is `en` on `/de` and `/fr`, which is the
  // sheet's "KEINE HALBEN SEITEN" made visible in the markup rather than
  // explained in a comment.
  const { locale, messages, textLang } = await getDictionary();

  return (
    // suppressHydrationWarning is required, not tidy: ThemeScript writes
    // data-theme onto this element before React hydrates, and the server never
    // rendered that attribute. Without it every visit with a stored theme logs a
    // hydration mismatch — and G3's acceptance is "zero hydration warnings", so
    // a known one left standing here would drown the ones that matter.
    // It suppresses this element's attributes only, not the tree below it.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {/* The first tab stop, and until now nothing rendered it — globals.css
            has styled `.skip` since G1. It sits above the header in the source
            AND above it in z-index (--z-head is 50, .skip is 100), because a
            skip link the header covers is one nobody can see they have. */}
        <a className="skip" href="#main" lang={textLang}>
          {messages.skip}
        </a>
        <SiteHeader />
        {/* The one <main> on the page. Pages render their content, not their
            landmark — two <main> elements is an axe finding, and the skip link
            needs exactly one thing to point at. */}
        <main id="main" className="col" lang={textLang}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
