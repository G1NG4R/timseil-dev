// What this site tells a search engine it is, in the one format they all read.
//
// TWO NODES IN ONE GRAPH, not two script blocks. The `Person` and the `WebSite`
// are the same claim seen from two sides — the site has an author, the author
// has a site — and `@graph` with `@id` references says that once. Two separate
// blocks would say it twice and leave the two free to disagree.
//
// WHAT IS DELIBERATELY ABSENT, because each absence is a claim not made:
//
//	SearchAction    there is no site search until H9. A `SearchAction` naming a
//	                query URL that answers 404 is the machine-readable version of
//	                a number nothing measured.
//	image           there is no photograph of the operator in this repository.
//	address         "BASED IN LUXEMBOURG" is a line in the footer, not a postal
//	                address, and PostalAddress wants one.
//	dateModified    the only date available at build time is the build's own.
//
// `inLanguage` IS DERIVED, NOT WRITTEN. It comes from `resolved` — the language
// the strings on the page actually are — so `/de` says `en` today and starts
// saying `de` by itself on the day P6 fills the dictionary. Writing `de` here
// would be the graph claiming a translation the page does not have.

import type { Locale } from "../i18n/routes.ts";
import { AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../site.ts";

/** Stable fragment identities, so the two nodes can point at each other and a
 *  future page can point at either without repeating them. */
const PERSON_ID = `${SITE_URL}/#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export function personLd(): Record<string, unknown> {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: AUTHOR.name,
    url: `${SITE_URL}/`,
    email: `mailto:${AUTHOR.email}`,
    jobTitle: AUTHOR.jobTitle,
    sameAs: [AUTHOR.github],
  };
}

export function webSiteLd(inLanguage: Locale): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    inLanguage,
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
  };
}

/** The whole block, as the homepage renders it. */
export function siteLd(inLanguage: Locale): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [personLd(), webSiteLd(inLanguage)],
  };
}

/**
 * What `/about` tells a machine it is: a profile of the person the homepage
 * already names.
 *
 * `ProfilePage` AND NOT `AboutPage`, and the difference is which noun is the
 * subject. `AboutPage` is a page about the SITE — its terms, its purpose, its
 * publisher. This page is about the operator, and schema.org has a type that
 * says exactly that and a `mainEntity` slot to hang him on.
 *
 * THE `Person` NODE IS REPEATED HERE, and it has to be. A crawler reads one
 * page at a time, so a graph whose `mainEntity` points at an `@id` defined only
 * on `/` is a reference into nothing on this page — invariant 5 in the
 * machine-readable half of the site. The `@id` is the SAME one, which is the
 * whole reason lib/seo/jsonld.ts has stable fragments: the two pages describe
 * one person rather than two who share a name.
 *
 * `path` IS THE PAGE'S OWN, canonical and locale-aware, because the same profile
 * is served at three addresses and each of them should say which one it is. The
 * page resolves the path — this module has no business knowing about locales
 * beyond the language tag it is handed — and this function makes it absolute.
 *
 * ABSOLUTE, AND THAT IS NOT THE SAME DECISION Metadata MAKES. `alternatesFor`
 * hands Next a relative canonical and Next resolves it against `metadataBase`
 * on the way out. Nothing resolves a JSON-LD document: it is a data block, a
 * crawler reads the string it finds, and `"url": "/about"` is a claim about a
 * page on whatever origin the reader happens to think it is on. Caught by
 * looking at the rendered block rather than by the type, because both are
 * strings.
 */
export function aboutLd(inLanguage: Locale, path: string): Record<string, unknown> {
  const url = `${SITE_URL}${path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      personLd(),
      {
        "@type": "ProfilePage",
        "@id": `${url}#profile`,
        url,
        name: AUTHOR.name,
        inLanguage,
        mainEntity: { "@id": PERSON_ID },
        isPartOf: { "@id": WEBSITE_ID },
      },
    ],
  };
}

/**
 * JSON for a `<script>` element, which is not the same thing as JSON.
 *
 * An HTML parser looks for the literal characters `</script` inside a script
 * element and ends the element there — it does not know or care that it is
 * inside a JSON string. A value containing that sequence therefore closes the
 * block early and everything after it is parsed as markup. Escaping `<` as a
 * JSON unicode escape removes the sequence while leaving the decoded string
 * identical, so a reader gets the character and the parser never sees it.
 *
 * `>` and `&` go the same way. Neither can end the element on its own, but they
 * are the two other characters an HTML parser is entitled to interpret, and the
 * cost of escaping them is nothing.
 *
 * Nothing here reaches this function from a request today — the values are this
 * repository's own constants. It is written for the day one of them is a post
 * title, because that day the defect is invisible in review.
 */
export function serializeLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
