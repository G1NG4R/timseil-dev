/**
 * THE SHORT VERSION, and the sheet is right that it goes above the prose: most
 * people read only this, and a summary underneath the thing it summarises is a
 * summary for nobody.
 *
 * THE MARK IS A FLAG AND NOT A CHARACTER. ✓ and ✗ differ by colour and by glyph,
 * and a reader using a screen reader gets neither — so the word comes from the
 * caller's dictionary and the glyph is decoration. The same argument
 * components/state/StatusDot.tsx makes about a dot: `label` is not optional
 * there either.
 */
import type { ShortLine } from "@/lib/legal/content";

export function ShortVersion({
  lines,
  title,
  yesLabel,
  noLabel,
}: {
  lines: readonly ShortLine[];
  title: string;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <section className="lg-short" aria-label={title}>
      <p className="lg-short-head">{title}</p>
      <ul>
        {lines.map((line) => (
          <li key={line.text} data-yes={line.yes ? "yes" : "no"}>
            <span className="lg-short-mark" aria-hidden="true">
              {line.yes ? "✓" : "✗"}
            </span>
            <span className="lg-short-word">{line.yes ? yesLabel : noLabel}</span>
            <span className="lg-short-text">{line.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
