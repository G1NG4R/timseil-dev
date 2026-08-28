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
// 400/500/600/700". Chakra Petch has no variable axis on Google Fonts, so it is
// three files; the other two have one and cover their whole range in one.
//
// `adjustFontFallback` stays at its default (true). It is what generates the
// metric-matched fallback face, and with `display: "swap"` that fallback is the
// difference between a reflow on every first visit and CLS staying at zero.

import { Chakra_Petch, Geist, JetBrains_Mono } from "next/font/google";

/** Headings and the one CTA. Never body text — Foundations, TYPO rules. */
export const display = Chakra_Petch({
  weight: ["400", "500", "600"],
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
