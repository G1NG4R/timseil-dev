import Link from "next/link";

import { NoData } from "@/components/state/NoData";
import { StatusDot } from "@/components/state/StatusDot";
import type { SystemEntry } from "@/lib/home/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { stateLabel } from "@/lib/state/words";

/**
 * One system of SYS.02: number, name, what it is, what it runs on, where it stands.
 *
 * NO `'use client'`, AND THE HOVER IS THE REASON THIS IS WORTH SAYING. The sheet
 * draws the row with a background and an inset cyan bar on hover; both are
 * declarations in styles/home.css. SkillRow settled the same question one
 * section up and the bundle has not moved since H3 — 143 580 B, measured.
 *
 * THE EXIT IS A LINK ONLY WHEN THERE IS SOMEWHERE TO GO. `href` is `null` for a
 * system with no case study, and lib/home/systems.ts says why that is the honest
 * shape rather than a gap: `/work/vat-check` is a 404, and a row that led there
 * would be the dead control STATE.05 refuses. So the arrow is dropped instead of
 * greyed out, and the state word beside it already says why: QUEUED.
 *
 * ONE LINK PER ROW, AND THE SHEET DRAWS TWO. Its fourth column carries
 * `CASE STUDY →` under the stack, and the sixth carries `→`; both go to the same
 * page. Two tab stops to one destination is the keyboard trap OpsGrid turned
 * down in H2b under its own name — "ninety-one tab stops in a row would be a
 * keyboard trap dressed as thoroughness". The arrow is kept because the mobile
 * artboard draws it too. Recorded as a divergence.
 *
 * THE SOURCE IS ITS OWN AXIS AND IT SITS IN THE STACK COLUMN, which is where the
 * sheet puts it, and K-21 is why it is not folded into the state: a public system
 * carries an address, a closed one carries a reason and no link. `[REPO URL]` in
 * the sheet is the address out of `source.url`, so there is no place here where a
 * repository could be typed.
 *
 * THE STATE CARRIES ITS DOT. The sheet draws `● LIVE` and `○ QUEUED`, so this is
 * `StatusDot` and not the bare `StateWord`: the dot is the feature that is not
 * colour, and dropping it would leave a reader with no colour vision reading the
 * word alone. The SHAPE is `MARKS`'s and not the sheet's — `queued` is a dash
 * there and a ring here, and ADR 0048 owns that vocabulary.
 */
export function SystemRow({ entry, messages }: { entry: SystemEntry; messages: Messages }) {
  return (
    <li className="sys-row">
      <span className="sys-no">{entry.no}</span>

      <span className="sys-name">{entry.name}</span>

      {/* Empty rather than absent: the grid has a column here, and a row that
          skipped it would pull the three cells after it one place left. */}
      <span className="sys-blurb">{entry.blurb}</span>

      <span className="sys-meta">
        <span className="sys-stack">{entry.stack ?? <NoData />}</span>
        <SourceLine entry={entry} />
      </span>

      <span className="sys-state">
        {entry.state === null ? (
          <NoData />
        ) : (
          <StatusDot state={entry.state} label={stateLabel(entry.state, messages)} />
        )}
      </span>

      <span className="sys-exit">
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
 * THE SAME TWO ARMS `SpecRail` DRAWS, and deliberately not the same component:
 * that one is a `<dd>` in a description list with a `.spec-why` line under it,
 * this one is a cell in a row. What they share is the judgement, and that lives
 * in `sourceView`, where both read it.
 *
 * THE ADDRESS IS NOT A LINK HERE. On the case study it is a row a reader came
 * for; in a list it would be a second tab stop per row pointing somewhere other
 * than where the row goes — the thing this file turns down one level up. The
 * address is printed, so it can still be read and copied.
 */
function SourceLine({ entry }: { entry: SystemEntry }) {
  if (entry.source === null) return null;

  if (entry.source.access === "public") {
    return (
      <span className="sys-source">
        {"<> PUBLIC · "}
        {entry.source.url.replace(/^https:\/\//, "")}
      </span>
    );
  }

  return <span className="sys-source">{`<> PRIVATE · ${entry.source.reason.toUpperCase()}`}</span>;
}
