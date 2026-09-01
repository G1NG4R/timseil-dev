// What a case study is made of, apart from its numbers.
//
// Its own file so that content/case-studies/index.ts can hold the registry
// without importing every study to learn the shape, and so that a second system
// (build plan P7) gets the same fields or a type error rather than a page that
// silently omits one.
//
// EVERY FIELD HERE IS PROSE OR A LABEL. Nothing measured, nothing versioned:
// those come from /api/systems/{slug}, and lib/api/systems.ts reads them. If a
// field ever wants a number, that is the signal it belongs in the api instead.

/**
 * One station on the request path.
 *
 * `own` is the sheet's own vocabulary and not a styling flag: the Case Study Map
 * labels every box `EIGEN` or `EXTERN`, and the Template draws the two stations
 * that are our code with a signal border while the browser, the edge and the
 * volume keep the ordinary one. The distinction is what the section argues, so
 * it is content.
 */
export interface Hop {
  /** `CLIENT`, `EDGE`, `WEB`, `API`, `DATA` — the station, not the product. */
  readonly key: string;
  /** The thing standing there. A technology, never a version. */
  readonly name: string;
  readonly detail: string;
  /** Whether this station is code in this repository. */
  readonly own: boolean;
}

/** One of the lanes beside the path: the things that are not a request. */
export interface Lane {
  readonly key: string;
  readonly detail: string;
}

/**
 * One row of the decision table.
 *
 * `alternative` is required, and that is the point of the table rather than a
 * schema detail — the Operations sheet says it in one line: a choice recorded
 * without what it rejected "ist es keine Entscheidung".
 */
export interface Decision {
  readonly decision: string;
  readonly alternative: string;
  readonly why: string;
}

/** One phase of the build, in the order it happened. */
export interface Phase {
  readonly title: string;
  readonly detail: string;
}

/**
 * One stage of the pipeline that puts a commit on the server.
 *
 * `job` IS THE HALF THAT CAN BE CHECKED. The sheet draws seven boxes with a
 * duration under each — `[—s]` — and nothing measures a stage, so the duration
 * is left out for the reason `Hop` gives about hop latency. What is left is
 * seven names, and a name is exactly the kind of prose that goes stale silently:
 * a renamed job in `ci.yml` would leave this page describing a pipeline that no
 * longer exists.
 *
 * So a stage that IS a job in `.github/workflows/ci.yml` names it, and
 * lib/content/pipeline.test.ts holds the two against each other. `null` is for
 * the two stages that are real and are not jobs — the push that triggers the run
 * and the health gate that runs inside `deploy`.
 */
export interface Stage {
  /** The word in the box. `PUSH`, `CHECK`, `DEPLOY`. */
  readonly title: string;
  readonly detail: string;
  /** The `ci.yml` job with this name, or `null` when the stage is not a job. */
  readonly job: string | null;
}

/**
 * The card at the foot of `.05`: what is being built next.
 *
 * NO STATE WORD AND NO NUMBER, which is the whole decision. The sheet draws
 * `05 FOUNDRY ◇ QUEUED` — a system number and a state — and both of those live
 * in `systems`, not here. Reading them would mean a fifth `<Suspense>` boundary
 * and a second endpoint (`/api/systems`) on a page that makes one upstream call,
 * for a card; writing them here would put a state word in a file that is not
 * allowed to hold a measurement.
 *
 * So the card names the system and links to the Work Index, which is the page
 * whose job this is. H6 builds it and can give this card its source.
 */
export interface NextSystem {
  /** The system's name, as a person writes it. Not its slug. */
  readonly name: string;
  readonly detail: string;
}

export interface CaseStudy {
  /** The system's slug in `systems`. The route is `/work/<slug>`. */
  readonly slug: string;
  /** ISO date, `YYYY-MM-DD`. The page's real modification date for sitemap.ts. */
  readonly updatedAt: string;

