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
