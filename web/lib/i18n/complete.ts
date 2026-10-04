// When a language is finished, and the half of that question `isComplete` never
// asked.
//
// NOTHING FROM `next/*` IN HERE — messages.ts's rule, for messages.ts's reason:
// everything that decides has to stay reachable from `node --test`.
//
// THE PREDICATE USED TO BE THE CATALOGUE AND NOTHING ELSE. `isComplete` walks
// the keys of messages/en.ts and says yes when every one of them carries text.
// That is a true answer to a smaller question than the one `<main lang>` asks.
// Measured against `b19015a` — 143 keys then, 148 after U8 brought six markup
// literals in as five keys (two components drew the same phrase) — about 3.040 words of English prose live OUTSIDE that
// catalogue: the legal texts, the About stations, the case study, the error
// words, the contact trace, the wait lines. The moment de.ts was finished,
// `<main>` on /de would have dropped its `lang="en"` and every one of those
// words would have started claiming to be German.
//
// THE COUNT IS WRITTEN AS A PAIR ON PURPOSE. en.ts says it in its own words:
// "a number in a comment that nobody recomputes is the defect this file's own
// neighbours keep finding." A single figure here would be wrong the next time a
// page gains a label; a before and an after stays readable as history.
//
// SO A LANGUAGE IS COMPLETE WHEN THE CATALOGUE CARRIES IT **AND** EVERY
// REGISTERED BUNDLE DOES. ADR 0083. `BUNDLES` is the one list, and a module
// that is not in it is invisible to this file — which is the defect, not a
// detail, so complete.test.ts reads the bundle files off disk and refuses an
// unregistered one.
//
// WHAT IS NOT HERE IS THE ISLANDS. A block that stays English on purpose —
// /privacy, /imprint, a log entry — sets its own `lang="en"` where it is
// rendered. A second register listing them would be a list somebody has to
// maintain, and the thing it would assert is already assertable on the
// delivered page.

import { de } from "./messages/de.ts";
import { en, type Messages } from "./messages/en.ts";
import { fr } from "./messages/fr.ts";
import type { Locale } from "./routes.ts";

/** The three overlays, keyed by language. English is its own overlay and
 *  trivially complete; it is in the table so that nothing has to special-case
 *  the default when reading one out. */
export const OVERLAYS: Record<Locale, Partial<Messages>> = { en, de, fr };

/** Does this language carry every key of the catalogue, with something in it?
 *
 *  A present-but-empty string counts as missing. A translator who deletes the
 *  text and leaves the key would otherwise ship a blank label, and a blank
 *  label is the UI equivalent of a number nobody measured.
 *
 *  THIS IS HALF THE QUESTION. `languageComplete` below is the whole one; this
 *  one is exported because it is the half with its own tests and its own
 *  failure mode, and because a caller that really does mean "the catalogue"
 *  should be able to say so. */
export function isComplete(overlay: Partial<Messages>): boolean {
  return Object.keys(en).every((key) => {
    const value = overlay[key as keyof Messages];
    return typeof value === "string" && value.length > 0;
  });
}

/**
 * A block of page content in as many languages as have been written.
 *
 * ENGLISH IS REQUIRED AND EVERY OTHER LANGUAGE IS OPTIONAL, which is the type
 * doing two jobs at once: French stays legally empty — ADR 0083's first
 * decision — and a typo in a language key (`ger:`, `de_DE:`) is a compiler
 * error rather than a bundle that silently never resolves.
 */
export type ContentBundle<T> = { readonly en: T } & Partial<Record<Locale, T>>;

/**
 * Every bundle a page reads its words from.
 *
 * IT IS EMPTY IN U8, AND IT IS HERE ANYWAY. The mechanism has to be green
 * before the first translation leans on it: `complete.test.ts` proves the
 * missing-bundle case against a fixture today, and U8a registers About, the
 * case study and the scattered lines against the same list.
 *
 * `unknown` RATHER THAN A UNION, because this list exists to be counted and
 * walked, never to be read through. A page imports its own bundle and knows its
 * own type; `languageComplete` only asks whether a key is there.
 */
export const BUNDLES: readonly ContentBundle<unknown>[] = [];

/** Does every registered bundle carry this language? */
export function bundlesComplete(
  locale: Locale,
  bundles: readonly ContentBundle<unknown>[] = BUNDLES,
): boolean {
  return bundles.every((bundle) => bundle[locale] !== undefined);
}

/**
 * The whole question: is this language finished?
 *
 * English is always finished — it is the shape every other language fills, and
 * a bundle without an `en` entry does not compile.
 */
export function languageComplete(
  locale: Locale,
  bundles: readonly ContentBundle<unknown>[] = BUNDLES,
): boolean {
  return isComplete(OVERLAYS[locale]) && bundlesComplete(locale, bundles);
}

/** What a bundle resolves to, and which language that was. The shape
 *  `resolveMessages` returns, for the same reason: the second value is what a
 *  block puts on its `lang` attribute. */
export interface ResolvedContent<T> {
  readonly value: T;
  readonly resolved: Locale;
}

/**
 * Read one bundle in the route's language, or in English.
 *
 * IT DOES NOT ASK `languageComplete`. A page that calls this is already being
 * rendered in a language the dictionary resolved; asking a second time would be
 * a second answer that can disagree with the first. What this guards is the
 * narrower case: a bundle registered after the dictionary was read, or read
 * directly by a test.
 */
export function resolveContent<T>(bundle: ContentBundle<T>, locale: Locale): ResolvedContent<T> {
  const value = bundle[locale];
  return value === undefined ? { value: bundle.en, resolved: "en" } : { value, resolved: locale };
}