  /** The `<h1>`. One sentence, not the system's name — the eyebrow says that. */
  readonly headline: string;
  readonly lead: string;
  /**
   * One line about the system, for a list that has room for a line.
   *
   * NOT `lead`, AND H5 IS WHY THE FIELD EXISTS. The homepage's system list draws
   * one row per system with a single descriptive column; `lead` is four
   * sentences written for a hero. Truncating it in the component would have been
   * the same defect as a second, shorter copy of the words (#293) with the
   * additional flaw that nobody could read the result before it shipped.
   *
   * SO IT LIVES HERE AND NOT IN THE DATABASE. `systems` holds slug, number,
   * name, state, source, stack and metrics — what a machine writes. A sentence
   * about what the system IS is prose, and migration 00002 keeps the table to
   * what a machine writes.
   *
   * A SYSTEM WITHOUT A CASE STUDY THEREFORE HAS NO BLURB, and that is the honest
   * shape rather than a gap to fill: `vat-check` is queued, has no repository and
   * nothing written about it. The row renders no description cell at all — ADR
   * 0055 made the same call about the hop latencies, where `— NO DATA` would have
   * promised a number that nobody is going to measure.
   */
  readonly blurb: string;
  /** The one red line on the page. */
  readonly alert: string;

  readonly role: string;
  readonly year: string;
  /** The qualifier after the state word in the spec rail's STATUS row. */
  readonly hosting: string;

  readonly problem: readonly string[];
  readonly constraints: readonly string[];

  /** `.02 ARCHITECTURE` — the request path, the lanes beside it, the decisions. */
  readonly architecture: {
    readonly hops: readonly Hop[];
    readonly lanes: readonly Lane[];
    readonly decisions: readonly Decision[];
  };

  /** `.03 BUILD` — the caption under the compose block, and the order of work. */
  readonly build: {
    readonly composeCaption: string;
    readonly phases: readonly Phase[];
  };

  /**
   * `.04 OPERATIONS` — how a commit reaches the server, and what watches it.
   *
   * THE GRID IS NOT IN HERE, and that is the shape of the section rather than an
   * omission: the 91 days, the notches and the incidents all come from
   * `/api/systems/{slug}`. This field is the prose around them.
   *
   * WHAT IS DELIBERATELY ABSENT. The Template draws a DATA SAFETY panel beside
   * the monitoring one — backup target, backup retention, the date of the last
   * restore drill, where the secrets live. The `Operations` sheet names three of
   * those four in its own list of what must not be published ("Nicht öffentlich:
   * Backup-Ziel und -Zeitplan. Wer weiß, wann gedumpt wird, weiß, wann die Last
   * steigt"), and CLAUDE.md's rule is wider still: the current state of a
   * security question about this host does not go on a public page.
   *
   * So the panel is not here and is not `— NO DATA` either. An em dash would say
   * a number is coming; this one is not coming, it is being withheld, and the
   * two are different sentences. ADR 0057 carries the decision — the page does
   * not carry the reason, because the reason is the shape of the answer.
   */
  readonly operations: {
    readonly stages: readonly Stage[];
    /**
     * The observability panel, in the shape the lanes already use.
     *
     * IT MUST NOT REPEAT `.02`. The architecture section already carries a
     * MONITOR lane and a POST-MORTEM lane; what stands here is what those two do
     * not say. No cadence, no port, no hostname — the same three the
     * architecture section's own comment refuses.
     */
    readonly observability: readonly Lane[];
  };

  /** `.05 RESULT` — what held, what would change, and what comes next. */
  readonly result: {
    readonly holds: readonly string[];
    /**
     * What would be done differently.
     *
     * EVERY LINE IS CHECKED AGAINST THE SAME RULE AS `.04`. "Verification happens
     * against production" is a sentence about engineering practice; "the panel is
     * still reachable from outside" would be a direction. The sheet's three lines
     * are fiction — a staging target, a WebGL budget, structured logs from the
     * first commit — and the replacements come from what this repository actually
     * did, each with something in `git log` or an issue behind it.
     */
    readonly change: readonly string[];
    readonly next: NextSystem;
  };

  readonly emptyNote: {
    readonly label: string;
    readonly text: string;
  };
}
