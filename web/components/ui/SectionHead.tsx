/**
 * `SYS.NN` · title · optional meta, over a hairline.
 *
 * The heading level is the caller's, not this component's: the same shape opens
 * a page section and a sub-section, and a component that hard-coded `<h2>`
 * would put the document outline in the hands of whichever page rendered it
 * first. It renders a `<div>` with the parts as spans, exactly as the sheet
 * draws it; a page that needs a heading wraps or passes one.
 *
 * `.reveal` is the scroll-wipe class from globals.css. THE END STATE IS THE
 * DEFAULT — without JavaScript the head is simply there, which is the only way
 * a section title is allowed to work.
 *
 * `titleId` IS HOW A SECTION GETS A NAME WITHOUT GETTING A HEADING. H2a is the
 * phase where this stopped being theoretical: the case study went from one
 * section to three, and three unnamed `<section>` landmarks are worse than none.
 * The caller puts the id here and `aria-labelledby` on its own `<section>`, so
 * the region is announced by the title already on the screen.
 *
 * WHY NOT AN `<h2>`. globals.css sets `h2` to the 34px display step, and
 * `.sec-title` is mono 12 — the same collision `.cs-spec h1` had to resolve with
 * `:where()` in H1, and resolving it again here would put a second exception in
 * the cascade for a decision nobody has taken. Whether these sections deserve a
 * visible outline is a design question, and it belongs to M2's a11y audit.
 */
export function SectionHead({
  id,
  title,
  meta,
  titleId,
}: {
  id: string;
  title: string;
  meta?: string;
  titleId?: string;
}) {
  return (
    <div className="sec reveal">
      <span className="sec-id">{id}</span>
      <span className="sec-title" id={titleId}>
        {title}
      </span>
      {meta === undefined ? null : <span className="sec-meta">{meta}</span>}
    </div>
  );
}
