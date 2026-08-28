// 'use client' for one reason: the sheet says the wordmark keeps its pointer on
// every page except the one it leads to. That is a question about the current
// path, and `usePathname()` is a client hook. It ships about as much JavaScript
// as the sentence describing it.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { stripLocale } from "@/lib/chrome";

/**
 * `TS://` — the way home from every page.
 *
 * ON `/` IT STAYS A LINK and stops looking like one. The sheet: "Auf der
 * Startseite bleibt es sichtbar, aber ohne Zeiger." Removing the anchor
 * entirely would take it out of the tab order on exactly one page, which is a
 * worse answer to "don't make the current place look clickable" than
 * `aria-current` plus `cursor: default` — the same treatment the active nav
 * entry gets, for the same reason.
 *
 * `href="/"` is not locale-aware yet. G5 owns that, together with the routes it
 * would point at.
 */
export function Wordmark() {
  const atHome = stripLocale(usePathname()) === "/";

  return (
    <Link href="/" className="head-mark" aria-current={atHome ? "page" : undefined}>
      TS<span className="slash">://</span>
    </Link>
  );
}
