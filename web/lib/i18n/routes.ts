// Which language a path is in, and what a path looks like in another language.
//
// NOTHING FROM `next/*` IN HERE, and no DOM access — lib/chrome.ts's two rules,
// for lib/chrome.ts's reason. `proxy.ts` and the client components hold one call
// each; everything that decides is below, where `node --test` can reach it.
//
// THE ONE ASYMMETRY, AND EVERY FUNCTION HERE EXISTS BECAUSE OF IT: English has
// no prefix. The Language Switcher sheet fixes the table and calls it "die
// verbindliche Fassung":
//
//	/     → en
//	/de   → de
//	/fr   → fr
//
// Next has no notion of an unprefixed default locale, so the tree lives under
// `app/[lang]/` and `proxy.ts` maps the public address onto it: `/about` is
// REWRITTEN to `/en/about`, and `/en/about` is REDIRECTED to `/about` so that
// exactly one address serves each page. ADR 0046.
//
// None of this reads `Accept-Language`. The sheet: "KEINE AUTOMATISCHE
// UMLEITUNG nach Browsersprache. Die URL ist die Wahrheit — sonst schickt ein
// geteilter Link jeden woanders hin."

/** The three languages, in the sheet's order — it is also the order the
 *  switcher lists them in, so there is one array and not two. */
export const LOCALES = ["en", "de", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

/** The one that carries no prefix. */
export const DEFAULT_LOCALE: Locale = "en";

/** Name in the target language, as the sheet writes them. Not a flag: "Sprache
 *  ist keine Nationalität. Zwei Buchstaben genügen." */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
};

/** First segments that are never a language and never get a prefix.
 *
 *  `_next` is the load-bearing one: rewriting `/_next/...` into `/en/_next/...`
 *  breaks the RSC payloads and the dev server's HMR channel, and it would do so
 *  silently — the page still renders, it just stops updating. The proxy matcher
 *  excludes `_next/static` and `_next/image` already; everything else under
 *  `_next` reaches this file.
 *
 *  The four files are G5b's (`robots.txt`, `sitemap.xml`, `feed.xml`, `og.png`)
 *  and are listed one phase early for the same reason chrome.ts listed the
 *  locales one phase early: the entry costs a line now and a whole-site defect
 *  later. `og.png` is a route handler rather than an `opengraph-image` file in
 *  `app/[lang]/`, precisely so that the canonical redirect below cannot reach
 *  it. */
const RESERVED = new Set([
  "_next",
  "api",
  "healthz",
  "favicon.svg",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "feed.xml",
  "og.png",
]);

/** SEGMENTS, NOT PREFIXES. `pathname.startsWith("/de")` also claims `/design`
 *  and `/french-toast`; splitting on `/` and comparing whole segments cannot.
 *  Same defence as lib/chrome.ts, same bug it is defending against. */
function segments(pathname: string): string[] {
  return pathname.split("/").filter((part) => part.length > 0);
}

function join(parts: string[]): string {
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

/** The route segment as a `Locale`, or an exception.
 *
 *  Unreachable while `dynamicParams = false` stands in the root layout: the
 *  router answers anything outside the three with a 404 before a page runs. It
 *  throws rather than falling back to English, because a silent default here
 *  would serve an English page at an address that claims another language —
 *  and be invisible while doing it. */
export function asLocale(value: string): Locale {
  if (!isLocale(value)) throw new Error(`not a language segment: ${value}`);
  return value;
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** `/de/about` → `/about`, `/de` → `/`. A path that merely begins with those
 *  two letters is untouched.
 *
 *  `/en/about` IS stripped, even though `/en` is not a public address: this
 *  function answers "which page is this", and the internal path is a page too.
 *  Whether `/en/...` may be SERVED is `canonicalRedirect`'s question. */
export function stripLocale(pathname: string): string {
  const rest = segments(pathname);
  if (rest.length > 0 && isLocale(rest[0])) rest.shift();
  return join(rest);
}

/** Which language the visitor is looking at, read off the address they typed.
 *  Anything without a language segment is English — including `/design`. */
export function localeOf(pathname: string): Locale {
  const parts = segments(pathname);
  if (parts.length === 0) return DEFAULT_LOCALE;
  return isLocale(parts[0]) ? parts[0] : DEFAULT_LOCALE;
}

/** The address a page has in a given language. `localeHref("en", "/work")` is
 *  `/work` and not `/en/work` — that is the whole asymmetry, in one branch. */
export function localeHref(locale: Locale, path: string): string {
  const rest = segments(path);
  return locale === DEFAULT_LOCALE ? join(rest) : join([locale, ...rest]);
}

/** The same page, in another language. What the switcher does: `/de/about` plus
 *  `fr` is `/fr/about`, and plus `en` is `/about`. */
export function switchLocale(pathname: string, target: Locale): string {
  return localeHref(target, stripLocale(pathname));
}

/** What `proxy.ts` should serve INSTEAD, or `null` to serve the address as it
 *  stands.
 *
 *  Only the unprefixed English tree is rewritten: `/about` → `/en/about`.
 *  `/de/about` already names a real route and is left alone, and so is anything
 *  RESERVED. */
export function rewriteTarget(pathname: string): string | null {
  const parts = segments(pathname);
  if (parts.length > 0 && (isLocale(parts[0]) || RESERVED.has(parts[0]))) return null;
  return join([DEFAULT_LOCALE, ...parts]);
}

/** Where `/en/...` has to go, or `null` if this address is already canonical.
 *
 *  Without this the site has two addresses for every English page, which is the
 *  duplicate-content case that the `hreflang` block exists to prevent — it would
 *  be odd to declare a canonical language set and then serve a second copy of
 *  half of it. 308 rather than 302: the method must survive the redirect, and
 *  the move is permanent. */
export function canonicalRedirect(pathname: string): string | null {
  const parts = segments(pathname);
  if (parts[0] !== DEFAULT_LOCALE) return null;
  return join(parts.slice(1));
}
