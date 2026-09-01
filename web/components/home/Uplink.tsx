import type { ReactNode } from "react";

import { SectionHead } from "@/components/ui/SectionHead";

/**
 * SYS.03 whole: the head, and the two blocks under it.
 *
 * THE HEAD IS OUTSIDE BOTH BOUNDARIES, which is where this section differs from
 * the two above it. SYS.01 and SYS.02 keep their heads inside the streamed
 * region because the meta line carries the ANSWER'S count — `22 TRACKS`,
 * `02 SYSTEMS` — and a head rendered before the answer would either say nothing
 * or need a second pass for one line. This meta says something that is true
 * before either endpoint replies, so it is prerendered with the rest of the
 * shell and the two blocks arrive under it.
 *
 * TWO BOUNDARIES AND NOT ONE, and the section's own deleted sentence is the
 * reason: "two blocks, each naming its own source. NEITHER is drawn before ITS
 * source has answered." The calendar is an hour-cached answer from GitHub and
 * the strip is a five-minute answer from our own database; under one boundary
 * the strip would wait for GitHub every time GitHub was slow, and the page would
 * hold back a number it already had.
 *
 * The blocks arrive as nodes rather than being rendered here, because the
 * Suspense wiring lives in app/[lang]/page.tsx with the other two — one file
 * that says which regions of this page stream.
 */
export function Uplink({ graph, strip }: { graph: ReactNode; strip: ReactNode }) {
  return (
    <section className="home-section upl" aria-labelledby="sec-sys-03">
      <SectionHead
        id="SYS.03"
        title="UPLINK"
        titleId="sec-sys-03"
        // The sheet's own line, in English. It is a statement and not a count,
        // which is exactly why this head does not have to wait for anything.
        meta="TWO BLOCKS · EACH NAMES ITS SOURCE"
      />
      {graph}
      {strip}
    </section>
  );
}
