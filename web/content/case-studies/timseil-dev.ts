// The words of system 02, and nothing a system produces.
//
// WHY IT IS A FILE AND NOT A COLUMN. `systems` has no text columns, on purpose:
// migration 00002 keeps the table to what a machine writes. A headline and a
// caption are written once by a person and change when that person changes their
// mind, which is a repository's job and not a database's.
//
// WHY IT IS TYPESCRIPT AND NOT MDX. The MDX renderer arrived with H9 and serves
// `web/content/posts/`. A typed module is checkable under `node --test` today,
// costs no dependency, and adds nothing to the initial JS — a server component
// reads it and ships the rendered text.
//
// WHY IT IS NOT IN lib/i18n/messages/. Those are the interface's words, and
// `resolveMessages()` discards an incomplete language whole rather than serve
// half a page. Prose there would hang the case study on a translation that does
// not exist until U8. LANG.01's line is the one that decides it: "Übersetzt wird
// Prosa, nicht Nomenklatur" — the labels around this text (UPTIME · 91 D, STACK)
// stay English either way.
//
// AND U8a IS WHERE THE SECOND HALF OF THAT ARGUMENT COMES DUE. The prose is not
// in the catalogue and it still has a language, so it is a bundle: the facts —
// the slug, the date, the seven stage titles and their jobs — stand once below,
// and every sentence lives in `CASE_WORDS_EN` beside its German counterpart in
// timseil-dev.de.ts. `resolveMessages`' all-or-nothing rule is now the bundle's
// rule too, by way of `BUNDLES` in lib/i18n/complete.ts.
//
// WHAT U6 TOOK OUT, because a file this short should say why it is short. It held
// a lead paragraph, a red alert line, a role, five request-path stations, five
// side lanes, four decisions with their alternatives, four build phases, four
// observability lines and a result section with two lists and a card. All of it
// was an argument about work someone else did the typing for. ADR 0079 §4 made
// that case for the log and named no other directory; ADR 0081 extended it to
// this one and states the test the survivors passed: a system produces them, or a
// check holds them.
//
// AND WHAT IT TOOK OUT AND PUT BACK THE SAME DAY: the problem statement and the
// five constraints. They fail that test — nothing holds them — and they are the
// only text left that says why this site is a running system instead of a set of
// screenshots. A page that argues "every claim has evidence" and then cannot
// state the argument has removed the wrong thing. The addendum to ADR 0081
// carries it, and the first paragraph names the role the systems carry.
//
// The stack is deliberately NOT written here. It arrives from `systems.stack`,
// which `make gen` fills out of go.mod, package.json and compose.yaml — chapter
// 12.3's whole point is that nobody types a version into a page again. What this
// file may name is a technology, never its version.

import { type ContentBundle, resolveContent } from "../../lib/i18n/bundle.ts";
import { type Locale } from "../../lib/i18n/routes.ts";

import { CASE_WORDS_DE } from "./timseil-dev.de.ts";
import { type CaseFacts, type CaseStudy, type CaseWords, studyFrom } from "./types.ts";

/**
 * The seven boxes of the pipeline, in order.
 *
 * FIVE OF THESE SEVEN WORDS ARE `ci.yml` JOB NAMES IN CAPITALS, which is what
 * makes them nomenclature and what makes `pipeline.test.ts` possible. The words
 * are also the keys the sentences hang off, so a tuple here fixes the order of
 * the page and the completeness of every translation at once.
 */
export const STAGE_TITLES = [
  "PUSH",
  "CHECK",
  "DB",
  "E2E",
  "PUBLISH",
  "DEPLOY",
  "VERIFY",
] as const;

/** One box of the pipeline. */
export type StageTitle = (typeof STAGE_TITLES)[number];

/**
 * What this study points at: a slug, a date and seven stages.
 *
 * ── OPERATIONS ────────────────────────────────────────────────────────────
 *
 * NO VERSION, NO PORT, NO CADENCE, and no statement about what is or is not
 * yet hardened on this host. The version rule is this file's own, at the top.
 * The other three are CLAUDE.md's: the current state of a security question
 * about this host does not go on a public page.
 *
 * The stages are the real jobs of .github/workflows/ci.yml, not the sheet's
 * (`go test ./...`, `compose pull + up`). lib/content/pipeline.test.ts holds
 * every `job` below against that file, so a renamed job is a red test rather
 * than a page describing a pipeline that no longer exists. That test is the
 * reason this field survived U6 and the observability panel beside it did not.
 */
const FACTS: CaseFacts<StageTitle> = {
  slug: "timseil-dev",

  // The date of the copy below, not a build time. sitemap.ts asked for exactly
  // this in G5: "When H1 and H9 give pages a real modification date, it comes
  // from the content, and this is where it goes." A `new Date()` here would move
  // every page's date on every dependency bump.
  //
  // WHICH MEANS IT MOVES WHEN THE COPY DOES, and H2a is the phase that found out
  // what happens when it does not: two whole sections were added to this page on
  // the 31st and this line still read the 30th, so all three language routes
  // published `lastmod 2026-08-30` for a page that had changed. Nothing catches
  // it — there is one consumer (app/sitemap.ts) and lib/seo/pages.test.ts asserts
  // the shape of this string and never its value. That is #284, and U6 is the
  // second phase to move this line by hand, which is the repetition the issue is
  // about.
  //
  // So the rule, until something enforces it: EDIT THE WORDS IN THIS FILE, MOVE
  // THIS DATE. It is the one field here that is a claim about the file rather
  // than a claim in it. U8a moves it because the page gained a second language,
  // which is a change to what the page says.
  updatedAt: "2026-10-10",

  stages: [
    // Not a job: it is the event the workflow answers.
    { title: "PUSH", job: null },
    { title: "CHECK", job: "check" },
    { title: "DB", job: "db" },
    { title: "E2E", job: "e2e" },
    { title: "PUBLISH", job: "publish" },
    { title: "DEPLOY", job: "deploy" },
    // Inside `deploy`, not beside it: a verification that could be skipped
    // as its own job is not a gate.
    { title: "VERIFY", job: null },
  ],
};

