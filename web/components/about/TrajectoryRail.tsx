import { Fragment } from "react";
import type { ReactNode } from "react";

import { STATIONS, restingStation } from "@/lib/about/trajectory";

/**
 * SYS.05.01 — the one control on this page, and it ships no JavaScript.
 *
 * NO `'use client'`, AND THAT IS THE DECISION OF THIS PHASE. The sheet drives
 * the rail with a script: six `<div tabindex="0" role="button">`, an `onKeyDown`
 * that reimplements ArrowLeft/Right/Up/Down with clamping, and a `paint()` that
 * writes six colour literals into `style.background` on every change. A radio
 * group gives all of that natively — arrow keys that move AND select, a roving
 * tabindex, one tab stop for the whole group, and both ends already clamped —
 * for zero bytes and no hydration.
 *
 * THE BUDGET IS WHY IT MATTERS AND NOT THE ONLY REASON. #237 has said since
 * 29.08. that the room left is thin, and H7a measured `/about` byte-identical to
 * `/`; a client island here would have spent the first of it. But the sharper
 * reason is #244: under `cacheComponents` a streamed placeholder stays put
 * without JavaScript, and this page's whole argument is that it says only what
 * it can back. A rail that stopped working with scripts off would be the second
 * thing on this site that does not work, on the page about how it is built.
 * `components/case/OpsGrid.tsx` walked this path first in H2b.
 *
 * THE INPUTS ARE VISUALLY HIDDEN, NOT `display: none`. A radio that is not
 * displayed is not focusable, and an unfocusable radio group is a rail nobody
 * can reach. about.css positions them off the box and draws the focus ring on
 * the LABEL instead — globals.css would otherwise put it on an invisible
 * element, which is a focus ring nobody can see.
 *
 * `name` IS A PROP BECAUSE TWO RAILS CAN SHARE A DOCUMENT. The gallery renders
 * one beside the page's own; radios group by `name`, so a hard-coded one would
 * make the two rails fight over a single selection. The same reason `WorkFilters`
 * reaches for `useId` — except this component has no hooks to reach for.
 *
 * THE PANELS ARE HANDED IN AS NODES. The rail owns the selection and the
 * stylesheet owns which panel that reveals; this component does not render the
 * panels itself, so a change to what a panel contains never touches the control.
 * That is the seam ADR 0064 drew for the work index, kept without the island.
 */
export function TrajectoryRail({
  name,
  labelledBy,
  panels,
}: {
  /** The radio group's name. Unique per rail in the document. */
  name: string;
  /** The id of the heading that names this group — the section title already on
   *  the screen, exactly as `WorkFilters` names its two chip rows. */
  labelledBy: string;
  /** `<TrajectoryPanel>` per station, in STATIONS' order, rendered by the page. */
  panels: readonly ReactNode[];
}) {
  const resting = restingStation();

  return (
    <div className="tl">
      {/* `role="group"` AND NOT `role="radiogroup"`. The radios already form a
          group by sharing a name, and the ARIA role would take the browser's
          own implementation off the table — `aria-checked` would then be this
          component's to maintain, with no script to maintain it. The visible
          section title is the name, so no second sentence is invented for it. */}
      <div className="tl-rail" role="group" aria-labelledby={labelledBy}>
        {STATIONS.map((station, index) => (
          <Fragment key={station.key}>
            <input
              className="tl-input"
              type="radio"
              name={name}
              id={`${name}-${station.key}`}
              defaultChecked={index === resting}
            />
            <label className="tl-item" htmlFor={`${name}-${station.key}`}>
              <span className="tl-label">{station.label}</span>
              {/* The dot is the drawing, the label is the name. It carries no
                  `data-dot`: a station is not a state, and `.st-dot` is the
                  geometry of a claim this makes none of. */}
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-cap">{station.caption}</span>
            </label>
          </Fragment>
        ))}

        {/* AFTER THE INPUTS, AND THAT IS LOAD BEARING. The fill's width is set
            by `.tl-input:nth-of-type(k):checked ~ .tl-fill`, and the sibling
            combinator only reaches FORWARD. Moved above the group, the line
            would never move. */}
        <span className="tl-track" aria-hidden="true" />
        <span className="tl-fill" aria-hidden="true" />
      </div>

      <div className="tl-panels">
        {panels.map((panel, index) => (
          <Fragment key={STATIONS[index].key}>{panel}</Fragment>
        ))}
      </div>
    </div>
  );
}
