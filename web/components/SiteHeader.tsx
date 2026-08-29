// A Server Component, and it has to stay one. It calls no dynamic API —
// no headers(), no cookies() — because the shell is prerendered, and one dynamic
// call in the root layout takes every page out of the static pass. ADR 0043
// spells out why that matters: a nonce and a fully prerendered shell are
// mutually exclusive.
//
// G4 ADDED ONE STREAMED WORD AND NOT A DYNAMIC HEADER. MenuStatus below waits
// for a request; the <header>, the column, the two hairlines and the ruler do
// not. That is the whole shape of Cache Components — the boundary moved down to
// the one value that needs it instead of taking the tree with it.
//
// Everything that needs the browser is a leaf below: the wordmark and the nav
// need the path, the language button needs keyboard state, the clock needs the
// time, and the menu needs to be open or closed. The <header>, the column, the
// two hairlines and the ruler are static HTML.

import { Suspense } from "react";

import { Clock } from "@/components/Clock";
import { LangMenu } from "@/components/LangMenu";
import { MobileMenu } from "@/components/MobileMenu";
import { NavLinks } from "@/components/NavLinks";
import { Wordmark } from "@/components/Wordmark";
import { onlineText } from "@/lib/api/health";
import { footerHealthNow } from "@/lib/api/readers";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { navLabels } from "@/lib/i18n/messages";

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
export async function SiteHeader() {
  const { messages, textLang } = await getDictionary();
  const labels = navLabels(messages);

  return (
    <header className="col" lang={textLang}>
      <div className="head">
        <Wordmark />
        <span className="head-spacer" />
        <div className="nav-desktop">
          <NavLinks labels={labels} />
          <span className="head-rule" aria-hidden="true" />
          <LangMenu
            strings={{
              aria: messages.langAria,
              label: messages.langLabel,
              esc: messages.langEsc,
              note: messages.langNote,
            }}
          />
          <span className="head-rule" aria-hidden="true" />
          <Clock />
        </div>
        {/* Always rendered, hidden by CSS above 900. Not a conditional: a tree
            that depends on the viewport is a tree the server gets wrong. */}
        <MobileMenu
          labels={labels}
          strings={{
            menuAria: messages.menuAria,
            closeAria: messages.menuCloseAria,
            close: messages.menuClose,
            langLabel: messages.langLabel,
            channel: messages.channel,
            respond: messages.respond,
          }}
          status={
            <Suspense fallback={onlineText(null)}>
              <MenuStatus />
            </Suspense>
          }
        />
      </div>
      {/* Desktop only; layout.css drops it at 900, where a 5px ruler under a
          52px header is a tenth of the header. */}
      <div className="ruler" aria-hidden="true" />
    </header>
  );
}

/** The one word the mobile menu's strip streams in. */
async function MenuStatus() {
  const { online } = await footerHealthNow();
  return <>{onlineText(online)}</>;
}
