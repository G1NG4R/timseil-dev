/**
 * The reserved sixth column of a work row: a frame, not a picture.
 *
 * `layout.css` HAS HELD 130px FOR THIS SINCE G1 AND NOTHING HAS EVER DRAWN IT.
 * The rule survived four phases as a track in a grid no component used; H5c
 * listed it as the open half of a switch, and H3 had already set the standard
 * for what to do with a rule nobody can reach — it deleted `.cs-hero` because
 * "a rule nobody can reach is not a spare part, it is a claim that something
 * exists".
 *
 * SO WHY THIS IS BUILT AND `.cs-hero` WAS DELETED: that one had no candidate
 * left, this one has a named future drawer. The sheet's `[PREVIEW]` is a
 * placeholder for a screenshot, and images are K2 (ADR 0055 §3 — the same
 * reason H5c dropped `[PORTRAIT]` from the foot).
 *
 * AND ADR 0058 SAYS WHAT TO BUILD IN THE MEANTIME: "a component of a later
 * stage is built as a surface, not as a switched-off control". That is what H3
 * did with the terminal frame, and it is what this is — the hatch, the title
 * bar and the word, drawn rather than loaded. Nothing here claims to be a
 * screenshot of anything, and K2 replaces the contents without touching the
 * column.
 *
 * `aria-hidden` BECAUSE IT SAYS NOTHING. Every fact about the system is in the
 * five cells beside it; a screen reader announcing "PREVIEW" would be reading
 * the decoration. That is also why the opacity may carry the hover at all —
 * H4's rule is that INFORMATION may never live in opacity alone, and there is
 * no information in here. `layout.css` says the same in three words: "its
 * preview is decoration".
 */
export function WorkPreview() {
  return (
    <span className="prev" aria-hidden="true">
      <span className="prev-hatch" />
      <span className="prev-bar">
        <span />
        <span />
        <span />
      </span>
      <span className="prev-label">[PREVIEW]</span>
    </span>
  );
}
