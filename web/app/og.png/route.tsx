// The card that stands in for this site everywhere it is pasted.
//
// A ROUTE HANDLER, NOT AN `opengraph-image` FILE, and G5a decided that before
// this file existed: an `opengraph-image.tsx` under `app/[lang]/` would sit
// behind the canonical redirect, which rewrites and 308s addresses in that
// tree. lib/i18n/routes.ts keeps `og.png` in RESERVED for the same reason.
//
// ONE IMAGE FOR THREE LANGUAGES. The card carries the wordmark, the site name
// and the site's one-line description — all three of which are English on every
// route today, because the German and French dictionaries are empty until P6.
// Three identical PNGs at three addresses would be three things to keep in step
// and no difference to show for it.
//
// THE FONT IS ALREADY RIGHT AND COSTS NOTHING. `next/og` bundles
// Geist-Regular.ttf as its default face, and Geist is what G2 put on `--body`.
// So there is no `fonts:` option here: not an omission, but the one case where
// the default and the design agree. A face from `next/font/google` could not be
// used anyway — it hands out a class name, never a buffer.
//
// THE COLOURS COME OUT OF tokens.css AT BUILD TIME. Satori knows no cascade and
// no custom properties, and invariant 8 forbids a hex literal in this file, so
// the values are read from the stylesheet itself. lib/og/tokens.ts explains the
// parse; next.config.ts has the one line that makes the file survive into the
// standalone image.
//
// WHAT THIS IMAGE IS NOT: a design. No sheet in the read-only handoff draws an
// OG card, and inventing one would be the same overstep that moved the favicon
// (#96) to K2. Everything here already exists somewhere else on the site — the
// wordmark from components/Wordmark.tsx, the two strings from lib/site.ts, the
// four colours from tokens.css. Arranged, not authored.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { requireTokens } from "@/lib/og/tokens";
import { AUTHOR, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const SIZE = { width: 1200, height: 630 };

/** Read at module scope, so a renamed token stops the build rather than the
 *  first share. `process.cwd()` is the project root under `next build` and
 *  `/app` in the standalone image; `outputFileTracingIncludes` puts the file
 *  there. */
const TOKENS = requireTokens(
  readFileSync(join(process.cwd(), "styles", "tokens.css"), "utf8"),
  ["--bg", "--ink", "--acc", "--dim"],
);

export function GET(): ImageResponse {
  return new ImageResponse(
    (
      // Satori supports flexbox and absolute positioning and nothing else — no
      // grid, no float. Every element below is a flex container on purpose.
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: TOKENS["--bg"],
          color: TOKENS["--ink"],
          padding: 80,
          fontSize: 32,
        }}
      >
        {/* The wordmark, as components/Wordmark.tsx renders it: the name in
            ink, the protocol slashes in the accent. */}
        <div style={{ display: "flex", fontSize: 44, letterSpacing: -1 }}>
          <span>{SITE_NAME}</span>
          <span style={{ color: TOKENS["--acc"] }}>://</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 120, height: 4, background: TOKENS["--acc"] }} />
          <div style={{ display: "flex", marginTop: 32, fontSize: 56, lineHeight: 1.25 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>

        {/* The one human, and the role the handoff gives him. The wordmark is
            already at the top; repeating it here would fill the space without
            saying anything. */}
        <div style={{ display: "flex", color: TOKENS["--dim"], fontSize: 26 }}>
          {`${AUTHOR.name} · ${AUTHOR.jobTitle}`}
        </div>
      </div>
    ),
    SIZE,
  );
}