/** Everything this study says, in English. */
export const CASE_WORDS_EN: CaseWords<StageTitle> = {
  headline: "This site is the system it describes.",

  // The row on the homepage and on `/work`. The sheet writes "This site as a
  // system — React Router front, Go API, Compose, CI/CD, VPS, monitoring";
  // correction #1 takes out the front end that was never built, and the rest is
  // dropped because the row already carries the stack in its own column, out of
  // stack.yaml. Naming it twice is how the two copies start disagreeing about the
  // version.
  blurb: "This site as a system — built, deployed and measured by the pipeline it documents.",

  year: "2026 — ongoing",
  /** The half of STATUS that is not the state word. The word comes from the api. */
  hosting: "self-hosted",

  problem: [
    // This sentence named the old positioning until U6 and was one of its two
    // last user-visible traces — the other was the rail's ROLE row. The words are
    // not repeated here on purpose: `tmp/umbau.md`'s closing grep reads this file
    // and counts LINES, so a comment quoting the old title would raise the number
    // the acceptance publishes and look like the phase had missed something.
    //
    // ADR 0079 settled what the systems here carry, and the sentence names that
    // instead — DevOps, without the "junior" the eyebrow and the bio already say.
    // It belongs there, where a reader meets it first; repeating it inside an
    // argument would weaken the argument rather than qualify it.
    "A portfolio that only shows screenshots asks the reader to take the " +
      "engineering on trust. For a DevOps role that is the wrong thing to ask: " +
      "the parts worth judging are service boundaries, deploys, and what " +
      "happens at three in the morning when a container dies.",
    "So the site had to be a running system rather than a description of one. " +
      "The front end is a client of a real API. The API has its own database, " +
      "its own container, its own health check. The infrastructure is mine to " +
      "break: DNS, TLS, reverse proxy, logs, backups, restarts.",
    // The sheet's third paragraph named a tracked file as the training log's
    // source. It is Postgres through the API (ADR 0005), and the uptime series
    // comes from a probe that runs outside this host on purpose — if the host
    // dies, the record of it has to survive (build plan 4.2). Both corrected
    // here rather than quoted wrong.
    "The second constraint was honesty. Nothing on the page is allowed to be a " +
      "decorative number. If a value is shown, something has to produce it — " +
      "the training log comes from Postgres through the API, the contribution " +
      "graph from the GitHub API, and the uptime series from a probe that runs " +
      "outside this host, so that an outage is still recorded when the machine " +
      "that would record it is the one that is down.",
  ],

  // Five, numbered, as the sheet draws them. Build plan chapter 3 quotes the
  // fourth back at itself when it refuses WebGL — "bricht Constraint 04 deiner
  // eigenen Fallstudie" — so these are load-bearing text, not decoration.
  constraints: [
    "One VPS. No managed platform, no serverless.",
    "Every displayed value has a source.",
    "Deploy must be one command and one rollback.",
    "Fast on a phone on mobile data.",
    "Operable by keyboard, AA contrast throughout.",
  ],

  // What the block under it is, and why it can be trusted. The sheet captions it
  // with a note about its own syntax colouring — "keys in Signal, values in
  // Amber" — which is a fact about the drawing and not about the system.
  composeCaption:
    "Nobody typed this block. It is cut out of the compose file the host " +
    "runs, by the same command that generates the types — and the build turns " +
    "red if that file moves and this block does not follow it.",

  stages: {
    PUSH: "A squash merge onto main. Nothing deploys from a branch.",
    CHECK: "Everything `make check` runs: vet, eslint, tsc, both unit suites, every rule.",
    DB: "Every migration up, then down, against a real Postgres.",
    E2E: "The browser suite at seven widths, against a production build.",
    PUBLISH: "Two images, tagged with the commit they were built from. Never `latest`.",
    DEPLOY: "The server pulls the tag and swaps the container. It never builds.",
    VERIFY:
      "A gate that asks the new container what it is running. It answers " +
      "with the commit, or the previous tag goes back.",
  },

  // Verbatim from Case Study 02, which draws the five tiles empty and says why
  // underneath. It is shown only while all five are empty — see components/case.
  emptyNote: {
    label: "EMPTY ON PURPOSE",
    text:
      "These five tiles fill from the first day of operation and stay empty " +
      "until then. A case study that shows uptime before the server has run is " +
      "the thing this page exists to argue against.",
  },
};

/** This study's words, per language. Registered in lib/i18n/complete.ts. */
export const TIMSEIL_DEV_WORDS: ContentBundle<CaseWords<StageTitle>> = {
  en: CASE_WORDS_EN,
  de: CASE_WORDS_DE,
};

/** The study in English. The registry's default and every test's fixture. */
export const timseilDev: CaseStudy = studyFrom(FACTS, CASE_WORDS_EN);

/** The study in the route's language, and the language it came back in. */
export function timseilDevFor(locale: Locale): {
  readonly study: CaseStudy;
  readonly resolved: Locale;
} {
  const { value, resolved } = resolveContent(TIMSEIL_DEV_WORDS, locale);
  return { study: studyFrom(FACTS, value), resolved };
}
