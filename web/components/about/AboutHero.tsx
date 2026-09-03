// `/about`'s own parts. Server Components, all of them — nothing on this page
// has state, an event handler or a browser API, so H7a costs the initial bundle
// nothing. #237 measured 143 580 B of a 150 000 B budget with two pages built,
// and the one control this page gets is H7b's.

import { MARKS } from "@/lib/state/words";

/**
 * The first screen of `/about`: who is writing, in one sentence and one
 * paragraph, and whether he is available.
 *
 * THE OPERATOR CARD IS NOT IN HERE, for the reason components/home/Hero.tsx
 * gives one page over: `.hero` is the two-column row and it belongs to the
 * PAGE. A hero that owned the row would own the 1080 switch with it, and
 * layout.css owns every switch on this site.
 *
 * IT REUSES THE HOMEPAGE'S HERO CLASSES, AND THAT IS THE POINT RATHER THAN A
 * SHORTCUT. `.hero-say`, `.hero-eyebrow`, `.hero-init`, `.hero-avail`,
 * `.hero-dot` and `.hero-avail-note` are in home.css because H3 was the first
 * page with a hero, not because they are about the homepage — the two heroes
 * draw the same eyebrow, the same headline step (K-08 gives 62 to exactly these
 * two pages) and the same availability line, word for word. Copying six rules
 * into about.css would be the second set of words H2a already measured the cost
 * of. What About does NOT inherit is `.hero-headline`, whose 620px cap is the
 * homepage sentence's own measure; this one has its own, and the sheet gives it.
 *
 * ONE PARAGRAPH WHERE THE SHEET DRAWS TWO — see `aboutLede` in en.ts. The
 * second is a bracket asking for a voice.
 *
 * NO PORTRAIT, AND NO FRAME AROUND ITS ABSENCE. The sheet draws a 300px
 * terminal-framed box reading `[PORTRAIT PHOTO] / GRAYSCALE + SIGNAL DUOTONE`
 * above the card. ADR 0055 turned down the case study's two image placeholders
 * with the argument that carries unchanged — an invented picture is the picture
 * version of an invented number — and unlike H3's terminal frame there is
 * nothing here for the frame to hold open: the right column already has a
 * consumer, so the 1080 switch stays measurable without it. Images are K2's.
 *
 * NO `data-decode`. Same as the homepage: the sheet marks the headline for the
 * decode animation, that belongs to I1, and what is rendered here is the end
 * state rather than a placeholder for one.
 */
export function AboutHero({
  headline,
  lede,
  available,
  availability,
}: {
  headline: string;
  /** The one paragraph. Prose, from the dictionary. */
  lede: string;
  /** The state word, already translated. */
  available: string;
  /** The sentence after it — the same one the homepage prints, from the same
   *  key, because it is the same sentence and not a second copy of it. */
  availability: string;
}) {
  return (
    <div className="hero-say">
      {/* `SYS.05` is this page's own marker and `OPERATOR` names the system.
          Both are nomenclature — LANG.01 — so neither is a dictionary key, and
          a German About page would read the same two words. */}
      <p className="hero-eyebrow">
        <span className="hero-init">SYS.05</span> — OPERATOR
      </p>

      <h1 className="about-headline">{headline}</h1>

      <p className="about-lede">{lede}</p>

      {/* NO LARGE DOT, AND THE SHEET DRAWS ONE. This is the artboard K-14 was
          filed against: "Statuspunkt ONLINE nur auf Startseite und About,
          obwohl die Übergabe TopNav · StatusDot als globales Bauteil führt."
          The correction table resolves it as BEHOBEN, and the resolution is
          the opposite of the drawing — "Punkt in der Meta-Leiste jeder Seite,
          GROSS IM HERO NUR AUF DER STARTSEITE." So the meta bar's dot, which
          the chrome has drawn on every page since G3, stays; the 7px one in
          this hero does not exist.

          FOUND BY A TEST FROM THREE PHASES AGO. e2e/home.spec.ts has asserted
          since H3 that `.hero-dot` is on `/` and on no other page, and it
          proved it by walking to `/about` — which was a `[SOON]` stub then and
          is this page now. It went red on the first full run of this phase. The
          sheet was followed and the correction table was not, which is the
          mistake ADR 0055 named: where a canvas artefact and the correction
          table disagree, the table is the decision.

          NOTHING IS LOST BY DROPPING IT, and that is ADR 0058 §2 read forwards.
          The dot carried `.st-dot` WITHOUT a `data-dot` — a circle that makes
          no claim, because nobody measures whether a person is available. The
          word is the state; the decoration was the part that was only ever on
          one page by decision. `data-tone` stays, because `.st-word` reads its
          colour from it. */}
      <p className="st hero-avail" data-tone={MARKS.available.tone}>
        <span className="st-word">{available}</span>
        <span className="hero-avail-note">— {availability}</span>
      </p>
    </div>
  );
}
