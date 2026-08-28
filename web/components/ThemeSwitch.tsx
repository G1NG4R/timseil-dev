// 'use client' because this is the one thing on the site that reacts to a
// click and reads the visitor's own storage. Nothing about the seven palettes
// can be decided on the server: the choice lives in the browser, and the server
// is not allowed to know it — that is the whole reason the theme costs no
// request and appears on no log line.
"use client";

import { useSyncExternalStore } from "react";

import {
  type ThemeId,
  applyTheme,
  currentTheme,
  storeTheme,
  subscribeTheme,
} from "@/lib/theme";

// Order and labels are the handoff's, unchanged: docs/design/code/components/
// ThemeSwitch.tsx and the palette sheet number them 01–07 the same way.
//
// The swatch colours went to tokens.css as --sw-*. They are the one colour on
// this page that must NOT follow the theme — a swatch says which palette a
// button switches to, so it has to look the same from inside every other one.
//
// Terminal Noir is `null` rather than the handoff's empty string. It is the
// absence of `data-theme`, and a type that says so is worth more than a string
// that has to be remembered as special.
const THEMES: { id: ThemeId | null; label: string; swatch: string }[] = [
  { id: null, label: "Terminal Noir", swatch: "var(--sw-noir)" },
  { id: "mocha", label: "Catppuccin Mocha", swatch: "var(--sw-mocha)" },
  { id: "amber", label: "Amber CRT", swatch: "var(--sw-amber)" },
  { id: "phosphor", label: "Phosphor", swatch: "var(--sw-phosphor)" },
  { id: "tokyo", label: "Tokyo Night", swatch: "var(--sw-tokyo)" },
  { id: "latte", label: "Catppuccin Latte", swatch: "var(--sw-latte)" },
  { id: "gruvbox", label: "Gruvbox Light", swatch: "var(--sw-gruvbox)" },
];

/**
 * The seven palettes as a row of swatches.
 *
 * BELONGS IN THE FOOTER, not the navigation: a colour scheme is a preference,
 * not a destination. G3 builds the footer and moves it there; until then it
 * sits on the page beside the rest of the development shell.
 *
 * WHICH ONE IS ACTIVE IS READ FROM THE DOM, NOT HELD IN REACT. The server
 * snapshot is `null` — Terminal Noir — because the server cannot know what this
 * visitor stored, and a guess is something hydration would then have to argue
 * with. After hydration the client snapshot reads the attribute ThemeScript
 * already set, so the button catches up with a page that has been right since
 * the first paint.
 *
 * The handoff wrote this as `useState('')` plus a `useEffect` that corrects it.
 * React 19's linter refuses that now, and for the right reason rather than a
 * stylistic one: the theme is an external system, and useSyncExternalStore is
 * how you subscribe to one.
 *
 * The swatches are 11 × 11 and that does not break the 44px rule: layout.css
 * grows every `button` to 44 inside its `@media (pointer: coarse)` block, and
 * the rule hangs on the pointer, not on the viewport width.
 */
export function ThemeSwitch() {
  const active = useSyncExternalStore<ThemeId | null>(
    subscribeTheme,
    currentTheme,
    () => null,
  );

  function pick(id: ThemeId | null) {
    applyTheme(id); // moves the attribute, and tells this component about it
    storeTheme(id);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour scheme"
      style={{ display: "flex", alignItems: "center", gap: "var(--s-8)" }}
    >
      <span
        style={{
          font: "500 var(--t-mono-9)/1 var(--mono)",
          letterSpacing: "var(--ls-label)",
          color: "var(--dim)",
        }}
      >
        THEME
      </span>
      {THEMES.map((theme) => {
        const on = theme.id === active;
        return (
          <button
            key={theme.id ?? "noir"}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={theme.label}
            title={theme.label}
            onClick={() => {
              pick(theme.id);
            }}
            style={{
              width: 11,
              height: 11,
              padding: 0,
              cursor: "pointer",
              background: theme.swatch,
              // The selection is never colour alone: full opacity AND a border
              // in the swatch's own colour, against the line token otherwise.
              border: `1px solid ${on ? theme.swatch : "var(--line-strong)"}`,
              borderRadius: "var(--radius)",
              opacity: on ? 1 : 0.55,
              transition: "opacity var(--d-color) linear",
            }}
          />
        );
      })}
    </div>
  );
}
