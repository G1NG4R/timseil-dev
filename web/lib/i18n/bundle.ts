// What a block of page content is, in as many languages as have been written —
// and the one function that reads one.
//
// IT IS NOT IN `complete.ts`, AND THE REASON IS A BYTE COUNT. `complete.ts`
// imports all three catalogues at runtime, because that is what `isComplete` has
// to walk. So an `import { resolveContent } from "./complete.ts"` inside a client
// component drags `messages/en.ts` (876 lines), `de.ts`, `fr.ts` and every module
// `BUNDLES` registers into that component's chunk — not a little more, but every
// word this site holds, against a budget with about four kilobytes left (#237,
// ADR 0050).
//
// AND THERE IS SUCH A COMPONENT. `app/[lang]/error.tsx` is `"use client"` and
// reads exactly one bundle, the error words. This module is what it imports: a
// type, an interface, and four lines that pick a key off an object. Nothing else
// — not `routes.ts`, not the catalogue — so there is nothing here for a bundler
// to follow.
//
// THE PREDICATE STAYS IN `complete.ts`, which re-exports these three names so
// that no caller has to know the split exists. `languageComplete` asks about the
// register; this file is only about one bundle at a time.

import type { Locale } from "./routes.ts";

/**
 * A block of page content in as many languages as have been written.
 *
 * ENGLISH IS REQUIRED AND EVERY OTHER LANGUAGE IS OPTIONAL, which is the type
 * doing two jobs at once: French stays legally empty — ADR 0083's first
 * decision — and a typo in a language key (`ger:`, `de_DE:`) is a compiler
 * error rather than a bundle that silently never resolves.
 */
export type ContentBundle<T> = { readonly en: T } & Partial<Record<Locale, T>>;

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
