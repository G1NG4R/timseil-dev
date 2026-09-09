"use client";

// THE ONE CLIENT ISLAND ON THIS PAGE, and it exists for exactly one reason:
// REPLAY GLITCH. The glitch itself does not need it — `data-glitch` ships in
// the bytes and styles/notfound.css runs the move at first paint, without
// hydration, without JavaScript. What needs a browser is the SECOND run, and a
// second run is what the sheet's artboard label asks for: "REPLAY GLITCH
// klicken, um den Ladeeffekt erneut zu sehen."
//
// SO THE COST IS MEASURED RATHER THAN ABSORBED: +742 B gzip on this route
// against main, in the same tree, over every `<script src>` the prerendered
// document names. `/` is unchanged, which is the route ADR 0050's gate reads.
// H10a shipped no client component here — though not, as it is tempting to
// write, no JavaScript: the page renders its own `<html>`, so React was always
// in it.
//
// Everything else below is the same static markup it was, and it is all in one
// island rather than a smaller one because the state and the element it
// restarts sit in two different subtrees. A context provider across them would
// be three components for one integer.
//
// NOT the sheet's `fire()`. That one assigns an animation, assigns a
// `text-shadow`, forces a reflow (`animation = "none"; void el.offsetWidth`),
// clears both on a 320ms timer, and asks `matchMedia` whether it may run at
// all. None of the five is here: the move is a stylesheet rule, so remounting
// the element restarts it, the colour layers end inside the keyframe, and
// `prefers-reduced-motion` is answered by globals.css. ADR 0074.

import Link from "next/link";
import { useState } from "react";

/**
 * The top half of the 404: what happened, and the two ways out.
 *
 * THE RED IS THE THEME HERE RATHER THAN THE EXCEPTION, and that is the sheet's
 * own instruction: "Alert-Rot ist hier das Thema, nicht die Ausnahme:
 * Statuspunkt, Panel-Brackets, Footer-Status. Cyan bleibt für Handlungen." So
 * the status mark and the panel brackets are `--alert` and both buttons stay
 * cyan — the one page where spending the alert moment more than once is the
 * design rather than a slip.
 *
 * NOT `StatusDot`, AND THE REASON IS SEMANTIC RATHER THAN VISUAL. Its states
 * are the ones a SYSTEM is in — `live`, `degraded`, `offline` — and this site is
 * none of them here: it is online and answering, the address simply is not a
 * page. The sheet says the same thing in its own footer, which draws `ONLINE`
 * and `STATUS 404` side by side. Borrowing `offline` would have been a state
 * nobody measured.
 *
 * THE ACTIONS ARE ANCHORS, NOT BUTTONS. They navigate, so they are links that
 * borrow the button's clothes — the shape `BlogSubscribe` and `PostAuthor`
 * already use, `className="btn"` with a variant. The third control is the
 * opposite: it changes nothing about where you are, so it is a real `<button>`
 * rather than the sheet's `<span onClick>`, for the reason `BlogFilters` gives
 * about its own reset.
 */
export function NotFoundHero({
  lede,
  returnLabel,
  workLabel,
  replayLabel,
  homeHref,
  workHref,
}: {
  lede: string;
  returnLabel: string;
  workLabel: string;
  replayLabel: string;
  homeHref: string;
  workHref: string;
}) {
  // A COUNTER RATHER THAN A BOOLEAN, because what it drives is a `key`. Every
  // click gives the heading a new identity, React mounts a fresh element, and a
  // fresh element starts the animation named on it — the same restart the sheet
  // buys with `animation = "none"` and a forced reflow, without reaching into
  // the DOM or making the browser lay the page out twice.
  //
  // It starts at 0 and the first render is the server's, so the first run is
  // not this state's doing at all. Nothing here fires on mount; there is no
  // effect in this file.
  const [runs, setRuns] = useState(0);

  return (
    <div className="nf-lead">
      <p className="nf-status" data-tone="alert">
        <span className="nf-dot" aria-hidden="true" />
        ERR 404 — ROUTE NOT RESOLVED
      </p>

      {/* THE BREAK IS THE SHEET'S, not a consequence of the column width. Both
          artboards set the two words on two lines at every size they draw, so
          a reflow that happened to land the same way would be a coincidence
          this page cannot rely on. */}
      <h1 key={runs} className="nf-display" data-glitch>
        SIGNAL
        <br />
        LOST
      </h1>

      <p className="nf-lede">{lede}</p>

      <div className="nf-actions">
        <Link className="btn" data-variant="primary" href={homeHref}>
          ← {returnLabel}
        </Link>
        <Link className="btn" data-variant="secondary" href={workHref}>
          {workLabel} →
        </Link>
        {/* Third and last, as the artboard draws it. `.nf-replay` carries no
            look — ui.css's ghost variant is the specimen the sheet draws — it
            is the hook the two rules that REMOVE this control need, and the
            name the sweep probes. */}
        <button
          className="btn nf-replay"
          data-variant="ghost"
          type="button"
          onClick={() => {
            setRuns((n) => n + 1);
          }}
        >
          {replayLabel}
        </button>
      </div>
    </div>
  );
}
