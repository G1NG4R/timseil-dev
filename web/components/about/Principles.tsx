import { type Principle, stationNumber } from "@/lib/about/content";

/**
 * SYS.05.03 — four principles, numbered by their position.
 *
 * AN `<ol>` AND NOT FOUR `<div>`s, for the reason WorkList gives about the work
 * index: the number a row prints IS its order, so the list element that carries
 * order is the honest one. The numerals are then `stationNumber(index)` rather
 * than a field, because a typed ordinal beside a list is a second opinion about
 * the order — K-26 is what that costs.
 *
 * THE NUMERAL IS `aria-hidden` AND THE LIST IS NOT. A screen reader already
 * announces "list item 3 of 4"; printing `03` into the accessible name as well
 * would say the same thing twice, in a different notation. The sheet draws it
 * as decoration in `rgba(0,229,255,.75)` and that is what it is.
 *
 * NO HEADINGS. Four `<h3>`s here would put four entries into the document
 * outline for a section whose own name is not a heading either — SectionHead
 * says why it renders a `<div>`, and M2's a11y audit owns the question of
 * whether these sections deserve a visible outline at all.
 *
 * THE FOUR COME IN AS A PROP SINCE U8a, because they are prose and prose has a
 * language. The key is the position rather than the title for the same reason:
 * a translated title is a different string, and a React key that changes with
 * the language is a key that was never identifying the row.
 */
export function Principles({ principles }: { principles: readonly Principle[] }) {
  return (
    <ol className="prin-grid">
      {principles.map((item, index) => (
        <li className="prin" key={stationNumber(index)}>
          <span className="prin-no" aria-hidden="true">
            {stationNumber(index)}
          </span>
          <div className="prin-body">
            <p className="prin-title">{item.title}</p>
            <p className="prin-detail">{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
