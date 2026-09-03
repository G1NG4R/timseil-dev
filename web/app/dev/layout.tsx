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
// H4. The gallery renders SkillRow and ModuleCard, so it needs the stylesheet
// that draws them — and it needs it in the site's own position in the order,
// which is between case.css and layout.css. The comment above already stated
// the rule this line obeys: "a preview that renders under a shorter cascade
// than the page is a preview of something else." It was found the way that
// sentence predicts, by a sheet-oracle entry reading `display: block` off a
// grid.
import "../../styles/home.css";
// H6, and the rule above caught it a second time within one phase. The gallery
// draws the whole Work Index — it is the only place in this rig where a row is
// in the document at all — so it needs work.css, in the site's own position
// between home.css and layout.css. Built without this line first, and the
// measurement said `display: list-item` where the page says `grid`: the
// preview column never appeared, the name column never grew, and every number
// taken off it would have been a number about a page that does not exist.
// `012-the-preview-had-a-shorter-cascade-than-the-page.mdx` is that post.
import "../../styles/work.css";
// H7, and the line is here on the FIRST commit of the phase rather than after a
// measurement said `display: block`. Twice is a coincidence to argue with;
// three times would be a habit. The gallery gets about.css in the site's own
// position — after work.css, before layout.css — because H7b puts the
// trajectory rail in this page and the rail is a grid.
import "../../styles/about.css";
import "../../styles/gallery.css";
import "../../styles/layout.css";

// The gallery is not on the public site at all — the page 404s outside
// development — so this is belt and braces rather than the actual defence. It
// costs one line and covers the case where somebody serves a development build
// somewhere reachable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // A `<title>` because axe asks for one, and H4 is the phase that put this
  // route under axe at all — SYS.01's rows exist nowhere else in the rig, so
  // the workbench had to come into the run, and it arrived with one violation
  // of its own. `document-title`, serious: a page with no title is a tab and a
  // history entry that nobody can tell apart. It was never a finding before
  // because nothing had ever looked.
  title: "Component gallery",
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
