/**
 * The card at the foot of the rail that points at the other legal page.
 *
 * ONE COMPONENT AND TWO CALLERS, which is the whole reason it takes props: the
 * sheet draws the same card on both artboards with the other page's marker in
 * it, and two copies differing by three strings would be the pair where one
 * eventually keeps pointing at a section number the other page renamed.
 *
 * THE HREF IS RESOLVED BY THE PAGE. lib/legal/content.ts and imprint.ts carry a
 * PATH — `/privacy`, `/imprint` — and the page runs it through `localeHref`,
 * because a data file has no business knowing which language is reading it.
 * FooterMeta does the same with the same two paths.
 *
 * THE ARROW IS DECORATION AND IS MARKED AS SUCH. Every exit link on this site
 * draws one — `CASE STUDY →`, `WORK →` — and none of them spells it out to a
 * screen reader, which announces a link as a link without being told twice.
 */
import Link from "next/link";

export function SeeAlso({
  label,
  marker,
  blurb,
  href,
}: {
  label: string;
  marker: string;
  blurb: string;
  href: string;
}) {
  return (
    <section className="lg-seealso" aria-label={label}>
      <p className="lg-seealso-head">{label}</p>
      <Link className="lg-seealso-link" href={href}>
        {marker} <span aria-hidden="true">→</span>
      </Link>
      <p className="lg-seealso-blurb">{blurb}</p>
    </section>
  );
}
