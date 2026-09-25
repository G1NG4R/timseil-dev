import Link from "next/link";

import type { Station } from "@/lib/about/trajectory";

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
 * `[SOON]` IS GONE FROM THIS FILE, AND NOT BY BEING SWITCHED OFF. Until U5 five
 * of the six bodies were `null` and this component printed the site's word for
 * a named absence in their place. U5 wrote the paragraphs, so `body` is a
 * `string` and the branch that handled its absence is deleted rather than left
 * unreachable. That is the opposite of the treatment the section shell gets one
 * file up in app/[lang]/about/page.tsx, and ADR 0080 says why: that branch
 * still has the `reasonKey`/`owedBy` pair behind it and a phase that means to
 * use it. This one had U5, and U5 has happened.
 *
 * A SHIPPED SYSTEM WITHOUT A PAGE PRINTS ITS NAME AND DOES NOT LINK. `/work`
 * already draws the cluster's row that way: ADR 0079 §2 gives `talos-prod` no
 * case study, so there is nothing to open. Invariant 5 asks that evidence never
 * point into nothing, and a name that is not a link points nowhere by
 * construction — the arrangement that breaks the invariant is an `<a>`, which is
 * why `href` now gates the link and not the whole cell. ADR 0055's cut still
 * stands where it was aimed: a station that shipped NOTHING gets no cell, not an
 * em dash.
 */
export function TrajectoryPanel({
  station,
  pickedUp,
  shippedLabel,
  href,
}: {
  station: Station;
  /** The label over the tag row. Nomenclature, but it names the group, so the
   *  page hands it in already resolved rather than the component inventing a
   *  second copy. */
  pickedUp: string;
  shippedLabel: string;
  /** Resolved by the page: the case study for this station's system, or `null`
   *  where that system has no page. Then the name stands without a link. */
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

        <p className="tl-body">{station.body}</p>
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

        {station.shipped === null ? null : (
          <>
            <p className="tl-aside-label">{shippedLabel}</p>
            <p className="tl-shipped">
              {href === null ? (
                station.shipped.label
              ) : (
                <Link href={href}>{station.shipped.label}</Link>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
