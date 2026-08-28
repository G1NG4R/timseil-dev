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
import { NAV, activeNav } from "@/lib/chrome";

// EN is the base language; /de and /fr are G5's. Marked rather than linked, for
// the same reason the desktop dropdown marks them: a chip that navigates to a
// route that does not exist is worse than one that says so.
const LANGS = [
  { code: "EN", name: "English", current: true },
  { code: "DE", name: "Deutsch", current: false },
  { code: "FR", name: "Français", current: false },
];

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
export function MobileMenu({ status }: { status: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const active = activeNav(usePathname());

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
        aria-label="Menu and language"
        onClick={show}
      >
        <span className="bars" aria-hidden="true" />
      </button>

      <dialog
        ref={dialog}
        className="menu"
        aria-label="Menu and language"
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
          <button ref={closer} type="button" className="menu-close" aria-label="Close menu" onClick={hide}>
            CLOSE
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
                  href={entry.href}
                  className="menu-link"
                  aria-current={on ? "page" : undefined}
                  onClick={hide}
                >
                  <span className="index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="label">{entry.label}</span>
                  <span className="mark" aria-hidden="true">
                    {on ? "●" : "→"}
                  </span>
                </Link>
              );
            })}
          </nav>

          <p className="menu-section">
            <span>LANGUAGE</span>
            <span className="bar" aria-hidden="true" />
            <span className="tag">[SOON]</span>
          </p>
          <ul className="menu-langs">
            {LANGS.map((lang) => (
              <li key={lang.code} className="menu-lang" aria-current={lang.current}>
                <span className="code">{lang.code}</span>
                <span className="name">{lang.name}</span>
              </li>
            ))}
          </ul>

          <p className="menu-section">
            <span>OPEN A CHANNEL</span>
            <span className="bar" aria-hidden="true" />
          </p>
          <a className="menu-mail" href="mailto:contact@timseil.dev">
            contact@timseil.dev
          </a>
          <p className="menu-note">USUALLY UNDER 24 H</p>

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
