// One row of the Work Index, with all four of its sources already joined.
//
// FOUR SOURCES, AND THE SEAM IS HERE RATHER THAN IN THE COMPONENT — the rule
// lib/home/systems.ts set for SYS.02, applied to a row that carries twice as
// much. The numbers come from `/api/systems`, the one sentence about what a
// system IS comes from content/case-studies, the entry count comes from the
// files in content/posts, and the mark for the state comes from the state
// language. Joining them in the component would put the join somewhere
// `npm test` cannot reach: it reads lib/** and styles/**, and Node strips types
// but does not transform JSX.
//
// IT BUILDS ON `systemEntries` INSTEAD OF REPEATING IT. Two of the four sources
// are already joined there, including the one that decides whether the row
// leads anywhere at all — `caseStudyFor`, which is the same gate
// app/[lang]/work/[slug]/page.tsx calls before it asks the api anything. A
// second list of which systems have a page would be one list too many, and it
// would be this one, because it is the one nobody visits.

import type { SystemList } from "../api/systems.ts";
import type { PostMeta } from "../content/posts.ts";
import { type SystemEntry, systemEntries } from "../home/systems.ts";
import type { Messages } from "../i18n/messages/en.ts";
import { SITE_SYSTEM_SLUG } from "../site.ts";

import { workFigure } from "./figure.ts";
import { logEntriesFor, logEntriesLine } from "./log.ts";
import { type StackTag, tagsOf } from "./stacks.ts";

/** One row of `/work`. */
export interface WorkEntry extends SystemEntry {
  /**
   * Whether this row is the site the reader is on.
   *
   * The sheet's one alert-red moment: `YOU ARE HERE` on the row for this
   * system. Read from `SITE_SYSTEM_SLUG`, which is the constant that already
   * decides which system the homepage strip is about — not from the case study,
   * which would make "has a page" and "is this site" the same fact and they are
   * not.
   */
  readonly here: boolean;
  /**
   * The operating figure, or nothing at all. lib/work/figure.ts says which
   * states get one and why the other two get no cell rather than `— NO DATA`.
   */
  readonly figure: ReturnType<typeof workFigure>;
  /** `15 ENTRIES IN THE LOG`, or nothing. Text, never a link — see log.ts. */
  readonly logLine: string | null;
  /**
   * The row's stack, as filter tokens.
   *
   * BESIDE `stack` AND NOT INSTEAD OF IT. `stack` is the line the row PRINTS,
   * versions and all, joined by `stackLine`; these are what the filter MATCHES,
   * with the versions dropped. They are two different jobs for one array, and
   * collapsing them would either put a version in a filter key or take it off
   * the page.
   */
  readonly tags: readonly StackTag[];
}

/**
 * Every row of `/work`, in the order the api sent them.
 *
 * THE ORDER IS THE API'S, unchanged from `systemRows`: `ListSystems` ends with
 * `ORDER BY s.system_no`, so the display number a reader sees is the position
 * they read it in. Sorting again here would be a second opinion about an order
 * that is already decided, and it would be the opinion that goes stale.
 *
 * THE RAW SYSTEMS ARE INDEXED BY SLUG, because `SystemRowView` deliberately
 * does not carry everything: `stack` arrives as a printed line and `metrics`
 * does not arrive at all. Both are needed here and neither belongs in that
 * view, which exists for a row that shows neither. The index keeps the FIRST
 * of two rows sharing a slug — `systems.slug` is unique in the database, so a
 * duplicate on the wire is a build disagreeing with itself, and taking the
 * first matches the order the list is drawn in.
 */
export function workEntries(
  body: SystemList | null,
  posts: readonly PostMeta[],
  messages: Messages,
): readonly WorkEntry[] {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  const bySlug = new Map<string, Record<string, unknown>>();

  if (Array.isArray(raw.systems)) {
    for (const entry of raw.systems as unknown[]) {
      // `entry` is whatever arrived. A non-object cannot carry a slug and is
      // simply never indexed; `systemEntries` has already refused it too.
      const system = (entry ?? {}) as Record<string, unknown>;
      const slug = system.slug;
      if (typeof slug === "string" && !bySlug.has(slug)) bySlug.set(slug, system);
    }
  }

  return systemEntries(body).map((entry) => {
    const system = bySlug.get(entry.slug) ?? {};

    return {
      ...entry,
      here: entry.slug === SITE_SYSTEM_SLUG,
      figure: workFigure(entry.state, system.metrics, messages),
      logLine: logEntriesLine(logEntriesFor(posts, entry.slug)),
      tags: tagsOf(system.stack),
    };
  });
}
