// Who the site says it is, in the two places a machine reads it: the absolute
// URLs under `metadataBase` and the JSON-LD block.
//
// A CONSTANT AND NOT AN ENVIRONMENT VARIABLE, on purpose. `metadataBase` decides
// what every canonical and every `hreflang` on the page points at, and those are
// claims about which address is the real one. A build that reads them from its
// environment publishes whatever that environment happened to say — and the one
// environment that would differ is a preview, which would then be telling
// crawlers that IT is the canonical site. The address of this site is not a
// deployment detail; it is the site.
//
// M6 adds the other half of the same claim from the outside: `timseil.com` gets
// a 301 here.

export const SITE_URL = "https://timseil.dev";

export const SITE_NAME = "timseil.dev";

/** The one human. Used by the JSON-LD `Person` in G5b and by nothing else —
 *  the visible chrome takes its words from lib/i18n/messages/. */
export const AUTHOR = {
  name: "Tim Seil",
  email: "contact@timseil.dev",
  github: "https://github.com/G1NG4R",
  /** As the Language Switcher sheet writes it (`LANG.01`, row "Rolle").
   *  Transcribed from the handoff rather than invented — that sheet is the only
   *  place this site has ever said what the job is called. Two things read it:
   *  the JSON-LD `Person` and the social card. */
  jobTitle: "Backend & DevOps Engineer",
} as const;

/** The one sentence this site says about itself.
 *
 *  IT LIVES HERE BECAUSE THREE THINGS READ IT: the `<meta name="description">`
 *  in the layout, the `og:description` and `twitter:description` in
 *  lib/seo/pages.ts, and the JSON-LD `WebSite`. It was a literal in the layout
 *  until G5b, when the second and third reader arrived.
 *
 *  Not translated, and that is G5's rule rather than an omission: the German
 *  and French dictionaries are empty until P6, and a German description over an
 *  English page is exactly the half page the sheet forbids.
 *
 *  There is no SITE_TITLE beside it. `SITE_NAME` is the same string and the
 *  same claim — the `<title>` of this site is its name, and will stay so until
 *  a stage-H page has a title of its own to put in front of it. */
export const SITE_DESCRIPTION =
  "Backend and DevOps portfolio — the site is its own reference system.";

/**
 * Which of the systems in the database is this one.
 *
 * A CONSTANT AND NOT AN ENVIRONMENT VARIABLE, for the reason the head of this
 * file already gives about `SITE_URL`: the answer is not a deployment detail,
 * it is the site. Every environment that runs this code is this site, and the
 * one that would differ is a preview — which would then draw somebody else's
 * operation strip on the homepage and call it ours.
 *
 * THE API HOLDS THE SAME ANSWER AND HOLDS IT DIFFERENTLY: `SITE_SYSTEM_SLUG` is
 * an environment variable there (api/internal/config/config.go), read from
 * .env, and it decides which row the probe writes into and which system the
 * health document is about. So the two halves of one fact are a constant on one
 * side and a variable on the other, and NOTHING CHECKS THAT THEY AGREE. Written
 * down rather than assumed away, the way next.config.ts writes down that
 * nothing checks its cacheLife profiles against the contract.
 *
 * What a disagreement costs is small and honest: this side asks
 * `/api/systems/timseil-dev`, the api answers 404, and the strip renders
 * `— NO DATA` — a true statement about a system that does not exist under that
 * name. It does not draw a wrong number, which is the failure that would matter.
 */
export const SITE_SYSTEM_SLUG = "timseil-dev";
