// 'use client' because a disclosure is keyboard state: what is open, and which
// row the arrow keys have marked. Neither survives a round trip to a server that
// is not allowed to know either.
"use client";

import { useEffect, useRef, useState } from "react";

// The three languages and the routes that will carry them. Only EN exists; G5
// builds /de and /fr, and until then those two rows say so rather than pointing
// at a 404.
//
// The order is the sheet's. `route` is what the row displays, not an href —
// nothing here navigates yet, which is the whole reason [SOON] is legible.
const LANGS = [
  { code: "EN", name: "English", route: "/", ready: true },
  { code: "DE", name: "Deutsch", route: "[SOON]", ready: false },
  { code: "FR", name: "Français", route: "[SOON]", ready: false },
];

const SELECTED = 0; // EN. G5 derives this from the path instead.

/**
 * `EN ▾` — the language disclosure, built and not yet wired.
 *
 * THE BEHAVIOUR IS COMPLETE, THE NAVIGATION IS NOT, and that is the decision
 * rather than an unfinished edge. The sheet marks the switcher `IM BAU` itself
 * ("die Übersetzungen entstehen beim Bauen"), and G5 is the phase that adds the
 * routes. Building the disclosure now means G5 hangs two paths on a control that
 * already works, instead of writing the control while it is busy with i18n.
 *
 * ONE TAB STOP, NOT FOUR. The button is focusable and the rows are not — the
 * sheet: "TAB erreicht den Knopf, nicht die drei Zeilen — eine Station, kein
 * Umweg". The arrow keys move `aria-activedescendant` instead, which is the
 * listbox pattern and the reason the rows are <li> rather than <button>.
 *
 * TWO DEVIATIONS FROM THE SHEET, both to make the tree valid rather than to
 * change the picture:
 *
 *   1  The sheet puts `role="listbox"` on the panel div, which also holds the
 *      LANGUAGE heading and the footnote. A listbox may contain only options, so
 *      the role sits on a <ul> around the three rows and the two texts are its
 *      siblings.
 *   2  The sheet's control is `role="button"`, which does not support
 *      `aria-activedescendant` — and without that, the arrow keys move a marker
 *      no screen reader announces. `role="combobox"` is the ARIA 1.2
 *      select-only combobox, which is what this widget actually is: one tab
 *      stop that owns a listbox. Keeping it a native <button> keeps the focus
 *      ring, Enter and Space for free.
 */
export function LangMenu() {
  const [open, setOpen] = useState(false);
  const [marked, setMarked] = useState(SELECTED);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Outside click closes without selecting. `mousedown` rather than `click`, so
  // the panel is gone before whatever was clicked reacts.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setMarked(SELECTED);
    button.current?.focus(); // "ESC schließt, Fokus bleibt auf dem Knopf"
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const count = LANGS.length;

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      // Wraps. A list of three where the third press does nothing reads as broken.
      const delta = event.key === "ArrowDown" ? 1 : count - 1;
      setMarked((current) => (current + delta) % count);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setMarked(event.key === "Home" ? 0 : count - 1);
      return;
    }
    if (open && (event.key === "Enter" || event.key === " ")) {
      // preventDefault, or the button's native click re-opens what this closes.
      event.preventDefault();
      close();
    }
  }

  const optionId = (index: number) => `lang-option-${String(index)}`;

  return (
    <div className="lang" ref={root}>
      <button
        ref={button}
        type="button"
        className="lang-button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="lang-list"
        aria-label={`Language — ${LANGS[SELECTED].name}`}
        aria-activedescendant={open ? optionId(marked) : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
      >
        {LANGS[SELECTED].code}
        <span className="lang-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="lang-panel">
          <p className="lang-head">
            <span>LANGUAGE</span>
            <span>ESC</span>
          </p>
          <ul className="lang-list" id="lang-list" role="listbox" aria-label="Language">
            {LANGS.map((lang, index) => (
              <li
                key={lang.code}
                id={optionId(index)}
                role="option"
                className="lang-option"
                aria-selected={index === SELECTED}
                aria-disabled={lang.ready ? undefined : true}
                data-marked={index === marked}
                onMouseEnter={() => {
                  setMarked(index);
                }}
                onClick={close}
              >
                <span className="code">{lang.code}</span>
                <span className="name">{lang.name}</span>
                <span className="route">{lang.route}</span>
              </li>
            ))}
          </ul>
          <p className="lang-foot">THE URL DECIDES · NO REDIRECT</p>
        </div>
      )}
    </div>
  );
}
