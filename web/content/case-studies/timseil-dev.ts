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
// WHAT U6 TOOK OUT, because a file this short should say why it is short. It held
// a lead paragraph, a red alert line, a role, a three-paragraph problem
// statement, five constraints, five request-path stations, five side lanes, four
// decisions with their alternatives, four build phases, four observability lines
// and a result section with two lists and a card. All of it was an argument about
// work someone else did the typing for. ADR 0079 §4 made that case for the log and
// named no other directory; ADR 0081 extended it to this one and states the test
// the survivors passed: a system produces them, or a check holds them.
//
// The stack is deliberately NOT written here. It arrives from `systems.stack`,
// which `make gen` fills out of go.mod, package.json and compose.yaml — chapter
// 12.3's whole point is that nobody types a version into a page again. What this
// file may name is a technology, never its version.

import type { CaseStudy } from "./types.ts";

export const timseilDev: CaseStudy = {
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
  // than a claim in it.
  updatedAt: "2026-09-26",

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

  // What the block under it is, and why it can be trusted. The sheet captions it
  // with a note about its own syntax colouring — "keys in Signal, values in
  // Amber" — which is a fact about the drawing and not about the system.
  composeCaption:
    "Nobody typed this block. It is cut out of the compose file the host " +
    "runs, by the same command that generates the types — and the build turns " +
    "red if that file moves and this block does not follow it.",

  // ── OPERATIONS ────────────────────────────────────────────────────────────
  //
  // NO VERSION, NO PORT, NO CADENCE, and no statement about what is or is not
  // yet hardened on this host. The version rule is this file's own, at the top.
  // The other three are CLAUDE.md's: the current state of a security question
  // about this host does not go on a public page.
  //
  // The stages are the real jobs of .github/workflows/ci.yml, not the sheet's
  // (`go test ./...`, `compose pull + up`). lib/content/pipeline.test.ts holds
  // every `job` below against that file, so a renamed job is a red test rather
  // than a page describing a pipeline that no longer exists. That test is the
  // reason this field survived U6 and the observability panel beside it did not.
  stages: [
    {
      title: "PUSH",
      detail: "A squash merge onto main. Nothing deploys from a branch.",
      // Not a job: it is the event the workflow answers.
      job: null,
    },
    {
      title: "CHECK",
      detail: "Everything `make check` runs: vet, eslint, tsc, both unit suites, every rule.",
      job: "check",
    },
    {
      title: "DB",
      detail: "Every migration up, then down, against a real Postgres.",
      job: "db",
    },
    {
      title: "E2E",
      detail: "The browser suite at seven widths, against a production build.",
      job: "e2e",
    },
    {
      title: "PUBLISH",
      detail: "Two images, tagged with the commit they were built from. Never `latest`.",
      job: "publish",
    },
    {
      title: "DEPLOY",
      detail: "The server pulls the tag and swaps the container. It never builds.",
      job: "deploy",
    },
    {
      title: "VERIFY",
      detail:
        "A gate that asks the new container what it is running. It answers " +
        "with the commit, or the previous tag goes back.",
      // Inside `deploy`, not beside it: a verification that could be skipped
      // as its own job is not a gate.
      job: null,
    },
  ],

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
