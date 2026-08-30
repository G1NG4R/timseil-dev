// The pages this site is prepared to be found by, and there are three of them.
//
// ONE ENTRY PER INDEXABLE ROUTE, PER LANGUAGE. Google's rule for a multilingual
// set is that every URL in it appears in its own right, carrying the complete
// alternate list including itself — so `/`, `/de` and `/fr` are three entries,
// not one entry with two alternates.
//
// AND ONLY WHAT IS INDEXABLE. Six of the seven routes are `[SOON]` stubs and
// say `noindex` in their own metadata; a sitemap that listed them would be this
// site telling a crawler to come and look at a page that tells it to leave. The
// boolean lives in lib/seo/pages.ts, which is also what the pages read — a
// stage-H phase flips it once and both follow.
//
// `lastModified` ONLY WHERE SOMETHING WROTE ONE. NO `changeFrequency`, NO
// `priority`.
//
// The rule this file was written with still holds: `new Date()` here is the
// moment the container was built, which is not the moment anything on the page
// changed — every deploy would move every date, and a crawler would be told the
// whole site was rewritten because a dependency got a patch bump. That is
// invariant 1 in a file nobody looks at.
//
// H1 IS THE PHASE THIS FILE NAMED. It said "when H1 and H9 give pages a real
// modification date, it comes from the content, and this is where it goes", and
// content/case-studies now carries one per study, written by hand next to the
// prose it describes. So a case study has a date and the homepage does not, and
// that asymmetry is the honest one: nothing has measured when `/` last changed.
//
// The other two are hints Google says in writing that it ignores. Writing them
// anyway would be decoration that looks like configuration.

import type { MetadataRoute } from "next";

import { CASE_STUDIES, caseStudyPath } from "@/content/case-studies/index";
import { LOCALES, localeHref } from "@/lib/i18n/routes";
import { indexablePaths } from "@/lib/seo/pages";
import { SITE_URL } from "@/lib/site";

/** Absolute, always. A sitemap is fetched from a host that is not this one, and
 *  the spec requires the full URL. */
function absolute(path: string): string {
  return new URL(path, SITE_URL).href;
}

/** The same four links `alternatesFor()` puts in every page's <head>, in the
 *  shape a sitemap wants them. Built here rather than reused from there because
 *  the two formats disagree: Metadata resolves relative paths against
 *  `metadataBase`, and a sitemap has no base to resolve against. */
function alternateLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const code of LOCALES) languages[code] = absolute(localeHref(code, path));
  languages["x-default"] = absolute(localeHref("en", path));
  return languages;
}

/** The date the content of a path was last written, for the paths that have one. */
function lastModifiedFor(path: string): Date | undefined {
  const study = CASE_STUDIES.find((entry) => caseStudyPath(entry) === path);
  return study === undefined ? undefined : new Date(study.updatedAt);
}

export default function sitemap(): MetadataRoute.Sitemap {
  return indexablePaths().flatMap((path) => {
    const languages = alternateLanguages(path);
    const lastModified = lastModifiedFor(path);

    return LOCALES.map((locale) => ({
      url: absolute(localeHref(locale, path)),
      alternates: { languages },
      // Spread rather than set: `lastModified: undefined` is still a key, and a
      // sitemap entry that carries an empty one is a claim about a date nobody
      // wrote.
      ...(lastModified === undefined ? {} : { lastModified }),
    }));
  });
}
