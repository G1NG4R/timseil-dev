// 'use client' because a menu is open or it is not, and only the browser knows
// which. The button itself is always rendered and hidden by CSS above 900 —
// never rendered conditionally on a width, because nothing in the chrome may
// branch on the viewport at render time without the server and the browser
// disagreeing about what the tree is.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";

import { Clock } from "@/components/Clock";
import { NAV, type NavId, activeNav } from "@/lib/chrome";
import {
  LOCALES,
  LOCALE_NAMES,
  localeHref,
  localeOf,
  switchLocale,
} from "@/lib/i18n/routes";

/** The words this menu says around the links. A client component, so these
 *  are the strings it needs and not the dictionary they came from. */
export interface MenuStrings {
  readonly menuAria: string;
  readonly closeAria: string;
  readonly close: string;
  readonly langLabel: string;
  readonly channel: string;
  readonly respond: string;
}

/**
 * The menu button and the full-screen menu behind it.
 *
 * A REAL <dialog>, OPENED WITH showModal(). That is the whole answer to two of
 * the sheet's silences: it traps focus, closes on Escape, returns focus to the
 * button, renders in the top layer and makes the page behind it inert — all of
 * which the sheet's `aria-modal="true"` claims and none of which it implements.
 * Sixty lines of hand-rolled focus trap would be worse and, with no DOM library
 * here, untestable.
 *
 * WHAT IS NOT IN IT: the theme switch. The sheet is explicit — "MENÜ trägt
 * Navigation, Sprache, Adresse und Uhr. Die Theme-Wahl steht in der Fußzeile,
 * nicht zweimal" (K-17, E-04).
 *
 * The scroll lock is the third silence, and it is NOT in this file. Measured:
 * `showModal()` puts the dialog in the top layer but does not stop the document
 * scrolling behind it, so a lock is needed — and chrome.css does it with
 * `html:has(dialog.menu[open])`. It lived here first, as lock()/unlock() around
 * React's onClose. onClose works, but a lock whose failure mode is "the page can
 * never be scrolled again" should not depend on an event arriving; `:has()`
 * cannot fall out of step with the attribute it reads.
 *
 * `aria-expanded` still has to follow, and it does so on both paths without
 * relying on the close event either: the button sets it, and Escape — which
 * closes the dialog natively, behind React's back — is caught as a keydown,
 * which bubbles.
 *
 * `status` arrives already rendered. This is a client component, so it cannot
 * await the api itself; SiteHeader streams the word in and hands it over as a
 * node. Passing the value instead of the markup would drag the whole header out
 * of the prerendered shell, which is the one thing G4 was building toward.
 */
export function MobileMenu({
  status,
  labels,
  strings,
}: {
  status: ReactNode;
  labels: Record<NavId, string>;
  strings: MenuStrings;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const active = activeNav(pathname);
  const locale = localeOf(pathname);

  function show() {
    dialog.current?.showModal();
    setOpen(true);
    closer.current?.focus();
  }

  function hide() {
    dialog.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="nav-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={strings.menuAria}
        onClick={show}
      >
        <span className="bars" aria-hidden="true" />
      </button>

      <dialog
        ref={dialog}
        className="menu"
        aria-label={strings.menuAria}
        // The backstop. The browser restores focus to the button by itself.
        onClose={() => {
          setOpen(false);
        }}
        // Escape closes a modal dialog natively, without going through any
        // handler of ours. keydown bubbles, so this is the reliable way to keep
        // aria-expanded honest on that path.
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <div className="menu-bar">
          <span className="head-mark">
            TS<span className="slash">://</span>
          </span>
          <button
            ref={closer}
            type="button"
            className="menu-close"
            aria-label={strings.closeAria}
            onClick={hide}
          >
            {strings.close}
            <span className="glyph" aria-hidden="true">
              ✕
            </span>
          </button>
        </div>

        <div className="menu-body">
          <nav aria-label="Main">
            {NAV.map((entry, index) => {
              const on = entry.id === active;
              return (
                <Link
                  key={entry.id}
                  href={localeHref(locale, entry.href)}
                  className="menu-link"
                  aria-current={on ? "page" : undefined}
                  onClick={hide}
                >
                  <span className="index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="label">{labels[entry.id]}</span>
                  <span className="mark" aria-hidden="true">
                    {on ? "●" : "→"}
                  </span>
                </Link>
              );
            })}
          </nav>

          <p className="menu-section">
            <span>{strings.langLabel}</span>
            <span className="bar" aria-hidden="true" />
          </p>
          {/* THREE LINKS, NOT A LIST OF CHIPS. Until G5 these were <li>s with a
              [SOON] tag beside the heading, because there was nowhere to send
              anyone. They are anchors now, which is also what makes the two
              other languages reachable in this menu without JavaScript.

              A <nav> rather than <ul><li>: .menu-lang is the flex child that
              carries `flex: 1` and the 52px chip, and wrapping each one in an
              <li> would move the equal-width row onto an element chrome.css
              does not style. No stylesheet changed in this phase. */}
          <nav className="menu-langs" aria-label={strings.langLabel}>
            {LOCALES.map((code) => (
              <Link
                key={code}
                href={switchLocale(pathname, code)}
                className="menu-lang"
                aria-current={code === locale}
                onClick={hide}
              >
                <span className="code">{code.toUpperCase()}</span>
                <span className="name">{LOCALE_NAMES[code]}</span>
              </Link>
            ))}
          </nav>

          <p className="menu-section">
            <span>{strings.channel}</span>
            <span className="bar" aria-hidden="true" />
          </p>
          <a className="menu-mail" href="mailto:contact@timseil.dev">
            contact@timseil.dev
          </a>
          <p className="menu-note">{strings.respond}</p>

          <p className="menu-strip">
            {/* The same word the footer's meta bar shows, from the same cached
                answer — lib/api/health.ts owns the mapping so the two cannot
                say different things about one state. The dot stays neutral and
                does not pulse: that this container is running says nothing
                about the api. */}
            <span className="foot-dot" aria-hidden="true" />
            <span>{status}</span>
            <span className="head-spacer" />
            <Clock />
          </p>
        </div>
      </dialog>
    </>
  );
}
