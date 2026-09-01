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
  // the shape of this string and never its value.
  //
  // So the rule, until something enforces it: EDIT THE PROSE IN THIS FILE, MOVE
  // THIS DATE. It is the one field here that is a claim about the file rather
  // than a claim in it.
  updatedAt: "2026-08-31",

  headline: "This site is the system it describes.",

  lead:
    "A Next.js front end, a Go API and a PostgreSQL database, built as separate " +
    "services and run on a single VPS I administer. Every number on the site " +
    "comes out of that API, and every deploy runs through the same pipeline as " +
    "the projects it links to.",

  // The row on the homepage. The sheet writes "This site as a system — React
  // Router front, Go API, Compose, CI/CD, VPS, monitoring"; correction #1 takes
  // out the front end that was never built, and the rest is dropped because the
  // row already carries the stack in its own column, out of stack.yaml. Naming
  // it twice is how the two copies start disagreeing about the version.
  blurb: "This site as a system — built, deployed and measured by the pipeline it documents.",

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

  // ── .02 ARCHITECTURE ──────────────────────────────────────────────────────
  //
  // THE FORM IS THE SHEET'S, THE FACTS ARE THE REPOSITORY'S. The Case Study
  // Template draws this section with `React Router 7`, `PostgreSQL 16` and a Go
  // container that parses the access log into SQLite. All three are older than
  // ADR 0005 and ADR 0007, and `docs/architecture/c4-container.md` — which is
  // hand-written, current, and says of itself "Form angelehnt an Case Study Map"
  // — is the source used instead. The two documents describe one system and may
  // not disagree.
  //
  // NO VERSION, NO PORT, NO CADENCE. The version rule is this file's own, at the
  // top. The other two are CLAUDE.md's: the current state of a security question
  // about this host does not go on a public page, so the edge says what it does
  // and never which ports are open, and the monitor says that it measures from
  // outside without saying how often or where it reports.
  architecture: {
    // Five stations, as the sheet draws them. `own` marks the two that are code
    // in this repository — the browser is the visitor's, the edge is configured
    // rather than written, and the volume is the host's.
    hops: [
      {
        key: "CLIENT",
        name: "Browser",
        detail: "HTTPS · HTTP/2",
        own: false,
      },
      {
        key: "EDGE",
        name: "Traefik",
        detail: "TLS, routing, rate limit",
        own: false,
      },
      {
        key: "WEB",
        name: "Next.js",
        detail: "Server components. No data logic.",
        own: true,
      },
      {
        key: "API",
        name: "Go",
        detail: "The contract, the derivations, the database.",
        own: true,
      },
      {
        key: "DATA",
        name: "PostgreSQL",
        detail: "Named volume.",
        own: false,
      },
    ],

    // The things that are not a request. Five lanes in a four-column grid, so
    // the fifth wraps — the sheet draws exactly that, the same way the fifth
    // metric tile drops to its own row under 560.
    lanes: [
      {
        key: "CI",
        detail:
          "GitHub Actions builds and tests, the registry holds the image, and " +
          "the tag is the commit it was built from.",
      },
      {
        key: "ASSETS",
        detail: "Same origin, no CDN — nothing third-party in the path.",
      },
      {
        key: "EXTERNAL",
        detail:
          "The GitHub API for the contribution calendar, cached in the API so " +
          "a rate limit there is not an outage here.",
      },
      {
        key: "POST-MORTEM",
        detail:
          "No notch without a post-mortem. Cause, fix and the entry that " +
          "explains it are required fields, not good intentions.",
      },
      {
        key: "MONITOR",
        detail:
          "Uptime is measured from outside this host, so an outage is still " +
          "recorded when the machine that would record it is the one down.",
      },
    ],

    // The Template's four rows. All four still hold; what changed is the
    // alternative in the first (React Router → Next.js) and the reason in the
    // third, which now names the real argument: the derivations are SQL views,
    // and invariant 2 says a state is computed in one and nowhere else.
    decisions: [
      {
        decision: "A Go API as its own service",
        alternative: "Route handlers inside the Next.js app",
        why:
          "A real service boundary is the thing being demonstrated. The same " +
          "endpoints serve this page, the badges in the readme, and anyone " +
          "with curl — so the page and the claim cannot drift apart.",
      },
      {
        decision: "Docker Compose on one host",
        alternative: "Managed hosting, or Kubernetes on day one",
        why:
          "I wanted to own the runtime: proxy, TLS, logs, restarts. A second " +
          "host waits until a second project carries it, and Compose stays " +
          "small enough to hold in your head until then.",
      },
      {
        decision: "PostgreSQL, not a file",
        alternative: "A single embedded database on the host",
        why:
          "Every derived state on this site is a SQL view, and a view is the " +
          "only place one may be computed. Migrations, backups and restore " +
          "drills then transfer instead of being one-offs.",
      },
      {
        decision: "Deploy by image tag",
        alternative: "git pull and rebuild on the host",
        why:
          "Builds belong in CI, never on the machine serving traffic. The host " +
          "only pulls a tagged image, so a rollback is one tag and no build.",
      },
    ],
  },

  // ── .03 BUILD ─────────────────────────────────────────────────────────────
  build: {
    // What the block under it is, and why it can be trusted. The sheet captions
    // it with a note about its own syntax colouring — "keys in Signal, values in
    // Amber" — which is a fact about the drawing and not about the system.
    composeCaption:
      "Nobody typed this block. It is cut out of the compose file the host " +
      "runs, by the same command that generates the types — and the build turns " +
      "red if that file moves and this block does not follow it.",

    // The order is checkable rather than remembered: the contract landed on
    // 17.08.2026, the schema and the derivations the same day, the endpoints the
    // day after, the pipeline on the 20th, the deploy on the 22nd, and the first
    // line of interface on the 28th. `git log --diff-filter=A` says so.
    phases: [
      {
        title: "Contract first",
        detail:
          "The OpenAPI document before either side of it. Every type on this " +
          "page is generated from that file; none is written by hand.",
      },
      {
        title: "Data before pages",
        detail:
          "Schema, then the derivations as SQL views, then the endpoints. The " +
          "front end was never allowed to hold data.",
      },
      {
        title: "Pipeline before polish",
        detail:
          "The deploy gate, the health check and the rollback were automated " +
          "while the site was still a single empty page.",
      },
      {
        title: "Interface last",
        detail:
          "Tokens, chrome, then pages — all built against endpoints that were " +
          "already answering.",
      },
    ],
  },

  // ── .04 OPERATIONS ────────────────────────────────────────────────────────
  //
  // Same rule as `.02`, one notch tighter: NO VERSION, NO PORT, NO CADENCE, and
  // no statement about what is or is not yet hardened on this host. What the
  // sheet's DATA SAFETY panel asks for — backup target, backup schedule, the
  // date of the last restore drill, where the secrets live — is not written
  // anywhere below, and types.ts carries the reason.
  //
  // The stages are the real jobs of .github/workflows/ci.yml, not the sheet's
  // (`go test ./...`, `compose pull + up`). lib/content/pipeline.test.ts holds
  // every `job` below against that file, so a renamed job is a red test rather
  // than a page describing a pipeline that no longer exists.
  operations: {
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

    // Four lines that `.02` does not already say. The MONITOR lane there covers
    // where uptime is measured from and why; none of this repeats it.
    observability: [
      {
        key: "TRACES",
        detail:
          "One trace id joins the browser's request, this container and the " +
          "API, so a slow page has a span and not a theory.",
      },
      {
        key: "LOGS",
        detail:
          "Structured, one line per request, and neither an IP address nor the " +
          "contents of a form is in a position to be written.",
      },
      {
        key: "METRICS",
        detail:
          "Latency and error rate come from recording rules over the proxy's " +
          "own metrics, not from parsing an access log that gets rotated.",
      },
      {
        key: "RETENTION",
        detail:
          "Bounded by size and not only by age. Logs and metrics share a disk " +
          "with the database, and a time limit alone does not protect it.",
      },
    ],
  },

  // ── .05 RESULT ────────────────────────────────────────────────────────────
  result: {
    holds: [
      "Push to live is one pipeline with a health gate, and a rollback is one " +
        "image tag — no build, no branch, no guessing which commit is running.",
      "The API is the only source of a number on this site. Nothing shown here " +
        "can drift from what was recorded, because there is no second place to " +
        "drift to.",
      "Every type crossing the boundary is generated from one OpenAPI document. " +
        "A field the API renames is a build failure, not a blank cell somebody " +
        "notices in a screenshot three weeks later.",
    ],

    // Each of these is something that happened, with a commit or an issue
    // behind it. None of them is a statement about what is not yet hardened.
    change: [
      "Observability came after the pipeline instead of before it. Most of the " +
        "window above is unmeasured for exactly that reason: the grid could not " +
        "start filling until something was watching.",
      "A deploy duration went on this page before anyone asked what it counts. " +
        "It measures the whole pipeline run, waiting in a queue included, so an " +
        "unrelated merge landing first makes this system look slower. The tile " +
        "says pipeline now; the number still has to be redefined.",
      "One value on this page is still typed by a person — the date the copy " +
        "last changed. It was wrong for a day, which is the exact class of " +
        "mistake the rest of the site is built to make impossible.",
    ],

    next: {
      name: "VAT Check API",
      detail:
        "Specified, not written. It gets a page when it has a system to point " +
        "at rather than a plan.",
    },
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
