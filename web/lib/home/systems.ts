// What SYS.02 draws, once the answer and the repository have been put together.
//
// TWO SOURCES, AND THE SEAM IS HERE RATHER THAN IN THE COMPONENT. The numbers
// come from `/api/systems` — slug, number, name, state, source, stack — and the
// one sentence about what a system IS comes from content/case-studies, because
// migration 00002 keeps the `systems` table to what a machine writes. Joining
// them in the section component would have put the join somewhere `npm test`
// cannot reach: it reads `lib/**` and `styles/**`, and Node strips types but
// does not transform JSX. lib/seo/pages.ts already imports the same directory
// from lib/ for the same reason.
//
// AND NOT IN lib/api/systems.ts EITHER. That file is about one endpoint's
// answer, and everything in it can be checked against contract/openapi.yaml. A
// function there that also knew about a directory of prose would be a reader
// with a second subject.

import { caseStudyFor, caseStudyPath } from "../../content/case-studies/index.ts";
import { type SystemList, type SystemRowView, systemRows } from "../api/systems.ts";

/** One row of SYS.02, with the two sources already joined. */
export interface SystemEntry extends SystemRowView {
  /**
   * The one line about the system, or nothing.
   *
   * `null` FOR A SYSTEM NOBODY HAS WRITTEN ABOUT, and the row then draws no
   * description at all rather than `— NO DATA`. The two are different claims:
   * `— NO DATA` says a measurement was attempted and did not arrive, and nobody
   * attempts a sentence. ADR 0055 made the same call about the hop latencies.
   */
  readonly blurb: string | null;
  /**
   * Where the row leads, or nothing.
   *
   * A SYSTEM IS NOT A CASE STUDY — content/case-studies/index.ts holds the
   * argument, and this is the place it becomes visible. `vat-check` is queued,
   * has no repository and nothing written about it, so `/work/vat-check` is a
   * 404; a row that linked there would be a promise the router refuses. The
   * component renders the exit as text when this is `null`.
   */
  readonly href: string | null;
}

/**
 * The rows of SYS.02.
 *
 * IT ADDS NOTHING TO THE ORDER. `systemRows` takes the answer's order and this
 * keeps it; the case study lookup is per row and cannot reorder anything.
 *
 * THE LOOKUP IS THE ROUTE'S OWN GATE. `caseStudyFor` is what
 * app/[lang]/work/[slug]/page.tsx calls before it asks the api anything, so a
 * row links exactly when the destination renders. Two lists of "which systems
 * have a page" would be one list too many — and the second one would be this
 * one, because it is the one nobody visits.
 */
export function systemEntries(body: SystemList | null): readonly SystemEntry[] {
  return systemRows(body).map((row) => {
    const study = caseStudyFor(row.slug);

    return {
      ...row,
      blurb: study === null ? null : study.blurb,
      href: study === null ? null : caseStudyPath(study),
    };
  });
}
