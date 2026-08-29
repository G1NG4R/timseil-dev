import type { Metadata } from "next";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeScript } from "@/components/ThemeScript";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LOCALES } from "@/lib/i18n/routes";
import { SITE_URL } from "@/lib/site";

import { fontVariables } from "../fonts";

// The stylesheet order is the whole point of this block, and it is the build
// plan's (G1), not a preference:
//
//   tailwind  utilities drawn from the tokens, no palette of its own
//   tokens    every colour, size, spacing, radius and duration — invariant 8
//   globals   reset, typography, focus, the three keyframes
//   chrome    the header, the menu and the footer — G3
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
import "../../styles/tailwind.css";
import "../../styles/tokens.css";
import "../../styles/globals.css";
import "../../styles/chrome.css";
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
  title: "timseil.dev",
  description: "Backend and DevOps portfolio — the site is its own reference system.",
};

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
