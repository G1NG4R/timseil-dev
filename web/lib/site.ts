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
} as const;
