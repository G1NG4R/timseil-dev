// The case study's parts. Server Components, all of them — nothing here has
// state, an event handler or a browser API, so the page costs the initial
// bundle nothing. The measured share of the 150 KB budget is #237's, and a page
// that shipped a client component to draw five labels would spend it.

import type { ReactNode } from "react";

/**
 * One sentence, one paragraph, one red line — and a slot for the eyebrow.
 *
 * THE EYEBROW IS A PROP AND NOT A CHILD COMPONENT, because it is the only part
 * of the hero that waits for the api. The page hands in a `<Suspense>` whose
 * fallback is the same eyebrow in its resting state, so the headline, the lead
 * and the alert line are in the static shell and the three measured words
 * stream in. Same seam as the footer's meta bar since G4.
 *
 * THE ALERT LINE IS THE PAGE'S ONLY RED. The design notes card: "Ein
 * Alert-Moment: die rote Zeile im Hero. Sonst nur Signal-Cyan." Its dot is
 * `aria-hidden` for StatusDot's reason — it draws a fact the words beside it
 * already carry.
 */
export function CaseHero({
  eyebrow,
  headline,
  lead,
  alert,
}: {
  eyebrow: ReactNode;
  headline: string;
  lead: string;
  alert: string;
}) {
  return (
    <div>
      {eyebrow}
      <h1>{headline}</h1>
      <p className="cs-lead">{lead}</p>
      <p className="cs-alert">
        <span className="cs-alert-dot" aria-hidden="true" />
        {alert}
      </p>
    </div>
  );
}
