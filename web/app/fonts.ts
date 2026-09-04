// The three faces, self-hosted at build time.
//
// `next/font/google` downloads the files during `next build` and serves them
// from our own origin as `/_next/static/media/*.woff2`. That is the phase's
// first acceptance criterion — "no request to fonts.gstatic.com" — and it is not
// only a performance line: ADR 0006 says no third party sits in the request
// path, and the privacy page is only true while that holds.
//
// THE VARIABLE NAMES ARE `--face-*`, NOT `--font-*`, and that is load-bearing.
// styles/tailwind.css already declares `--font-display: var(--display)` inside
// its `@theme inline` block. Were these named the same, two definitions of one
// property would sit on the same element — `:root` from Tailwind's generated
// sheet, a class from next/font's — at equal specificity, and the source order
// of two generated stylesheets would decide which typeface the site wears.
// `--face-*` makes that collision impossible rather than merely unlikely.
// tokens.css reads them, and keeps the original stack as the fallback.
//
// WEIGHTS COME FROM THE HANDOFF, not from taste: docs/design/code/globals.css
// closes with "Chakra_Petch 400/500/600 · Geist variabel · JetBrains_Mono
// 400/500/600/700". Chakra Petch has no variable axis on Google Fonts, so every
// weight is its own file; the other two have one axis each and cover their whole
// range in one.
//
// CHAKRA PETCH 400 IS GONE, and the reason is that the sentence above is a
// LOADING instruction rather than a design one (#239). Every sheet was grepped:
// the Foundations specimen rows name Chakra Petch at 500 and 600 and at no other
// weight, the handoff's own globals.css sets h1-h3 at 500, and in web/ the
// display face is reached by exactly four rules — globals.css h1-h3 at 500, and
// three in chrome.css at 500, 600 and 600. Nothing uses the `font-display`
// Tailwind utility, which is the only other way to land on this family without
// naming a weight.
//
// It cost 9 728 B on every first visit for a weight no design asked for.
//
// The one thing that could have wanted it back was h4-h6, which had no step and
// no rule at all (#246) and were first needed by H9's blog post body. H9a wrote
// the rule and it does not: the three levels take the display face at 500, like
// h1-h3, and descend through the body steps. So the 9 728 B stay saved, and the
// line that would have brought them back is not this one — it is a note in
// styles/globals.css saying which decision closed the door.
//
// `adjustFontFallback` stays at its default (true). It is what generates the
// metric-matched fallback face, and with `display: "swap"` that fallback is the
// difference between a reflow on every first visit and CLS staying at zero.

import { Chakra_Petch, Geist, JetBrains_Mono } from "next/font/google";

/** Headings and the one CTA. Never body text — Foundations, TYPO rules. */
export const display = Chakra_Petch({
  weight: ["500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--face-display",
  fallback: ["system-ui", "sans-serif"],
});

/** Sentences, and only sentences. */
export const body = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--face-body",
  fallback: ["system-ui", "sans-serif"],
});

/** The system voice: labels, metrics, tables, the terminal. */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--face-mono",
  fallback: ["ui-monospace", "monospace"],
});

/** The three classes the html element carries, in one place so layout.tsx reads
 *  as a sentence rather than as three template holes. */
export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`;
