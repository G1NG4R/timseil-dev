// A Server Component, and it has to stay one. It calls no dynamic API —
// no headers(), no cookies() — because G4 wants this shell prerendered, and one
// dynamic call in the root layout takes every page out of the static pass. ADR
// 0043 spells out why that matters: a nonce and a fully prerendered shell are
// mutually exclusive, and the shell is what G4 is building toward.
//
// Everything that needs the browser is a leaf below: the wordmark and the nav
// need the path, the language button needs keyboard state, the clock needs the
// time, and the menu needs to be open or closed. The <header>, the column, the
// two hairlines and the ruler are static HTML.

import { Clock } from "@/components/Clock";
import { LangMenu } from "@/components/LangMenu";
import { MobileMenu } from "@/components/MobileMenu";
import { NavLinks } from "@/components/NavLinks";
import { Wordmark } from "@/components/Wordmark";

/**
 * The header: 66px, the same on all ten pages, 52px below 900.
 *
 * The sheet is emphatic that this is one component and not a per-page bar:
 * "Auf jeder Seite gleich, darunter das 5px-Lineal. Keine Kopfzeile über
 * Padding, keine Ausnahme für Fallstudien oder Kontakt." Two pages used to draw
 * their own; K-04 and K-18 are that finding.
 *
 * THE RIGHT-HAND GROUP IS ONE FLEX ROW. In the sheet the four entries, the two
 * hairlines, the language button and the clock share a single `gap: 30`, and all
 * of them disappear together below 900 — the mobile header is the wordmark and
 * the button, nothing else. `.nav-desktop` is that group, which is exactly what
 * layout.css has been hiding at 900 since G1.
 */
export function SiteHeader() {
  return (
    <header className="col">
      <div className="head">
        <Wordmark />
        <span className="head-spacer" />
        <div className="nav-desktop">
          <NavLinks />
          <span className="head-rule" aria-hidden="true" />
          <LangMenu />
          <span className="head-rule" aria-hidden="true" />
          <Clock />
        </div>
        {/* Always rendered, hidden by CSS above 900. Not a conditional: a tree
            that depends on the viewport is a tree the server gets wrong. */}
        <MobileMenu />
      </div>
      {/* Desktop only; layout.css drops it at 900, where a 5px ruler under a
          52px header is a tenth of the header. */}
      <div className="ruler" aria-hidden="true" />
    </header>
  );
}
