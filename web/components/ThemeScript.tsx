// The one inline script on the site, and the reason it is inline.
//
// A theme applied after the first paint is a visible jump: the page draws in
// Terminal Noir and then repaints in Latte. The attribute therefore has to be on
// the html element before anything is painted, which means a synchronous script
// in the head — an import, a `useEffect` or anything React runs is already too
// late by definition.
//
// THE NONCE IS A PROP THAT NOBODY PASSES YET, and that is the decision rather
// than an unfinished edge. L4 is where the CSP is born (build plan line 1325);
// it will mint a nonce in proxy.ts and hand it down. Reading it here today would
// mean `headers()` in the root layout, and that takes every page out of the
// static pass — exactly the shell G4 is about to prerender. So the seam exists,
// is named, and stays unbound.
//
// Worth writing down once, because L4 and G4 both walk into it: an anti-flash
// snippet and a fully prerendered HTML shell are mutually exclusive as soon as
// the CSP is nonce-based. Whoever gets there first pays for it. ADR 0043.
//
// React drops the attribute entirely when `nonce` is undefined, so the rendered
// tag today is exactly the tag the handoff drew.

import { THEME_SNIPPET } from "@/lib/theme";

export function ThemeScript({ nonce }: { nonce?: string }) {
  // The content is a constant this repo wrote, built from THEME_IDS — no value
  // from a request, a database or a visitor reaches it. That is the whole of
  // what makes `dangerouslySetInnerHTML` safe here, and it is why the snippet
  // lives in lib/theme.ts under test rather than as a string in this file.
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SNIPPET }} />;
}
