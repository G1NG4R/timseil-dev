// 'use client' because a disclosure is keyboard state: what is open, and which
// row the arrow keys have marked. Neither survives a round trip to a server that
// is not allowed to know either. Since G5 it also navigates, which needs the
// current path and the router.
"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  LOCALES,
  LOCALE_NAMES,
  localeHref,
  localeOf,
  switchLocale,
} from "@/lib/i18n/routes";

/** What the panel says around the three rows. Four strings rather than the
 *  whole dictionary: this is a client component, so every prop is serialised
 *  into the payload of every page. */
export interface LangStrings {
  readonly aria: string;
  readonly label: string;
  readonly esc: string;
  readonly note: string;
}

/**
 * `EN ▾` — the language disclosure.
 *
 * G3 BUILT THE BEHAVIOUR, G5 HUNG THE ROUTES ON IT, and the file is the shorter
 * for having been written in that order: the keyboard contract below did not
 * change in this phase, only `SELECTED` (a constant, now read off the path) and
 * what a commit does (nothing, now a navigation).
 *
 * ONE TAB STOP, NOT FOUR. The button is focusable and the rows are not — the
 * sheet: "TAB erreicht den Knopf, nicht die drei Zeilen — eine Station, kein
 * Umweg". The arrow keys move `aria-activedescendant` instead, which is the
 * listbox pattern and the reason the rows are <li> rather than <button>.
 *
 * IT IS ALSO WHY THE ROWS ARE NOT LINKS. An <a> inside each row would be the
 * obvious way to make the languages crawlable, and it would add three tab stops
 * the sheet spent a line refusing. The sheet solves discoverability elsewhere
 * instead, and G5 built both halves: the footer's `ALT /de /fr` cell carries
 * real anchors, and every page emits `hreflang` for all three. Neither needs
 * this panel, or JavaScript, to be found.
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
export function LangMenu({ strings }: { strings: LangStrings }) {
  const pathname = usePathname();
  const router = useRouter();

  // The URL decides which language is selected, and nothing else does. The
  // sheet's rule, in one line — there is no stored preference to disagree with
  // it, which is also why invariant 9 still names exactly two localStorage
  // keys. ADR 0046.
  const current = localeOf(pathname);
  const selected = LOCALES.indexOf(current);

  const [open, setOpen] = useState(false);
  const [marked, setMarked] = useState(selected);
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
    setMarked(selected);
    button.current?.focus(); // "ESC schließt, Fokus bleibt auf dem Knopf"
  }

  /** Go to the same page in another language. `push`, not `replace`: a language
   *  change is a place the visitor can want to come back from. Choosing the
   *  language you are already in is a close and not a navigation. */
  function commit(index: number) {
    const target = LOCALES[index];
    close();
    if (target === current) return;
    router.push(switchLocale(pathname, target));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const count = LOCALES.length;

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
      setMarked((cur) => (cur + delta) % count);
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
      // "bei offener Liste übernimmt Enter die markierte Sprache" — until G5
      // this only closed, because there was nowhere to take it.
      event.preventDefault();
      commit(marked);
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
        aria-label={`${strings.aria} — ${LOCALE_NAMES[current]}`}
        aria-activedescendant={open ? optionId(marked) : undefined}
        onClick={() => {
          setOpen((cur) => !cur);
        }}
        onKeyDown={onKeyDown}
      >
        {current.toUpperCase()}
        <span className="lang-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="lang-panel">
          <p className="lang-head">
            <span>{strings.label}</span>
            <span>{strings.esc}</span>
          </p>
          <ul className="lang-list" id="lang-list" role="listbox" aria-label={strings.aria}>
            {LOCALES.map((code, index) => (
              <li
                key={code}
                id={optionId(index)}
                role="option"
                className="lang-option"
                aria-selected={code === current}
                data-marked={index === marked}
                onMouseEnter={() => {
                  setMarked(index);
                }}
                onClick={() => {
                  commit(index);
                }}
              >
                <span className="code">{code.toUpperCase()}</span>
                <span className="name">{LOCALE_NAMES[code]}</span>
                {/* The route, as the sheet prints it: `/`, `/de`, `/fr`. It is
                    the address of that language's homepage and not of this
                    page — the panel names where a language LIVES, the click
                    goes where the visitor IS. */}
                <span className="route">{localeHref(code, "/")}</span>
              </li>
            ))}
          </ul>
          <p className="lang-foot">{strings.note}</p>
        </div>
      )}
    </div>
  );
}
