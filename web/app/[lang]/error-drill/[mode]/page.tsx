// The failure this site causes on purpose.
//
// H13's criterion is "Ein absichtlicher Fehler zeigt die gestaltete Seite und
// erzeugt einen Trace", and #186 has been open since F1b because
// `onRequestError` had never once been triggered. Both need a route that
// throws. This is it, and it is closed unless somebody opens it
// (lib/errors/drill.ts).
//
// TWO MODES, BECAUSE THERE ARE TWO SHAPES, and that is the finding of this
// phase rather than a convenience. Measured against a production build:
//
//   /error-drill/render   throws before the first byte
//                         → 500, body is the 21 characters "Internal Server
//                           Error", and the designed page NEVER appears
//   /error-drill/stream   throws inside a Suspense hole, which is what every
//                         real page on this site does with its data
//                         → 200, the real document with <header> and <footer>,
//                           and app/[lang]/error.tsx renders inside it
//
// So on this site the 500 STATUS and the 500 PAGE are mutually exclusive, and
// a drill with only one mode would have proved whichever half its author
// happened to build. ADR 0078.
//
// WHY THE MODE IS A ROUTE PARAMETER AND NOT A FLAG. Two reasons, both measured.
// The rig can set one value per run (playwright.config.ts, webServer.env), so a
// flag that chose the shape would have cost a second browser run. And a
// parameter is the only way left to make a page render WHOLE at request time:
// `export const dynamic` no longer exists under Cache Components (the segment
// config directory has dynamicParams, instant, maxDuration, preferredRegion,
// prefetch and runtime, and nothing else), and anything that reads runtime data
// has flushed its shell by the time it throws. A parameter that was never baked
// is rendered on demand — the path /blog/kein-post takes, and the reason its
// 404 carries a status at all.

import { Suspense } from "react";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DEV_ERROR_ENV, errorDrillOpen } from "@/lib/errors/drill";

// Belt and braces, the same line the gallery carries: the route 404s outside
// development anyway, and this covers the case where somebody serves a
// development build somewhere reachable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Error drill",
};

// Cache Components refuses an empty list in as many words — "all
// generateStaticParams functions must return at least one result" — so one mode
// is named, and it is deliberately NOT one that throws. What this returns is
// what gets BAKED, and a baked page is one whose gate was decided at build
// time. Both real modes are absent, which is what keeps them rendering on
// demand.
export function generateStaticParams() {
  return [{ mode: "closed" }];
}

/**
 * The failure every real page on this site would have.
 *
 * The annotation is required rather than tidy: a function that only throws
 * infers `Promise<never>`, and TypeScript refuses that as a JSX component
 * (TS2786).
 */
async function ThrowsInAHole(): Promise<React.JSX.Element> {
  await connection();
  throw new Error("H13 error drill (stream): deliberate failure, no upstream involved");
}

export default async function ErrorDrill({ params }: PageProps<"/[lang]/error-drill/[mode]">) {
  const { mode } = await params;

  if (!errorDrillOpen(process.env.NODE_ENV, process.env[DEV_ERROR_ENV])) notFound();

  // Nothing has been sent yet, so the status is still ours to set.
  if (mode === "render") {
    throw new Error("H13 error drill (render): deliberate failure, no upstream involved");
  }

  // The shell goes out first — with the real header and footer in it — and the
  // hole fails afterwards. The response is already a 200 by then.
  if (mode === "stream") {
    return (
      <Suspense fallback={null}>
        <ThrowsInAHole />
      </Suspense>
    );
  }

  notFound();
}
