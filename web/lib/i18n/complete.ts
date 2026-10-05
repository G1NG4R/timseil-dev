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

import {
  type ContentBundle,
  type ResolvedContent,
  resolveContent,
} from "./bundle.ts";
import { de } from "./messages/de.ts";
import { en, type Messages } from "./messages/en.ts";
import { fr } from "./messages/fr.ts";
import { LOCALES, type Locale } from "./routes.ts";

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

// THE THREE BUNDLE NAMES LIVE IN `bundle.ts` AND ARE RE-EXPORTED HERE, so that
// a caller does not have to know the split exists. The split is a byte count, not
// a taste: this file imports all three catalogues, and `app/[lang]/error.tsx` is a
// client component that reads one bundle. `bundle.ts` says the rest.
export { type ContentBundle, type ResolvedContent, resolveContent };

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
 * Where a bundle has a different SHAPE in one language than it has in English.
 *
 * `bundlesComplete` asks whether a language is there. This asks whether what is
 * there is the same thing — and the two questions have different answers to the
 * same defect. A `Record<StationKey, Prose>` cannot be short, because the
 * compiler counts its keys; a `readonly string[]` can. `problem` has three
 * paragraphs and `constraints` has five, and a German bundle with four of them
 * type-checks, resolves, and quietly drops a paragraph off the page.
 *
 * IT IS NOT PART OF `languageComplete`, ON PURPOSE. A missing language is a
 * translation that has not happened, and the honest answer to it is to serve
 * English. A shape that disagrees is a programming error, and the honest answer
 * to that is a red test — not a page that silently reverts to English and leaves
 * somebody wondering why German stopped working.
 *
 * Values are never compared, only structure: keys, array lengths and the kind of
 * thing at each position. Complaints come back as paths, the same shape
 * complete.test.ts already uses for its orphans, because a list of places is
 * readable and a thrown first failure is not.
 */
export function bundleShapes(
  bundles: readonly ContentBundle<unknown>[] = BUNDLES,
): readonly string[] {
  const complaints: string[] = [];

  bundles.forEach((bundle, index) => {
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const translated = bundle[locale];
      if (translated === undefined) continue;
      compareShape(bundle.en, translated, `[${String(index)}].${locale}`, complaints);
    }
  });

  return complaints;
}

function compareShape(en: unknown, other: unknown, path: string, out: string[]): void {
  if (Array.isArray(en)) {
    if (!Array.isArray(other)) {
      out.push(`${path}: ${typeof other} where English has a list`);
      return;
    }
    if (other.length !== en.length) {
      out.push(`${path}: ${String(other.length)} of ${String(en.length)}`);
      return;
    }
    en.forEach((item, index) => {
      compareShape(item, other[index], `${path}[${String(index)}]`, out);
    });
    return;
  }

  if (typeof en === "object" && en !== null) {
    if (typeof other !== "object" || other === null || Array.isArray(other)) {
      out.push(`${path}: ${typeof other} where English has an object`);
      return;
    }
    const mine = Object.keys(en);
    const theirs = Object.keys(other);
    const missing = mine.filter((key) => !theirs.includes(key));
    const extra = theirs.filter((key) => !mine.includes(key));
    if (missing.length > 0) out.push(`${path}: missing ${missing.join(" · ")}`);
    if (extra.length > 0) out.push(`${path}: unknown ${extra.join(" · ")}`);
    for (const key of mine.filter((name) => theirs.includes(name))) {
      compareShape(
        (en as Record<string, unknown>)[key],
        (other as Record<string, unknown>)[key],
        `${path}.${key}`,
        out,
      );
    }
    return;
  }

  if (typeof en !== typeof other) out.push(`${path}: ${typeof other} where English has ${typeof en}`);
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
