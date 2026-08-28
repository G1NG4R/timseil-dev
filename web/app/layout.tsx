import type { Metadata } from "next";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeScript } from "@/components/ThemeScript";

import { fontVariables } from "./fonts";

// The stylesheet order is the whole point of this block, and it is the build
// plan's (G1), not a preference:
//
//   tailwind  utilities drawn from the tokens, no palette of its own
//   tokens    every colour, size, spacing, radius and duration — invariant 8
//   globals   reset, typography, focus, the three keyframes
//   chrome    the header, the menu and the footer — G3
//   layout    the content column and the four breakpoints — LAST, so its
//             media queries win over anything above them
//
// chrome.css is the fifth file and it goes FOURTH, which is the part worth
// reading twice. It gives .nav-desktop and .nav-button their desktop values;
// layout.css's `@media (max-width: 899px)` has to keep overriding them. Put
// chrome after layout and the 900 switch inverts without a single error.
//
// Since G2 the faces arrive over next/font/google and reach `--display`,
// `--body` and `--mono` through the three `--face-*` variables the classes on
// <html> carry.
import "../styles/tailwind.css";
import "../styles/tokens.css";
import "../styles/globals.css";
import "../styles/chrome.css";
import "../styles/layout.css";

export const metadata: Metadata = {
  title: "timseil.dev",
  description: "Backend and DevOps portfolio — the site is its own reference system.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning is required, not tidy: ThemeScript writes
    // data-theme onto this element before React hydrates, and the server never
    // rendered that attribute. Without it every visit with a stored theme logs a
    // hydration mismatch — and G3's acceptance is "zero hydration warnings", so
    // a known one left standing here would drown the ones that matter.
    // It suppresses this element's attributes only, not the tree below it.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {/* The first tab stop, and until now nothing rendered it — globals.css
            has styled `.skip` since G1. It sits above the header in the source
            AND above it in z-index (--z-head is 50, .skip is 100), because a
            skip link the header covers is one nobody can see they have. */}
        <a className="skip" href="#main">
          SKIP TO CONTENT
        </a>
        <SiteHeader />
        {/* The one <main> on the page. Pages render their content, not their
            landmark — two <main> elements is an axe finding, and the skip link
            needs exactly one thing to point at. */}
        <main id="main" className="col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
