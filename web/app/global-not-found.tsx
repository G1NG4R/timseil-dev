// The 404 — "Router-Trace, montierte Routen, Rückwege. Der eine Alert-Rot-
// Moment." (build-plan.md, H10)
//
// WHY THIS FILE AND NOT `not-found.tsx`, which is the obvious place and was the
// first three attempts. All of it was measured against a production build in
// H10a, because every one of these was plausible on paper:
//
//   app/[lang]/not-found.tsx    catches `notFound()` raised INSIDE the segment
//                               and nothing else, so an unmatched address never
//                               reached it. Worse, what it did catch it served
//                               through Next's error document: `<html
//                               id="__next_error__">`, a body holding nothing
//                               but <script>, no stylesheet in the head. The
//                               page existed only after hydration — not without
//                               JavaScript, not to a crawler, not to curl.
//   app/not-found.tsx           caught the unmatched address and rendered with
//                               the same nothing, AND took the segment's own
//                               cases down with it.
//   app/[lang]/[...rest]        shadowed the real pages: `/`, `/work` and
//                               `/blog` answered the 404 body with a `200`.
//   app/layout.tsx              would nest the segment layout so a not-found
//                               could render inside it — and it removes `lang`
//                               from `next/root-params`, because a root
//                               parameter is a segment ABOVE the root layout.
//                               The build says so outright: "Export lang
//                               doesn't exist in target module." ADR 0046's
//                               whole i18n mechanism hangs off that import.
//
// Next's own documentation names our shape as the reason this file exists:
// `global-not-found` is for when "your root layout is defined using top-level
// dynamic segments (e.g. app/[country]/layout.tsx), which makes composing a
// consistent 404 page harder". That is `app/[lang]/layout.tsx` exactly. ADR
// 0073.
//
// IT IS AN EXPERIMENTAL FLAG, and that is a cost this phase is paying with its
// eyes open: `experimental.globalNotFound` in next.config.ts. The alternative
// was a 404 that only exists after hydration, on the route this site serves
// more than any other — F3 measured most requests to this container as 404s,
// which is scanner traffic. A blank page for everything without JavaScript was
// the worse trade.
//
// THIS FILE RENDERS ITS OWN DOCUMENT. Next skips the layouts entirely here, so
// the <html>, the fonts, the theme script and the stylesheets are this file's
// job. Everything it imports is the site's own, in the site's own order.
//
// WHAT IT CANNOT HAVE, and the honest version rather than the tidy one:
// `SiteHeader` and `SiteFooter` both call `getDictionary()`, which reads
// `next/root-params` — and there is no route here to read a parameter from. So
// the chrome is absent, and ADR 0044's objection to exactly that stands: the
// footer is "der einzige Weg zu PRIVACY und IMPRINT von einer Fehlerseite aus".
// The two links are therefore rendered below by hand. That is a second, smaller
// copy of one row of the footer, and it is written down here rather than
// explained away.

import type { Metadata } from "next";
import { Suspense } from "react";

import { headers } from "next/headers";

import { ErrorBudgetSurface } from "@/components/notfound/ErrorBudgetSurface";
import { MountedRoutes } from "@/components/notfound/MountedRoutes";
import { NotFoundHero } from "@/components/notfound/NotFoundHero";
import { RouterTrace } from "@/components/notfound/RouterTrace";
import { ThemeScript } from "@/components/ThemeScript";
import { correlationFrom } from "@/lib/correlation";
import { resolveMessages } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, localeHref } from "@/lib/i18n/routes";
import { MOUNTED_COUNT, MOUNTED_ROUTES, type MountedRoute } from "@/lib/notfound/mounted";
import { REQUESTED_PATH_HEADER, displayPath, routerTraceLines } from "@/lib/notfound/trace";

import { fontVariables } from "./fonts";

// The site's own cascade, in the site's own order (app/[lang]/layout.tsx
// carries the argument for it). Four of the page sheets are absent because
// nothing here draws a case study, a homepage, a work row or a post.
import "../styles/tailwind.css";
import "../styles/tokens.css";
import "../styles/globals.css";
import "../styles/chrome.css";
import "../styles/state.css";
import "../styles/ui.css";
import "../styles/notfound.css";
import "../styles/layout.css";

