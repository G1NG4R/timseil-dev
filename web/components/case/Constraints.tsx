/**
 * The five numbered constraints beside the problem section.
 *
 * AN `<ol>`, BECAUSE THE NUMBERS ARE REFERRED TO. Build plan chapter 3 refuses
 * WebGL by quoting one of them back — "bricht Constraint 04 deiner eigenen
 * Fallstudie" — so the ordinal is part of the content and not a bullet style.
 * The digits are drawn by a counter in case.css: `01`, not `1.`, which is the
 * sheet's form, and a list marker cannot be zero-padded.
 */
export function Constraints({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <aside className="rail" aria-label={label}>
      <p className="spec-label">{label}</p>
      <ol className="cs-constraints">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </aside>
  );
}
