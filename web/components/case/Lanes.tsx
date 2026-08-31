import type { Lane } from "@/content/case-studies/types";

/**
 * A labelled row of short definitions — a key and what it means.
 *
 * EXTRACTED IN H2b BECAUSE IT GOT A SECOND CALLER, not before. `.02` has drawn
 * the side lanes since H2a as markup inside `RequestPath`, which was right while
 * there was one of them; `.04`'s observability panel is the same four-column
 * grid of `<dt>`/`<dd>` pairs with a label over it, and a second copy of the
 * markup is how the two would start reflowing at different widths.
 *
 * It keeps the `arch-lanes` class names rather than taking new ones. The
 * breakpoints for this row are already derived and written down in layout.css —
 * four columns become two at 720 and one at 560, with the arithmetic beside them
 * — and a second set of classes would need the same three switches under
 * different names. "Kein Bauteil bekommt seinen eigenen Wert" applies to the
 * selector as much as to the number.
 */
export function Lanes({ lanes, label }: { lanes: readonly Lane[]; label: string }) {
  return (
    <>
      <p className="arch-lanes-label">{label}</p>

      <dl className="arch-lanes">
        {lanes.map((lane) => (
          <div className="arch-lane" key={lane.key}>
            <dt>{lane.key}</dt>
            <dd>{lane.detail}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