// THE ONE PIECE OF METADATA THIS FILE HAS TO CARRY ITSELF, and axe is what
// asked for it: `document-title`, serious — "a page with no title is a tab and
// a history entry that nobody can tell apart". Every other page inherits a
// title from app/[lang]/layout.tsx; this one bypasses every layout, so it
// inherited nothing and shipped without one.
//
// NO `robots` HERE. Next injects `<meta name="robots" content="noindex">` on
// anything answering 404, and a second copy would be this file claiming
// something the framework already guarantees.
export const metadata: Metadata = {
  title: "404 — route not resolved",
};

/**
 * The trace, with the two values only a live request can supply.
 *
 * IT IS ITS OWN COMPONENT SO THAT IT CAN SUSPEND. Under `cacheComponents` this
 * route is prerendered, and reading `headers()` in the body of the page is a
 * build error in as many words: "Route /_not-found: Next.js encountered
 * uncached or runtime data during prerendering." A Suspense boundary is the
 * sanctioned way to have both — a static shell that is served at once, and the
 * measured values streaming into it.
 *
 * AND THE STATUS SURVIVES IT, which was the thing worth measuring rather than
 * assuming. A streamed response normally cannot have its status changed after
 * the headers are out; here the 404 is the router's, decided before rendering
 * begins, so it holds. Measured: 404 on every unmatched address, with this
 * boundary in place.
 */
async function LiveTrace() {
  const requestHeaders = await headers();
  const { span } = correlationFrom(requestHeaders);

  return (
    <TracePanel
      path={displayPath(requestHeaders.get(REQUESTED_PATH_HEADER))}
      traceId={span?.traceId ?? null}
    />
  );
}

/** The same panel either way — the fallback is this with both values absent,
 *  which is invariant 1 rather than a placeholder: `— NO DATA` until the
 *  request's own numbers arrive, and never an invented id. */
function TracePanel({ path, traceId }: { path: string | null; traceId: string | null }) {
  return (
    <RouterTrace
      path={path}
      traceId={traceId}
      lines={routerTraceLines({ path, mounted: MOUNTED_COUNT, hints: MOUNTED_ROUTES })}
    />
  );
}

export default function GlobalNotFound() {
  // THE SHELL IS ENGLISH, AND IT HAS TO BE. This route is prerendered once for
  // the whole site, so there is no language segment to read and nothing to vary
  // on — `/de/nonsense` gets this page with English ways out. Today that costs
  // one thing only, the `/de` prefix on five links: the German and French
  // dictionaries are empty overlays, so every page on this site already serves
  // English text (lib/i18n/messages.ts, "KEINE HALBEN SEITEN"). When P6 fills a
  // language it will cost more than that, and the backlog says so.
  const locale = DEFAULT_LOCALE;
  const { messages } = resolveMessages(locale);

  const descriptions: Record<MountedRoute, string> = {
    "/": messages.notFoundRouteHome,
    "/work": messages.notFoundRouteWork,
    "/blog": messages.notFoundRouteBlog,
    "/about": messages.notFoundRouteAbout,
    "/contact": messages.notFoundRouteContact,
  };

  return (
    // suppressHydrationWarning for app/[lang]/layout.tsx's reason: ThemeScript
    // writes data-theme before React hydrates and the server never rendered it.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <main id="main" className="col">
          <section className="nf">
            <div className="nf-main">
              <NotFoundHero
                lede={messages.notFoundLede}
                returnLabel={messages.notFoundReturn}
                workLabel={messages.notFoundSelectedWork}
                homeHref={localeHref(locale, "/")}
                workHref={localeHref(locale, "/work")}
              />

              <Suspense fallback={<TracePanel path={null} traceId={null} />}>
                <LiveTrace />
              </Suspense>
            </div>

            <ErrorBudgetSurface lede={messages.notFoundBudgetLede} />

            <MountedRoutes
              routes={MOUNTED_ROUTES.map((path) => ({
                path,
                href: localeHref(locale, path),
                description: descriptions[path],
              }))}
              cvHint={messages.notFoundCvHint}
            />

            {/* ADR 0044's two links, by hand, because the real footer cannot
                render here. Not a footer: one row, the two pages an error page
                is legally obliged to keep reachable. */}
            <p className="nf-legal">
              <a href={localeHref(locale, "/privacy")}>{messages.privacy}</a>
              <a href={localeHref(locale, "/imprint")}>{messages.imprint}</a>
            </p>
          </section>
        </main>
      </body>
    </html>
  );
}
