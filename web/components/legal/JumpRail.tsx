/**
 * ON THIS PAGE — the 380px column beside the prose.
 *
 * A `<nav>` WITH A NAME, because a page with seven sections and a second list of
 * links needs the two to be distinguishable when they are announced. The labels
 * are the sections' own short forms rather than their titles: "What is stored on
 * your device" does not fit beside a 44px number, and sections.test.ts refuses a
 * rail label longer than the title it stands in for.
 *
 * THE HREFS ARE DERIVED FROM THE SAME `anchorFor` THE HEADS USE. A hand-written
 * `#s-07-04` here would be the copy that goes stale, and e2e/legal.spec.ts walks
 * every one of these and demands an element on the page with that id.
 */
import { anchorFor, type Section } from "@/lib/legal/sections";

export function JumpRail({ sections, label }: { sections: readonly Section[]; label: string }) {
  return (
    <nav className="lg-rail" aria-label={label}>
      <p className="lg-rail-head">{label}</p>
      <ul>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${anchorFor(section.id)}`}>
              <span className="lg-rail-id">{section.id}</span>
              <span className="lg-rail-label">{section.railLabel}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
