// The case study's parts. Server Components, all of them — nothing here has
// state, an event handler or a browser API, so the page costs the initial
// bundle nothing. The measured share of the 150 KB budget is #237's, and a page
// that shipped a client component to draw five labels would spend it.

import type { ReactNode } from "react";

/**
 * One sentence, and a slot for the eyebrow.
 *
 * THE EYEBROW IS A PROP AND NOT A CHILD COMPONENT, because it is the only part
 * of the hero that waits for the api. The page hands in a `<Suspense>` whose
 * fallback is the same eyebrow in its resting state, so the headline is in the
 * static shell and the three measured words stream in. Same seam as the footer's
 * meta bar since G4.
 *
 * IT HELD TWO MORE LINES UNTIL U6. A lead paragraph, which argued, and an alert
 * line reading YOU ARE INSIDE THIS PROJECT, which argued in red. The design
 * notes card asked for the second — "Ein Alert-Moment: die rote Zeile im Hero.
 * Sonst nur Signal-Cyan." — and #297 is the reason it is a good thing to lose
 * rather than a sacrifice: from the day the grid draws its first outage the page
 * would carry two reds, the cell that earned one and a line that was always
 * there. It is now one, and the one is a measurement.
 *
 * WHICH LEAVES A COMPONENT THAT WRAPS AN `<h1>` AND A SLOT, and that is still
 * worth a file: the page hands it a `<Suspense>`, and the order of the eyebrow
 * against the heading is the thing the sheet decides and the route should not
 * have to remember.
 */
export function CaseHero({ eyebrow, headline }: { eyebrow: ReactNode; headline: string }) {
  return (
    <div>
      {eyebrow}
      <h1>{headline}</h1>
    </div>
  );
}
