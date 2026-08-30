// The prose of system 02, and nothing a system produces.
//
// WHY IT IS A FILE AND NOT A COLUMN. `systems` has no text columns, on purpose:
// migration 00002 keeps the table to what a machine writes. Headline, lead and
// the problem section are written once by a person and change when that person
// changes their mind, which is a repository's job and not a database's.
//
// WHY IT IS TYPESCRIPT AND NOT MDX. The MDX renderer arrives with H9, and #192
// says the frontmatter schema is invented until it does. A typed module is
// checkable under `node --test` today, costs no dependency, and adds nothing to
// the initial JS — a server component reads it and ships the rendered text.
//
// WHY IT IS NOT IN lib/i18n/messages/. Those are the interface's words, and
// `resolveMessages()` discards an incomplete language whole rather than serve
// half a page. Three paragraphs of prose there would hang the case study on a
// translation that does not exist until P6. LANG.01's line is the one that
// decides it: "Übersetzt wird Prosa, nicht Nomenklatur" — the labels around this
// text (UPTIME · 91 D, ROLE, STACK) stay English either way.
//
// THE SHEETS ARE OLDER THAN THE DECISIONS, and two corrections from build plan
// chapter 7 land in this file rather than in a read-only sheet:
//
//   #1  the lead said "A React Router front end"          → Next.js
//   #2  the spec rail said PostgreSQL 16                  → comes from the api now
//
// The stack is deliberately NOT written here. It arrives from `systems.stack`,
// which `make gen` fills out of go.mod, package.json and compose.yaml — chapter
// 12.3's whole point is that nobody types a version into a page again. What this
// file may name is a technology, never its version.

import type { CaseStudy } from "./types.ts";

export const timseilDev: CaseStudy = {
  slug: "timseil-dev",

  // The sheet's own date for the copy below, not a build time. sitemap.ts asked
  // for exactly this in G5: "When H1 and H9 give pages a real modification date,
  // it comes from the content, and this is where it goes." A `new Date()` here
  // would move every page's date on every dependency bump.
  updatedAt: "2026-08-30",

  headline: "This site is the system it describes.",

  lead:
    "A Next.js front end, a Go API and a PostgreSQL database, built as separate " +
    "services and run on a single VPS I administer. Every number on the site " +
    "comes out of that API, and every deploy runs through the same pipeline as " +
    "the projects it links to.",

  // The one red moment on the page. The design notes card is explicit about it:
  // "Ein Alert-Moment: die rote Zeile im Hero. Sonst nur Signal-Cyan."
  alert: "YOU ARE INSIDE THIS PROJECT",

  role: "Design, backend, infrastructure — solo",
  year: "2026 — ongoing",
  /** The half of STATUS that is not the state word. The word comes from the api. */
  hosting: "self-hosted",

  problem: [
    "A portfolio that only shows screenshots asks the reader to take the " +
      "engineering on trust. For a backend and platform role that is the wrong " +
      "thing to ask: the parts worth judging are service boundaries, deploys, " +
      "and what happens at three in the morning when a container dies.",
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
