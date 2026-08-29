// 'use client' twice over: which entry is white depends on the current path,
// and the labels scramble on hover and focus. Both are things only the browser
// knows — the first because the server renders one tree for every route in a
// static shell, the second because it is an animation.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV, type NavId, activeNav } from "@/lib/chrome";
import { localeHref, localeOf } from "@/lib/i18n/routes";
import { SCRAMBLE_PASSES, parseMs, scrambleFrame } from "@/lib/scramble";

// A counter rather than Math.random(): two hovers in a row should not look
// identical, and nothing here should be unreproducible. lib/scramble.ts takes
// the seed as an argument precisely so this decision lives in one place.
let runs = 0;

/**
 * Writes the label's frames straight to the DOM.
 *
 * BEHIND REACT'S BACK, ON PURPOSE, and the reason is worth the paragraph.
 * Fifteen setStates a second per label would re-render the nav on every frame of
 * a decoration, and with `reactCompiler: true` the memoisation would fight it.
 * It is safe here for a narrow reason rather than a general one: the label is a
 * constant, React never re-renders that text node with a different value, and
 * the loop always ends by writing the label back. Change either of those and
 * this becomes the trap I1 documents ("der dekodierte Text muss der Komponente
 * gehören, die ihn anzeigt").
 *
 * FOUR FRAMES, NOT SIXTY. The handoff runs four passes across --d-scramble; a
 * per-frame rAF would be a different, busier animation. The rAF loop only picks
 * which of the four is due.
 *
 * The duration is read off the computed style, so --d-scramble in tokens.css
 * stays the only place it is written. If it cannot be read the animation is
 * skipped rather than given a made-up length — a label that only changes colour
 * is not a defect, an invented duration is.
 */
function scramble(el: HTMLElement, label: string): void {
  if (el.dataset.busy === "1") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const duration = parseMs(
    getComputedStyle(document.documentElement).getPropertyValue("--d-scramble"),
  );
  if (duration === null || duration <= 0) return;

  const seed = (runs += 1);
  const start = performance.now();
  let shown = -1;
  el.dataset.busy = "1";

  const step = (now: number): void => {
    const elapsed = Math.min(1, (now - start) / duration);
    const pass = Math.ceil(elapsed * SCRAMBLE_PASSES);
    if (pass !== shown) {
      shown = pass;
      el.textContent = scrambleFrame(label, pass / SCRAMBLE_PASSES, seed);
    }
    if (elapsed < 1) {
      requestAnimationFrame(step);
      return;
    }
    el.textContent = label;
    delete el.dataset.busy;
  };

  requestAnimationFrame(step);
}

/**
 * WORK · LOG · ABOUT · CONTACT, in the order the sheet fixes.
 *
 * The active entry is white and carries `aria-current="page"`; CSS takes the
 * pointer off it and leaves the underline off. It does not scramble — the
 * current place is not something to point at.
 *
 * On `/` none of them is active. That is the build plan's sentence and
 * lib/chrome.ts's first assertion.
 *
 * THE LABELS ARRIVE AS A PROP AND THE ROUTES DO NOT. `lib/chrome.ts` holds the
 * four routes, which are the same in every language — the sheet's matrix:
 * "Navigation: übersetzt, Route bleibt /blog". The words are prose and come
 * from the dictionary, so the server passes exactly these four strings across
 * the boundary rather than the whole of it.
 */
export function NavLinks({ labels }: { labels: Record<NavId, string> }) {
  const pathname = usePathname();
  const active = activeNav(pathname);
  const locale = localeOf(pathname);

  return (
    <nav className="nav-links" aria-label="Main">
      {NAV.map((entry) => {
        const on = entry.id === active;
        const label = labels[entry.id];
        return (
          <Link
            key={entry.id}
            href={localeHref(locale, entry.href)}
            className="nav-link"
            aria-current={on ? "page" : undefined}
            onMouseEnter={
              on
                ? undefined
                : (event) => {
                    scramble(event.currentTarget, label);
                  }
            }
            onFocus={
              on
                ? undefined
                : (event) => {
                    scramble(event.currentTarget, label);
                  }
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
