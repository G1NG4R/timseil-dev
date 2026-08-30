import type { Metadata } from "next";

import { ThemeScript } from "@/components/ThemeScript";

import { fontVariables } from "../fonts";

// A SECOND ROOT LAYOUT, and it exists because it has to rather than because the
// gallery wanted its own frame.
//
// Every page in the App Router needs a root layout that renders <html> and
// <body>. Since G5 this site's root layout is app/[lang]/layout.tsx — the
// language became part of the route, so the root moved inside the [lang]
// segment (ADR 0046). Everything else that lives outside it today is a ROUTE
// HANDLER — healthz, robots, sitemap, feed.xml, og.png — and route handlers
// need no layout. The gallery is the first page out here, so it is the first
// thing that needs one.
//
// WHAT IT DELIBERATELY DOES NOT CARRY: the header, the footer and the language.
// The gallery is a workbench, not a page of the site. Nesting the real header
// inside it would put a second <header> on the screen and make the chrome's own
// entry in the inventory a worse example than the one every other page already
// shows. And it has no language for the same reason healthz has none — nobody
// reads a component inventory as prose (registry.ts carries the sheet's German
// state names verbatim, because they are transcriptions, not copy).
//
// The stylesheets are the site's, in the site's order (see app/[lang]/layout.tsx
// for why that order is load-bearing), plus gallery.css. chrome.css is included
// even though there is no chrome here: MobileMenu and the footer are not the
// only things in it, and leaving it out would give the gallery a different
// cascade from the site, which is the one thing a component gallery may not
// have. Same reason ui.css and case.css are here now that the site loads them
// both: a preview that renders under a shorter cascade than the page is a
// preview of something else.
import "../../styles/tailwind.css";
import "../../styles/tokens.css";
import "../../styles/globals.css";
import "../../styles/chrome.css";
import "../../styles/state.css";
import "../../styles/ui.css";
import "../../styles/case.css";
import "../../styles/gallery.css";
import "../../styles/layout.css";

// The gallery is not on the public site at all — the page 404s outside
// development — so this is belt and braces rather than the actual defence. It
// costs one line and covers the case where somebody serves a development build
// somewhere reachable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: LayoutProps<"/dev">) {
  return (
    // suppressHydrationWarning for the same reason the site layout has it:
    // ThemeScript writes data-theme before React hydrates, and the server never
    // rendered that attribute. The gallery needs the themes more than any page
    // does — seven palettes is how this project proves a state is not carried
    // by colour alone.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <main id="main" className="col">
          {children}
        </main>
      </body>
    </html>
  );
}
