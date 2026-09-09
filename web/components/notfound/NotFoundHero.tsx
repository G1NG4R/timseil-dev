import Link from "next/link";

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
 * already use, `className="btn"` with a variant.
 */
export function NotFoundHero({
  lede,
  returnLabel,
  workLabel,
  homeHref,
  workHref,
}: {
  lede: string;
  returnLabel: string;
  workLabel: string;
  homeHref: string;
  workHref: string;
}) {
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
      <h1 className="nf-display">
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
      </div>
    </div>
  );
}
