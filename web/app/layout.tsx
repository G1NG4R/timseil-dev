import type { Metadata } from "next";

// Deliberately bare. Fonts are phase G2 (`next/font/google` for Chakra Petch,
// Geist and JetBrains Mono), the stylesheet order globals → layout is G1, and
// the real chrome is G3. Nothing of that is guessed at here.
//
// There is no stylesheet import on purpose: every colour, radius and duration
// lives in `tokens.css` from G1 onwards, and until that file exists the honest
// number of hardcoded ones is zero.

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
