// How a PNG gets the site's colours without a second copy of them.
//
// THE COLLISION, STATED PLAINLY. `next/og` renders through Satori, which knows
// inline styles and nothing else: no cascade, no stylesheet, no custom
// properties. So the OG image cannot write `var(--bg)` — it needs the value.
// But invariant 8 and `tools/check-tokens.sh` forbid a colour literal anywhere
// under `web/` except `styles/tokens.css`, and the script's own error message
// names the only way out: "use a token, or add one to tokens.css".
//
// So the image reads tokens.css. Not a generated copy of it, not a hand-kept
// TypeScript twin — the file itself, at build time. That keeps the invariant
// whole with no exception carved into the checker, and it means the day a
// palette value changes, the social card changes with it rather than becoming
// the one surface still showing last month's blue.
//
// THE FIRST `:root` BLOCK AND NOTHING ELSE. Below it, seven `[data-theme]`
// blocks override the same names. A parser that took the last match would hand
// the OG image Gruvbox Light because that block happens to be last in the file;
// a parser that took all matches would hand it whichever the object literal
// kept. The image has no theme — it is one file for everybody — so it gets the
// palette that renders when nobody has chosen: Terminal Noir, which is exactly
// what `:root` holds (ADR 0043 decided that this is the default with no
// prefers-color-scheme fallback).
//
// NOTHING FROM `next/*` IN HERE, and no file system access either. This file
// takes a string and returns values; `app/og.png/route.tsx` does the reading.
// That is lib/chrome.ts's rule and it is what lets `node --test` reach the part
// that can be wrong.

/** Everything between `/*` and the matching close, gone. Values never contain
 *  the sequence, and tokens.css is more comment than declaration — the German
 *  contrast notes alone carry colons, semicolons and brackets that would
 *  otherwise have to be parsed around. */
export function stripCssComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The custom properties of the first `:root` block, as a map from name to
 * value.
 *
 * DERIVED VALUES ARE LEFT OUT ON PURPOSE. `--acc-line` and the three others are
 * `color-mix(in srgb, var(--acc) 35%, transparent)`, and `--display` is a
 * `var()` chain — Satori resolves neither and would silently draw the fallback,
 * which for a colour is transparent. Returning them would offer the caller a
 * value that looks usable and is not; leaving them out turns the mistake into a
 * missing key, and requireTokens() turns a missing key into a stopped build.
 */
export function rootTokens(css: string): Record<string, string> {
  const body = stripCssComments(css);

  const start = body.indexOf(":root");
  if (start === -1) throw new Error("tokens.css has no :root block");

  const open = body.indexOf("{", start);
  const close = body.indexOf("}", open);
  if (open === -1 || close === -1) throw new Error("the :root block is not closed");

  const tokens: Record<string, string> = {};
  for (const line of body.slice(open + 1, close).split(";")) {
    const match = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (match === null) continue;

    const [, name, value] = match;
    if (value.includes("var(") || value.includes("color-mix(")) continue;
    tokens[name] = value;
  }

  return tokens;
}

/**
 * The same map, but a missing name is an error rather than an `undefined` that
 * travels on.
 *
 * An OG image drawn with `background: undefined` is not a broken build, it is a
 * transparent 1200×630 rectangle that every social network renders over its own
 * background — a defect that looks like a design choice and is only ever found
 * by someone else, in their timeline. A renamed token has to stop the build.
 */
export function requireTokens(
  css: string,
  names: readonly string[],
): Record<string, string> {
  const tokens = rootTokens(css);

  // `Object.hasOwn` rather than a comparison against undefined: without
  // noUncheckedIndexedAccess the type of a Record lookup is `string`, so the
  // comparison is one the compiler can prove pointless and the linter refuses,
  // while the value at runtime is exactly the undefined it denies.
  const missing = names.filter((name) => !Object.hasOwn(tokens, name));
  if (missing.length > 0) {
    throw new Error(`tokens.css has no ${missing.join(", ")} in :root`);
  }

  return Object.fromEntries(names.map((name) => [name, tokens[name]]));
}
