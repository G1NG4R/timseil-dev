import Link from "next/link";

import { NoData } from "@/components/state/NoData";
import { StatusDot } from "@/components/state/StatusDot";
import { WorkPreview } from "@/components/work/WorkPreview";
import type { Messages } from "@/lib/i18n/messages/en";
import { stateLabel } from "@/lib/state/words";
import type { WorkEntry } from "@/lib/work/entries";

/**
 * One system on `/work`: number, what it is, how it runs, where it stands.
 *
 * NO `'use client'`. The hover is two declarations in styles/work.css, exactly
 * as `SystemRow` settled it for SYS.02 — and the bundle has not moved since H3
 * because of that rule rather than in spite of it.
 *
 * ONE LINK PER ROW, AND THE SHEET DRAWS THREE. It gives the row a pointer
 * cursor and a hover fill, a `CASE STUDY →` in the identity block, and a `→` in
 * the sixth column — all three going to the same page, plus a repo address that
 * goes somewhere else. `SystemRow` turned down that exact duplication in H5a
 * under OpsGrid's name for it, "a keyboard trap dressed as thoroughness", and
 * the argument is unchanged: two tab stops to one destination is a cost paid by
 * the reader who has the least room to pay it.
 *
 * SO THE ARROW IS THE CONTROL AND THE HOVER IS EMPHASIS. That also settles the
 * nesting the sheet's drawing implies — a row that is itself a link, containing
 * links, is invalid markup, and the stretched-link trick that works around it
 * would put the whole row in the tab order and then have to take the nested
 * links back out of it. Nothing here needs that: the row is not a link.
 *
 * WHAT THE ARROW SAYS IS IN ITS ACCESSIBLE NAME. `CASE STUDY →` is the phrase
 * the sheet uses to tell a reader what is behind the arrow, and dropping the
 * text without replacing it would leave a bare glyph. `homeSystemsExit` is the
 * same sentence SYS.02 already uses for the same destination.
 *
 * A ROW WITH NOWHERE TO GO CARRIES NO CONTROL AT ALL — not a greyed-out one.
 * STATE.05 refuses a dead control, the state column beside it already says
 * QUEUED, and `/work/vat-check` is a 404 that no arrow may promise.
 */
export function WorkRow({ entry, messages }: { entry: WorkEntry; messages: Messages }) {
  return (
    <li
      className="work-row"
      data-here={entry.here ? "" : undefined}
      // WHAT THE TWO AXES OF `/work` READ, ON THE ELEMENT THEY SELECT. H6b
      // filters in React rather than by walking the DOM as the sheet's script
      // does, so nothing in this site's own code needs these — they are here so
      // that a test can hold the rendered row against the chip that claims it,
      // which is the one assertion neither the filter's unit test nor a
      // screenshot can make. `undefined` rather than an empty string for a
      // state this build cannot name: an attribute reading `data-st=""` would
      // be a row claiming a state, and there is none.
      data-st={entry.state ?? undefined}
      data-sk={entry.tags.length === 0 ? undefined : entry.tags.map((tag) => tag.key).join(" ")}
    >
      <span className="work-no">{entry.no}</span>

      <span className="work-id">
        <span className="work-namebar">
          <span className="work-name">{entry.name}</span>
          {/* THE ONE ALERT-RED MOMENT ON THIS PAGE, and the sheet marks it as
              such. It is a statement about where the reader is standing, not a
              state of the system, so it is not a `StateWord` and carries no
              dot — `MARKS` would have to invent a ninth meaning for a badge
              that means "you". */}
          {entry.here ? <span className="work-here">YOU ARE HERE</span> : null}
        </span>

        {/* Absent rather than `— NO DATA` when nobody wrote one. ADR 0055:
            `— NO DATA` says a measurement was attempted and did not arrive, and
            nobody attempts a sentence. lib/home/systems.ts made the same call
            for the same field. */}
        {entry.blurb === null ? null : <span className="work-blurb">{entry.blurb}</span>}

        <span className="work-stack">{entry.stack ?? <NoData />}</span>

        <SourceLine entry={entry} />

        {/* Text, not a link, and this is the third time this site has made that
            call: `/blog/<slug>` is a 404 until H9 builds the renderer, and
            evidence never points into nothing (invariant 5). `IncidentLog`
            prints a post_slug as text and `lib/seo/feed.ts` serves an empty
            feed for the same reason. lib/work/log.ts holds the argument. */}
        {entry.logLine === null ? null : <span className="work-log">{entry.logLine}</span>}
      </span>

      {/* Empty rather than absent: the grid has a column here, and a row that
          skipped it would pull the three cells after it one place left. The
          CELL is always drawn; whether it has a FIGURE in it is
          lib/work/figure.ts's judgement, and for a system nobody measures the
          answer is nothing at all. */}
      <span className="work-figure">
        {entry.figure === null ? null : (
          <>
            <span className="work-figure-label">{entry.figure.label}</span>
            <span className="work-figure-value">
              {entry.figure.value === null ? (
                <NoData />
              ) : (
                `${entry.figure.value}${entry.figure.unit ?? ""}`
              )}
            </span>
          </>
        )}
      </span>

      <span className="work-state">
        {entry.state === null ? (
          <NoData />
        ) : (
          <StatusDot state={entry.state} label={stateLabel(entry.state, messages)} />
        )}
      </span>

      <WorkPreview />

      <span className="work-exit">
        {entry.href === null ? null : (
          <Link href={entry.href} aria-label={`${messages.homeSystemsExit}: ${entry.name}`}>
            →
          </Link>
        )}
      </span>
    </li>
  );
}

/**
 * `<> PUBLIC · github.com/G1NG4R/timseil-dev`, or the reason there is no link.
 *
 * TRANSCRIBED FROM `SystemRow`'s, AND THAT IS A COPY THIS FILE OWNS UP TO. The
 * two rows draw the same two arms from the same `sourceView` judgement, in
 * different grids with different class names. Lifting the markup into a shared
 * component would give one file two callers with two stylesheets and no
 * behaviour to share; what actually must not diverge is the JUDGEMENT, and that
 * is in `sourceView` where both read it.
 *
 * THE ADDRESS IS NOT A LINK, for the reason the row gives above: it would be a
 * second tab stop per row pointing somewhere other than where the row goes. It
 * is printed, so it can still be read and copied.
 */
function SourceLine({ entry }: { entry: WorkEntry }) {
  if (entry.source === null) return null;

  if (entry.source.access === "public") {
    return (
      <span className="work-source">
        {"<> PUBLIC · "}
        {entry.source.url.replace(/^https:\/\//, "")}
      </span>
    );
  }

  return <span className="work-source">{`<> PRIVATE · ${entry.source.reason.toUpperCase()}`}</span>;
}
