import Link from "next/link";

import { STACK } from "@/lib/about/content";

/**
 * SYS.05.02 — four tiles and the sentence that turns them into evidence.
 *
 * THIS IS THE SECTION THAT EXISTS TO PROVE RATHER THAN CLAIM. The sheet's own
 * design note: "WHAT I RUN ist die About-Version der Architektur-Platte — belegt
 * die Positionierung, statt sie zu behaupten." Two of the four tiles it draws
 * could not be backed by this repository, and lib/about/content.ts carries the
 * measurement and the correction. What is worth repeating here is the shape of
 * the correction: the SERVICES tile lost a NUMBER and the WATCH tile lost a
 * SENTENCE, and neither absence is announced. A tile reading "BACKUPS [SOON]"
 * would publish the state of this host, which is the one thing CLAUDE.md keeps
 * off every outward surface — so the honest correction to a claim about a host
 * is silence, not a placeholder.
 *
 * THE LINK IS THE EVIDENCE AND IT IS RESOLVED BY THE PAGE. `href` arrives
 * already built, because a component has no business knowing about locales —
 * the same reason `SectionHead`'s `action` is a `ReactNode`. And it arrives as
 * `null` when there is no case study to point at, which is not hypothetical
 * bookkeeping: `caseStudyFor` is the gate in front of `/work/[slug]`, and a
 * sentence that claims "the page you are reading is served by that stack" while
 * linking to a 404 would break invariant 5 in the one place this page is making
 * its argument.
 */
export function StackTiles({
  note,
  study,
}: {
  /** The closing sentence. Prose, from the dictionary. */
  note: string;
  study: { href: string; label: string } | null;
}) {
  return (
    <>
      <ul className="run-grid">
        {STACK.map((tile) => (
          <li className="run-tile" key={tile.label}>
            {/* The dot is the sheet's 5px mark and says nothing — it is not a
                `.st-dot`, because `.st-dot` is the geometry of a STATE and
                these four axes have none. state.css's split, kept honest in
                the other direction for once. */}
            <p className="run-label">
              <span className="run-mark" aria-hidden="true" />
              {tile.label}
            </p>
            <p className="run-title">{tile.title}</p>
            <p className="run-detail">{tile.detail}</p>
          </li>
        ))}
      </ul>

      <p className="run-note">
        <span className="run-note-text">{note}</span>
        {study === null ? null : (
          <Link className="run-note-exit" href={study.href}>
            {study.label} →
          </Link>
        )}
      </p>
    </>
  );
}
