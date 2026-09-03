// The six stations of SYS.05.01, as data.
//
// WHY THERE ARE NO YEARS, AND WHY THAT IS THE WHOLE DECISION. The sheet labels
// five of the six `[Y1]`–`[Y5]` and the sixth `NOW`, and its own design note
// says what the brackets are for: "Alle Jahre [Y1–Y5] … sind Platzhalter — die
// Inhalte der Rail sind meine Struktur, deine Fakten." Nothing in this
// repository carries a date for any of them: `seed.sql` declares two systems
// and neither has one, and `caseStudyPaths()` answers with a single path.
//
// A timeline asserts two things — WHEN and IN WHAT ORDER. The first cannot be
// backed here and the second is the whole point of the component, so the label
// is the position. That is also the notation this page already speaks:
// `SYS.05.01`–`04` number its sections and `01`–`04` number the principles one
// section down. K2 swaps ordinals for years by editing this file and nothing
// else — the label is data, not markup.
//
// AND IT COLLIDES WITH THE SYSTEM NUMBERS, SO THE TWO ARE KEPT APART BY SHAPE.
// `01` and `02` also name SYSTEMS on this site. A bare number is a station; a
// number WITH A NAME is a system — `02 timseil.dev` in the shipped cell, never
// a bare `02`. trajectory.test.ts holds that apart rather than hoping.

/** One station: where it sits, what it is called, and what it can prove. */
export interface Station {
  /** Stable across renders, used to tie a radio to its label and its panel. */
  readonly key: string;
  /** What the rail prints above the dot. The position, or `NOW` for the last. */
  readonly label: string;
  /** The line under the dot — short, because six of them share a row. */
  readonly caption: string;
  /** The panel's heading. */
  readonly title: string;
  /**
   * The panel's prose, or `null` where there is nothing true to write yet.
   *
   * FIVE OF SIX ARE `null` TODAY, and that is the honest count rather than a
   * gap in the work. The sheet's bodies are bracketed German briefs — the exact
   * thing H7a's guard refuses — and one station is the only one this repository
   * can speak for: the site you are reading.
   */
  readonly body: string | null;
  /** What was picked up here. Technology names, so nomenclature, so inline. */
  readonly tags: readonly string[];
  /**
   * The system this station shipped, or `null`.
   *
   * `slug` IS RESOLVED BY THE PAGE, not here, and only where a case study
   * exists — invariant 5, and the same gate `/work` puts in front of a row's
   * arrow. Exactly one station has one.
   */
  readonly shipped: { readonly slug: string; readonly label: string } | null;
}

/**
 * The six, in the order the sheet draws them.
 *
 * WHAT SURVIVED THE SHEET AND WHAT DID NOT:
 *
 *   the years          → ordinals, above.
 *   the German bodies  → `null`, and the panel says `[SOON]` with a reason.
 *   the German notes   → gone. They are commentary on bodies that do not exist.
 *   `[LANGUAGE]`       → dropped from station 01's tags. A bracket is a tag
 *                        that names nothing.
 *   `AWS`              → dropped from station 05's tags. This site runs on one
 *                        VPS at OVH and ADR 0008 says why; a tag naming a cloud
 *                        that appears nowhere in this repository is the tag
 *                        version of `4 containers`.
 *   `04 timseil.dev`   → `02 timseil.dev`. The sheet numbers five systems and
 *                        `seed.sql` declares two; the number a station ships is
 *                        the one the system actually carries.
 */
export const STATIONS: readonly Station[] = [
  {
    key: "s1",
    label: "01",
    caption: "First lines of code",
    title: "First lines of code",
    body: null,
    tags: ["GIT", "LINUX BASICS"],
    shipped: null,
  },
  {
    key: "s2",
    label: "02",
    caption: "Fundamentals, the hard way",
    title: "Fundamentals, the hard way",
    body: null,
    tags: ["C", "DATA STRUCTURES", "ALGORITHMS"],
    shipped: null,
  },
  {
    key: "s3",
    label: "03",
    caption: "First service in public",
    title: "First service in public",
    body: null,
    tags: ["PYTHON", "FASTAPI", "HTTP", "DOCKER"],
    shipped: null,
  },
  {
    key: "s4",
    label: "04",
    caption: "Go, and the container habit",
    title: "Go, and the container habit",
    body: null,
    tags: ["GO", "POSTGRESQL", "JWT", "COMPOSE"],
    shipped: null,
  },
  {
    key: "s5",
    label: "05",
    caption: "Own infrastructure",
    title: "Own infrastructure",
    // THE ONE BODY THIS REPOSITORY CAN SPEAK FOR, and every clause in it points
    // at something a reader can open: the case study draws the request path and
    // quotes the compose file, the operation grid counts the days, and the log
    // carries the post-mortems. Nothing here is a number, which is why it can
    // be prose rather than a measurement.
    body:
      "One VPS instead of a hosted platform: the proxy, the certificates, the " +
      "logs and the restarts are mine. The site you are reading is that " +
      "machine describing itself — every figure on it comes from the system " +
      "that produces it, and the outages are written down rather than waited out.",
    tags: ["VPS", "CI/CD", "OBSERVABILITY"],
    shipped: { slug: "timseil-dev", label: "02 timseil.dev" },
  },
  {
    key: "s6",
    label: "NOW",
    caption: "Platform work",
    title: "Platform work",
    body: null,
    // The build plan names these as what comes next, and it also names
    // Kubernetes in its "do not build" list for THIS system — the two are not
    // in conflict: the next service is where it is learned, not this one.
    tags: ["KUBERNETES", "QUEUES", "DISTRIBUTED SYSTEMS"],
    shipped: null,
  },
];

/** The station the rail rests on: the last one, which is `NOW`. */
export function restingStation(): number {
  return STATIONS.length - 1;
}

/**
 * How far the fill line has run when station `index` is chosen, as a percentage.
 *
 * THE CENTRE OF THE DOT, NOT THE EDGE OF THE COLUMN. Each station owns `1/n` of
 * the rail and its dot sits at the start of its own column, so the fill has to
 * reach `(index + 0.5) / n` for the line to end under the mark rather than past
 * it. It is written here rather than in the stylesheet so a test can hold the
 * six numbers against the arithmetic instead of against six hand-typed widths.
 *
 * THE SHEET MEASURES THIS WITH `getBoundingClientRect()` AND THIS DOES NOT. Its
 * script reads the dot's box on every paint; that is a measurement taken before
 * the display face has loaded and then never again, because the sheet has no
 * resize handling. A percentage of the track is the same line with nothing to
 * go stale.
 */
export function fillPercent(index: number): number {
  return ((index + 0.5) / STATIONS.length) * 100;
}
