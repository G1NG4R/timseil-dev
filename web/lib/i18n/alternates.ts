// The `hreflang` block, derived rather than written out.
//
// The Language Switcher sheet fixes the four links and calls the section "die
// verbindliche Fassung":
//
//	<link rel="alternate" hreflang="en"        href="/">
//	<link rel="alternate" hreflang="de"        href="/de">
//	<link rel="alternate" hreflang="fr"        href="/fr">
//	<link rel="alternate" hreflang="x-default" href="/">
//
// WHY EACH PAGE CALLS THIS AND THE LAYOUT DOES NOT. A root layout's
// `generateMetadata` is handed the language and nothing else — it cannot know
// whether it is wrapping `/about` or `/blog`, and the only way to find out
// would be `headers()`, which takes every page out of the static pass (ADR
// 0043). So the page names its own path, which it knows as a literal, and this
// function turns that into the four links and the canonical. One line per page,
// and the stage-H phase that fills a page keeps it.
//
// `x-default` is the same address as `en` and that is correct rather than
// redundant: it answers "what does someone get whose language is none of these
// three", and the answer is English. It is NOT a redirect — nothing here reads
// `Accept-Language`.

import type { Metadata } from "next";

import { LOCALES, type Locale, localeHref } from "./routes.ts";

/** `alternatesFor("de", "/about")` → canonical `/de/about`, plus all four
 *  links. `path` is the language-free path, the way lib/chrome.ts writes it. */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const code of LOCALES) languages[code] = localeHref(code, path);
  languages["x-default"] = localeHref("en", path);

  return { canonical: localeHref(locale, path), languages };
}
