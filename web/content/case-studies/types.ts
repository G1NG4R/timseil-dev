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
//
// AND AS OF U6 THERE ARE ELEVEN OF THEM, where there were eighteen. The phase cut
// the argument out of this file and kept what something else produces or holds:
// `composeCaption` explains a block `make gen` writes, `stages` is a list of
// names lib/content/pipeline.test.ts holds against the workflow, and the rest is
// a slug, a date and three labels. What went is the request path, the decision
// table, the build phases, the observability panel and the result. ADR 0081
// carries the rule; ADR 0079 §4 is where the argument was first made — about
// `web/content/posts/`, which is the only directory it names.
//
// TWO CAME BACK, AND THE ADDENDUM TO ADR 0081 SAYS WHY. `problem` and
// `constraints` were cut with the rest and restored a few hours later, because
// the criterion that cut them — "nothing holds it" — is true of them and is not
// the whole question. They are the only text on the page that says WHY it is
// built this way, and a page whose entire argument is "every claim has evidence"
// still owes the reader the sentence that states the argument. The constraints
// are load-bearing besides: build plan chapter 3 refuses WebGL by quoting
// Constraint 04 back at this list.

/**
 * One stage of the pipeline that puts a commit on the server.
 *
 * `job` IS THE HALF THAT CAN BE CHECKED, and after U6 it is the reason this
 * interface is the only one left in here. The sheet draws seven boxes with a
 * duration under each — `[—s]` — and nothing measures a stage, so the duration
 * is left out: a number no system produces is invariant 1's whole subject. What
 * is left is seven names, and a name is exactly the kind of prose that goes
 * stale silently — a renamed job in `ci.yml` would leave this page describing a
 * pipeline that no longer exists.
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

export interface CaseStudy {
  /** The system's slug in `systems`. The route is `/work/<slug>`. */
  readonly slug: string;
  /** ISO date, `YYYY-MM-DD`. The page's real modification date for sitemap.ts. */
  readonly updatedAt: string;

  /**
   * The `<h1>`. One sentence, not the system's name — the eyebrow says that.
   *
   * THE ONE SENTENCE U6 LEFT STANDING, and it is here rather than in the api
   * because a document needs a heading before anything has answered. The lead
   * paragraph and the red alert line that stood beside it are gone: both argued,
   * and `alert` argued in the one colour this page reserves for an outage.
   */
  readonly headline: string;
  /**
   * One line about the system, for a list that has room for a line.
   *
   * NOT A HEADLINE, AND H5 IS WHY THE FIELD EXISTS. The homepage's system list
   * draws one row per system with a single descriptive column. Truncating a
   * longer field in the component would have been the same defect as a second,
   * shorter copy of the words (#293) with the additional flaw that nobody could
   * read the result before it shipped.
   *
   * SO IT LIVES HERE AND NOT IN THE DATABASE. `systems` holds slug, number,
   * name, state, source, stack and metrics — what a machine writes. A sentence
   * about what the system IS is prose, and migration 00002 keeps the table to
   * what a machine writes.
   *
   * IT SURVIVED U6 BECAUSE IT IS NOT ON THIS PAGE. The phase cut the case
   * study's prose; this line is drawn by components/home/SystemRow.tsx and
   * components/work/WorkRow.tsx, and cutting it would have emptied a column on
   * two pages the phase was not about.
   *
   * A SYSTEM WITHOUT A CASE STUDY THEREFORE HAS NO BLURB, and that is the honest
   * shape rather than a gap to fill: `talos-prod` is in_build, its repository is
   * private and nothing is written about it. The row renders no description
   * cell at all — ADR 0055 made the same call about the hop latencies, where
   * `— NO DATA` would have promised a number that nobody is going to measure.
   */
  readonly blurb: string;

  /**
   * The YEAR row of the spec rail.
   *
   * IT STAYS TYPED AND `role` DID NOT, which is the line ADR 0081 draws inside
   * this component: a year is a statement about the system, and the system is
   * the thing the page is about. `role` was a statement about its author, and
   * the author's own account of himself is the one claim on this site that no
   * running system can carry.
   */
  readonly year: string;
  /** The qualifier after the state word in the spec rail's STATUS row. */
  readonly hosting: string;

  /**
   * `.01 PROBLEM` — three paragraphs on why the site is a running system.
   *
   * THE ONE BLOCK HERE THAT NOTHING CHECKS AND THAT STAYS ANYWAY. Every other
   * surviving field is produced or held: the compose caption describes a
   * generator, `stages` is held against `ci.yml`. This is an argument, and the
   * addendum to ADR 0081 is the decision that an argument about why the system
   * exists is not the same as an argument dressed up as a measurement.
   *
   * IT MAY NOT NAME A ROLE THAT NO SYSTEM CARRIES. The first paragraph read
   * "for a backend and platform role" until U6, which was one of the two last
   * user-visible traces of the positioning ADR 0079 took back. It names the
   * role the systems do carry, or it names none.
   */
  readonly problem: readonly string[];
  /**
   * The five numbered constraints in the rail beside it.
   *
   * LOAD-BEARING TEXT, NOT DECORATION, and the build plan proves it rather than
   * asserting it: chapter 3 refuses WebGL by quoting "bricht Constraint 04
   * deiner eigenen Fallstudie" back at this list. A numbered claim that another
   * document argues from is the closest this file gets to a held one.
   */
  readonly constraints: readonly string[];

  /**
   * The caption over the compose block — what it is, and why it can be trusted.
   *
   * IT IS DESCRIPTION AND NOT ARGUMENT, which is why U6 kept it. Every claim in
   * it is about a mechanism that exists: tools/gen-compose-excerpt.mjs cuts the
   * block out of the file the host runs, `make gen` runs it, and the checksum
   * comparison in `make check` turns the build red if the two drift apart. A
   * reader can verify the sentence by moving the file.
   */
  readonly composeCaption: string;

  /**
   * How a commit reaches the server. Seven stages, in order.
   *
   * THE GRID IS NOT IN HERE, and that is the shape of the page rather than an
   * omission: the 91 days, the notches and the incidents all come from
   * `/api/systems/{slug}`.
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
  readonly stages: readonly Stage[];

  readonly emptyNote: {
    readonly label: string;
    readonly text: string;
  };
}
