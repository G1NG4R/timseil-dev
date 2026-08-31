// The homepage's own parts. Server Components, all of them — nothing here has
// state, an event handler or a browser API, so this page costs the initial
// bundle nothing. #237 measured 143 581 B of a 150 000 B budget before any page
// existed, and a hero that shipped a client component to draw four lines would
// spend what is left of it.

import { MARKS } from "@/lib/state/words";

/**
 * The first screen: a claim, what it is built with, and whether the person who
 * built it is available.
 *
 * THE TERMINAL IS NOT IN HERE. `.hero` is the two-column row and it belongs to
 * the page, exactly as `.cs-spec` belongs to the case study rather than to
 * `CaseHero`. This component is the left column; the page puts the panel in the
 * right one. A hero that owned the row would own the 1080 switch with it, and
 * layout.css owns every switch on this site.
 *
 * NO `data-decode`. The sheet marks the headline for the decode animation and
 * that belongs to I1, with a trap that phase has already written down: the
 * decoded text must belong to the component that displays it, or the headline's
 * text node is replaced mid-scramble and the end state never arrives. What is
 * rendered here IS the end state, which is also the resting state, so I1 adds
 * an animation rather than correcting a placeholder.
 *
 * THE STACK LINE AND `SYS.INIT` ARE NOT IN THE DICTIONARY, and LANG.01 is why:
 * "Übersetzt wird Prosa, nicht Nomenklatur." `SYS.INIT` is named in the sheet's
 * own list of words that stay English, and `Go · TypeScript · Docker ·
 * Postgres` is four product names — a German homepage still reads Docker.
 */
export function Hero({
  eyebrow,
  headline,
  tagline,
  available,
  availability,
}: {
  eyebrow: string;
  headline: string;
  /** What follows the stack line, after the dash. */
  tagline: string;
  /** The state word, already translated. */
  available: string;
  /** The sentence after it. Prose from the dictionary, never a measurement —
   *  there is no availability endpoint, and inventing one would be the first
   *  number on this page that no system produced. */
  availability: string;
}) {
  return (
    <div className="hero-say">
      <p className="hero-eyebrow">
        <span className="hero-init">SYS.INIT</span> — {eyebrow}
      </p>

      <h1 className="hero-headline">{headline}</h1>

      <p className="hero-sub">
        <span className="hero-stack">Go · TypeScript · Docker · Postgres</span> — {tagline}
      </p>

      {/* THE DOT IS DECORATION AND THE WORD IS THE STATE, and keeping those two
          apart is ADR 0058. K-14 asks for a large dot in the hero; words.ts
          refuses to give AVAILABLE one, and its test says why — "gives a dot to
          every state that makes a claim, and to no other". Nobody measures
          whether a person is available.

          So the box is `.st`, the tone is read from the table rather than
          written a second time, and the dot carries `.st-dot` WITHOUT a
          `data-dot`. state.css splits those two on purpose: `.st-dot` is
          geometry, `data-dot` is the claim. A dot with no claim is a circle
          that says nothing, which is exactly what this one is.

          `StatusDot` and `StateWord` are not called here because both render an
          `.st` of their own, and this dot has to sit inside the box that
          declares `--st-dot` — nesting a second one would be two boxes for one
          line and a second place the size could drift. */}
      <p className="st hero-avail" data-tone={MARKS.available.tone}>
        <span className="st-dot hero-dot" data-pulse="" aria-hidden="true" />
        <span className="st-word">{available}</span>
        <span className="hero-avail-note">— {availability}</span>
      </p>
    </div>
  );
}
