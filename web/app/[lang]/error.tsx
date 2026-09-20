"use client";

// The 500, and it renders INSIDE the chrome — which is the whole reason this
// file exists beside app/global-error.tsx rather than instead of it.
//
// `error.js` "wraps loading.js, not-found.js, page.js, and nested layout.js
// files … It does NOT wrap the layout.js … above it in the same segment"
// (error.md). This file is a sibling of app/[lang]/layout.tsx, so it renders as
// that layout's child: the real SiteHeader, the real SiteFooter, and with them
// the real way to PRIVACY and IMPRINT. ADR 0044 asked for exactly that and the
// 404 could not give it — app/global-not-found.tsx renders outside every
// layout and hand-copies one footer row instead (#358). This page copies
// nothing.
//
// MEASURED, NOT ASSUMED. In a production build, with the drill open: the bytes
// carry `<html lang="en">`, `<header>` and `<footer>`, and
// `document.documentElement.id` is NOT `__next_error__`. The failure took the
// Suspense hole it happened in and nothing else.
//
// WHAT IS NOT IN THE BYTES IS THIS FILE. React's server renderer has no error
// boundaries at all — `getDerivedStateFromError` does not appear once in
// react-dom-server.node.production.js, and Next's own boundary
// (client/components/error-boundary.js) is a class component built on it. So
// this page exists after hydration or not at all, and a visitor without
// JavaScript sees the shell without the hole filled. That is a property of the
// framework, written down rather than hidden. ADR 0078.
//
// `retry`, NOT `reset`. The prop became stable in 16.3.0 (error.md, Version
// History) and `reset` is now the documented exception: it clears the error
// without re-fetching, which on this page would re-render the same failure and
// call it a recovery.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ErrorPanel } from "@/components/state/ErrorPanel";
import { ERROR_WORDS } from "@/lib/errors/words";
import { localeHref, localeOf } from "@/lib/i18n/routes";

/**
 * What the browser recorded as the status of this document, or `undefined`.
 *
 * `undefined` rather than a fallback where the entry is missing or the field
 * unsupported: lib/state/lines.ts prints `— NO DATA` for it, which is the true
 * answer. A guess here would be the invented number this whole page is about.
 */
function measuredStatus(): number | undefined {
  if (typeof performance === "undefined") return undefined;

  const [navigation] = performance.getEntriesByType("navigation");
  const measured = (navigation as PerformanceNavigationTiming | undefined)?.responseStatus;

  return typeof measured === "number" && measured > 0 ? measured : undefined;
}

export default function RenderError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // NO RETRY COUNTER, and that is measured rather than forgotten. STATE.05
  // draws `retry in 30s · 2/5` as the panel's third line, and none of those
  // three numbers exists here: nothing schedules the attempt, nothing caps it,
  // and the count itself does not survive — React remounts this boundary on
  // retry, so a `useState` starts over. lib/state/retry.ts carries the whole
  // reading. #231 stays open.

  const locale = localeOf(usePathname());

  // THE STATUS IS READ, NOT DECLARED, and it is the one number here a careless
  // version would have invented. "500" is what an error page wants to say; on
  // this site it is usually false — Cache Components streams a shell first, so
  // a failure inside it arrives after the headers are out and the response
  // stays 200. Measured both ways on the drill route.
  //
  // NO EFFECT AND NO STATE, and the licence for that is this phase's own
  // finding: React's server renderer has no error boundaries, so this component
  // never renders anywhere but a browser. There is no server pass to guard
  // against and nothing to synchronise afterwards — reading it during render is
  // reading it at the only moment that exists.
  const status = measuredStatus();

  return (
    <section className="er">
      <h1 className="er-head">RENDER FAILED</h1>

      <p className="er-lede">{ERROR_WORDS.lede}</p>

      {/* The page's one alert moment. STATE.05: "Rot nur hier — pro Seite ein
          Alert-Moment", and the footer's own state marks are not alerts, so
          this is the only `data-tone="alert"` in the document. */}
      <ErrorPanel
        source="web"
        status={status}
        statusText="render failed"
        digest={error.digest ?? null}
      />

      <p className="er-note">{ERROR_WORDS.digestNote}</p>
      <p className="er-note">{ERROR_WORDS.correlationNote}</p>

      <div className="er-actions">
        {/* A real button: it changes nothing about where you are. The same
            reasoning NotFoundHero gives for REPLAY GLITCH. */}
        <button
          type="button"
          className="btn"
          data-variant="primary"
          onClick={() => {
            retry();
          }}
        >
          {ERROR_WORDS.retry}
        </button>

        {/* An anchor wearing the button's clothes, because it navigates. */}
        <Link className="btn" data-variant="secondary" href={localeHref(locale, "/")}>
          {ERROR_WORDS.home}
        </Link>
      </div>
    </section>
  );
}
