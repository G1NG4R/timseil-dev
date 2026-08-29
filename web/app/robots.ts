// What a crawler is allowed to do, which is everything.
//
// THE REFUSALS ARE PER PAGE, NOT HERE, and that has been the decision since
// G5a — the six stub pages each carry `robots: { index: false }` with the
// reason next to it, and lib/seo/pages.ts now holds the boolean they read. A
// Disallow line here would say the same thing a second time, in a file where
// the reason cannot be written, and the two would drift the first time a
// stage-H phase fills a page.
//
// AND THE TWO ARE NOT THE SAME INSTRUCTION ANYWAY. `Disallow` says "do not
// fetch this"; `noindex` says "fetch it and do not list it". A page that is
// disallowed is never fetched, so its `noindex` is never read — which is the
// classic way to keep a page in the index while believing it is excluded. The
// stubs have to be fetched to be understood.
//
// NO `Disallow: /en/`. Those addresses answer with a 308 to the unprefixed
// form (ADR 0046), and that redirect is how a crawler learns which URL is the
// real one. Forbidding the path would withhold the lesson.
//
// This file lives at the root of `app/`, outside `app/[lang]/`: robots.txt has
// no language. lib/i18n/routes.ts keeps it in RESERVED so the proxy never
// rewrites it into `/en/robots.txt`, which would be a 404 that a crawler reads
// as "no rules at all".

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
