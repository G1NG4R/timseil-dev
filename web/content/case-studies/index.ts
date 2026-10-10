// Which systems have a case study, and the one function that answers it.
//
// THIS IS THE GATE IN FRONT OF THE ROUTE. `/work/[slug]` must not ask the api
// about an arbitrary segment: `hasCaseStudy` decides first, and an unknown slug
// is `notFound()` before anything leaves this container. That is cheaper than a
// round trip and it is the half of "keine URL aus Nutzereingabe in ausgehende
// Requests" that a guard on the value alone does not give — lib/http/url.ts
// proves the segment is safe, this proves the page was meant to exist.
//
// A SYSTEM IS NOT A CASE STUDY. The seed holds two systems and this file holds
// one study: `talos-prod` is in_build, its repository is private and nothing is
// written about it, so `/work/talos-prod` is a 404 rather than a page of em
// dashes. The Work Index in H6 lists both systems and links only the one that
// has a page.
//
// AND lib/seo/pages.ts READS THIS LIST rather than keeping a second one. A path
// that is renderable but absent from the SEO table throws at build time, which
// is the failure this single source removes.

import type { Locale } from "../../lib/i18n/routes.ts";

import { timseilDev, timseilDevFor } from "./timseil-dev.ts";
import type { CaseStudy } from "./types.ts";

/**
 * Every study, as a slug and a reader.
 *
 * A READER AND NOT A STUDY, SINCE U8a. The words of a study are a bundle, so
 * "the study" is not one object any more — it is one per language, assembled
 * from the same facts. The registry holds the function rather than the result,
 * which is what lets `caseStudyFor` stay the single gate while answering in the
 * route's language.
 */
interface CaseSource {
  readonly slug: string;
  readonly study: (locale: Locale) => CaseStudy;
}

const SOURCES: readonly CaseSource[] = [
  { slug: timseilDev.slug, study: (locale) => timseilDevFor(locale).study },
];

/** Every case study in English, in the order the Work Index lists them.
 *
 *  ENGLISH, AND THE THREE READERS OF THIS LIST ARE WHY: app/sitemap.ts wants
 *  `updatedAt`, lib/seo/pages.ts wants the paths, and the tests want a fixture.
 *  None of them prints a sentence. A page that does calls `caseStudyFor` with a
 *  locale. */
export const CASE_STUDIES: readonly CaseStudy[] = [timseilDev];

/** The route each one answers to, language-free. `localeHref` adds the prefix. */
export function caseStudyPath(study: CaseStudy): string {
  return `/work/${study.slug}`;
}

/** Every case-study route, language-free. */
export function caseStudyPaths(): readonly string[] {
  return CASE_STUDIES.map(caseStudyPath);
}

/**
 * The study for a slug in one language, or nothing. The route's gate.
 *
 * THE LOCALE IS REQUIRED AND HAS NO DEFAULT. Most callers only ask whether a
 * study exists, and for them the argument is noise — but a default would make
 * English the quiet answer for the two callers that print a sentence, and
 * `blurb` is printed on the homepage and on `/work` in three languages. An
 * argument every caller has to think about once beats a default that is wrong
 * in exactly the places nobody re-reads.
 */
export function caseStudyFor(slug: string, locale: Locale): CaseStudy | null {
  const source = SOURCES.find((entry) => entry.slug === slug);
  return source === undefined ? null : source.study(locale);
}
