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
// one study: `vat-check` is queued, has no repository and nothing written about
// it, so `/work/vat-check` is a 404 rather than a page of em dashes. The Work
// Index in H6 lists both systems and links only the one that has a page.
//
// AND lib/seo/pages.ts READS THIS LIST rather than keeping a second one. A path
// that is renderable but absent from the SEO table throws at build time, which
// is the failure this single source removes.

import type { CaseStudy } from "./types.ts";
import { timseilDev } from "./timseil-dev.ts";

/** Every case study, in the order the Work Index will list them: by system number. */
export const CASE_STUDIES: readonly CaseStudy[] = [timseilDev];

/** The route each one answers to, language-free. `localeHref` adds the prefix. */
export function caseStudyPath(study: CaseStudy): string {
  return `/work/${study.slug}`;
}

/** Every case-study route, language-free. */
export function caseStudyPaths(): readonly string[] {
  return CASE_STUDIES.map(caseStudyPath);
}

/** The study for a slug, or nothing. The route's gate. */
export function caseStudyFor(slug: string): CaseStudy | null {
  return CASE_STUDIES.find((study) => study.slug === slug) ?? null;
}
