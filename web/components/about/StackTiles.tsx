import { STACK } from "@/lib/about/content";

/**
 * SYS.05.02 — six tiles, one per axis of the cluster this page's role rests on.
 *
 * THIS IS THE SECTION THAT EXISTS TO PROVE RATHER THAN CLAIM. The sheet's own
 * design note: "WHAT I RUN ist die About-Version der Architektur-Platte — belegt
 * die Positionierung, statt sie zu behaupten." H7a held the four tiles it drew
 * against this repository and two of them could not be backed; lib/about/
 * content.ts carries that record. U4 changed which machine is being proved:
 * ADR 0079 makes talos-prod the main evidence, and a section that went on
 * describing the VPS would be proving the wrong thing correctly.
 *
 * THE NAMES ARE NOT THIS FILE'S AND NOT content.ts's EITHER. They are the
 * twelve `stack.yaml` carries for `talos-prod`, the same list /work prints as
 * chips, and content.test.ts holds every one of them against the generated file
 * in both directions. What this component owns is the ` · ` between them — a
 * separator is a rendering decision, which is why the data is a list.
 *
 * NO SENTENCE UNDER A TILE, AND NO STRIP UNDER THE GRID. The sheet gives each
 * tile a line of prose and closes the section with "The page you are reading is
 * served by that stack" beside a link to the case study. Both described the VPS.
 * The sentence is not true of the tiles above it until the cutover, and the link
 * resolved to timseil.dev — a different system from the one being shown, which
 * is invariant 5 pointing somewhere real and still wrong. U9 brings the strip
 * back when the sentence is true again, about the machine it will then name.
 */
export function StackTiles() {
  return (
    <ul className="run-grid">
      {STACK.map((tile) => (
        <li className="run-tile" key={tile.label}>
          {/* The dot is the sheet's 5px mark and says nothing — it is not a
              `.st-dot`, because `.st-dot` is the geometry of a STATE and these
              six axes have none. state.css's split, kept honest in the other
              direction for once. */}
          <p className="run-label">
            <span className="run-mark" aria-hidden="true" />
            {tile.label}
          </p>
          {/* ONE ELEMENT AND NOT ONE PER NAME. A list of `<span>`s would put six
              more nodes on the page and invite a screen reader to read the
              separator; the names are one line of text and they are rendered as
              one. `.run-title` keeps its name because it is still the tile's
              first and only line — the type step did not move. */}
          <p className="run-title">{tile.names.join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}
