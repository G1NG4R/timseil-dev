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
 */
export function SectionHead({
  id,
  title,
  meta,
}: {
  id: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="sec reveal">
      <span className="sec-id">{id}</span>
      <span className="sec-title">{title}</span>
      {meta === undefined ? null : <span className="sec-meta">{meta}</span>}
    </div>
  );
}
