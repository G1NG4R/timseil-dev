/**
 * The four compulsory entries this site does not have, drawn rather than
 * omitted.
 *
 * WHY A COMPONENT FOR A LIST OF FOUR STRINGS: because it is not a section and
 * must not look like one. It sits under the jump rail, it carries no `SYS.`
 * marker, and it is not in IMPRINT_SECTIONS — a table of contents that offered
 * "things that do not apply" as a fourth destination would be a rail pointing
 * at an absence. The sheet draws it exactly there, and the reasoning is in
 * lib/legal/imprint.ts beside the strings.
 *
 * THE HEADING IS A `<p>` AND THE REGION IS NAMED BY IT. An `<h2>` here would put
 * "NOT APPLICABLE" into the document outline between "Where it is hosted" and
 * the footer, which is not where it belongs in the argument; `aria-label` gives
 * the region the same name without claiming the level. The rail beside it makes
 * the same trade.
 */
export function NotApplicable({
  items,
  note,
  label,
}: {
  items: readonly string[];
  note: string;
  label: string;
}) {
  return (
    <section className="lg-na" aria-label={label}>
      <p className="lg-na-head">{label}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="lg-na-note">{note}</p>
    </section>
  );
}
