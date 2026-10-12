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

/** The one human. The JSON-LD `Person` reads it, and since H8 so does
 *  `/contact` — the address there is the fallback for a visitor with no
 *  JavaScript, so it is a load-bearing string rather than decoration.
 *
 *  THE CHROME STILL WRITES IT OUT BY HAND, in FooterLead, MobileMenu and
 *  lib/about/content.ts. Three copies of one address, and this phase did not
 *  make them four — it also did not fix them, because a page phase that edits
 *  the chrome is a page phase that breaks chrome.test.ts for a reason nobody
 *  asked for. Noted in the backlog instead. */
export const AUTHOR = {
  name: "Tim Seil",
  email: "contact@timseil.dev",
  github: "https://github.com/G1NG4R",
  /** What the role is called. Since ADR 0079 it is the one the evidence
   *  carries — `talos-prod` — and no longer the one the Language Switcher
   *  sheet transcribes (`LANG.01`, row "Rolle"). Three things read it: the
   *  JSON-LD `Person`, the social card, and the author line under every post. */
  jobTitle: "Junior DevOps Engineer",
} as const;

/**
 * This repository, on the host it is pushed to.
 *
 * H9a NEEDED IT AND NOTHING ELSE DOES YET. The Blog Post sheet puts
 * `EDIT ON GITHUB ↗` in the meta row, and its own rule for the block says when
 * that link is allowed to exist: "Nur sinnvoll, solange der Inhalt im
 * öffentlichen Repo liegt." It is, so it does — and the URL is built from this
 * one string rather than written into a component, because the day the
 * repository is renamed there must be exactly one place that is wrong.
 *
 * NOT `AUTHOR.github`, WHICH IS A PERSON. That URL is the `sameAs` of the
 * JSON-LD `Person` and the target of the footer's GITHUB link; this one is a
 * repository, and folding them together would mean a profile move renaming a
 * source file's address.
 *
 * `main` IS HARD-CODED IN THE CALLER, not here, and it is the branch every
 * merge lands on — CONTRIBUTING.md: "One phase = one branch = one pull request
 * = one squash merge." A link to a branch that is deleted after every merge
 * would be a 404 by design.
 */
export const REPO_URL = "https://github.com/G1NG4R/timseil-dev";

/** The one sentence this site says about itself, in English.
 *
 *  SINCE #431 THIS IS THE COPY FOR THE READERS THAT HAVE NO LANGUAGE TO SPEAK,
 *  and there are three of them, all outside `app/[lang]/`: the RSS channel in
 *  lib/seo/feed.ts, one line above its own `<language>en</language>`; the
 *  social card drawn at build time in app/og.png/route.tsx; and the alt text
 *  in lib/seo/pages.ts that transcribes that card. lib/i18n/routes.ts keeps
 *  all three out of the language tree on purpose.
 *
 *  THE READERS THAT DO HAVE A LANGUAGE READ THE CATALOGUE instead, through
 *  `siteDescription()` in lib/i18n/messages.ts: the `<meta name="description">`
 *  in the layout, `og:description`, `twitter:description`, and the JSON-LD
 *  `WebSite`. The English value there is this string, transcribed, and
 *  messages.test.ts refuses the two drifting apart.
 *
 *  WHAT USED TO STAND HERE WAS TRUE AND IS NOT ANY MORE. The reason was "the
 *  German and French dictionaries are empty until P6", which U8a ended for
 *  German; the field was then the last one on `/de` still answering in English
 *  under `<html lang="de">`. ADR 0083 §7 named it rather than leaving it as a
 *  silent gap.
 *
 *  ONE RESIDUE, AND IT IS NAMED RATHER THAN HIDDEN: on `/fr` the English
 *  sentence still stands under `<html lang="fr">`. It is the same shape of
 *  defect, narrower — the whole French page is English and says so on four
 *  blocks, and no `og:locale` claims otherwise — and it is not fixable until
 *  French exists. It will need no edit when it does: `resolveMessages` already
 *  decides it.
 *
 *  There is no SITE_TITLE beside it. `SITE_NAME` is the same string and the
 *  same claim — the `<title>` of this site is its name, and will stay so until
 *  a stage-H page has a title of its own to put in front of it. */
export const SITE_DESCRIPTION =
  "Junior DevOps portfolio — Kubernetes on bare metal, Luxembourg.";

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
