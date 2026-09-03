import Link from "next/link";

import type { Station } from "@/lib/about/trajectory";
import { SOON } from "@/lib/state/words";

/**
 * One station opened: what it is called, what it says, what was picked up, and
 * what shipped.
 *
 * SIX OF THESE ARE ALWAYS IN THE DOCUMENT and five of them are `display: none`.
 * That is the price of a rail with no JavaScript, and it is a small one: the
 * panels are prose, the hidden ones are out of the accessibility tree, and the
 * alternative is a client component that re-renders one. ADR 0066 does the
 * arithmetic.
 *
 * THE TAGS ARE NOT `FilterChip`s AND MUST NOT LOOK LIKE THEM. `PICKED UP` lists
 * what a station taught; nothing here selects anything, so these are `.tag` —
 * the class G7 built for a label — rather than the chip that carries
 * `aria-pressed`. A control that cannot be pressed is the dead state STATE.05
 * calls a bug, and a chip is a control by its shape alone.
 *
 * `[SOON]` AND NOT `— NO DATA`, five times out of six. lib/state/words.ts owns
 * both and they are different sentences: `— NO DATA` says a measurement was
 * attempted and did not arrive, `[SOON]` says the thing does not exist yet. No
 * measurement was attempted for a paragraph.
 */
export function TrajectoryPanel({
  station,
  soon,
  pickedUp,
  shippedLabel,
  href,
}: {
  station: Station;
  /** Why the prose is not here yet. Prose, from the dictionary. */
  soon: string;
  /** The label over the tag row. Nomenclature, but it names the group, so the
   *  page hands it in already resolved rather than the component inventing a
   *  second copy. */
  pickedUp: string;
  shippedLabel: string;
  /** Resolved by the page, and `null` where there is no case study to open —
   *  invariant 5. Then the cell is absent rather than dead. */
  href: string | null;
}) {
  return (
    <div className="tl-panel marks">
      <div className="tl-say">
        <p className="tl-head">
          {/* The station's own label, repeated here on purpose: the panel is
              scrolled to and read on its own, and a heading that did not say
              WHICH station it belongs to would be a heading about nothing. */}
          <span className="tl-head-no">{station.label}</span>
          <span className="tl-head-title">{station.title}</span>
        </p>

        {station.body === null ? (
          <p className="tl-soon">
            <span className="tl-soon-mark">{SOON}</span> {soon}
          </p>
        ) : (
          <p className="tl-body">{station.body}</p>
        )}
      </div>

      <div className="tl-aside">
        <p className="tl-aside-label">{pickedUp}</p>
        <p className="tl-tags">
          {station.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </p>

        {/* NO CELL AT ALL WHERE NOTHING SHIPPED, which is ADR 0055's cut for the
            fourth time on this site: a system nobody has built gets no row
            rather than an em dash. The sheet draws `—` on two of its six. */}
        {station.shipped === null || href === null ? null : (
          <>
            <p className="tl-aside-label">{shippedLabel}</p>
            <p className="tl-shipped">
              <Link href={href}>{station.shipped.label}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
