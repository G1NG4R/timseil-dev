import type { Metadata } from "next";

// The stylesheet order is the whole point of this block, and it is the build
// plan's (G1), not a preference:
//
//   tailwind  utilities drawn from the tokens, no palette of its own
//   tokens    every colour, size, spacing, radius and duration — invariant 8
//   globals   reset, typography, focus, the three keyframes
//   layout    the content column and the four breakpoints — LAST, so its
//             media queries win over anything above them
//
// Still deliberately absent: fonts and the anti-flash theme snippet are G2, the
// real header and footer are G3. `--display`, `--body` and `--mono` resolve to
// the fallbacks tokens.css names until next/font/google fills them.
import "../styles/tailwind.css";
import "../styles/tokens.css";
import "../styles/globals.css";
import "../styles/layout.css";

export const metadata: Metadata = {
  title: "timseil.dev",
  description: "Backend and DevOps portfolio — the site is its own reference system.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
