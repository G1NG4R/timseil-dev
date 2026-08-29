// The broken cases first, and there are three of them: a token that was
// renamed, a value Satori cannot resolve, and a palette block being read
// instead of the default one.
//
// This file names colours, which `tools/check-tokens.sh` allows in a *.test.ts
// for exactly this reason: a test that proves a colour is present has to say
// which one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requireTokens, rootTokens, stripCssComments } from "./tokens.ts";

/** The real file, because the interesting failure is not "does the parser
 *  work" but "does the file still say what the image asks it for". */
const TOKENS_CSS = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** The four names app/og.png/route.tsx asks for. Transcribed rather than
 *  imported: a list the implementation reads is not an oracle. */
const NEEDED = ["--bg", "--ink", "--acc", "--dim"] as const;

// THE ONE THAT MATTERS. If someone renames --acc, `make check` stays green —
// nothing else in the repository imports it by name from TypeScript — and the
// social card goes transparent. This is the assertion that turns that into a
// failed test.
void test("tokens.css still holds every colour the OG image asks for", () => {
  const tokens = requireTokens(TOKENS_CSS, NEEDED);

  for (const name of NEEDED) {
    assert.match(tokens[name], /^#[0-9A-Fa-f]{6}$/, `${name} is not a plain hex colour`);
  }
});

// The default palette is Terminal Noir and it lives in :root; the seven
// [data-theme] blocks below override the same names. A parser that took the
// last match would draw the card in Gruvbox Light.
void test("the first :root block wins, not the last theme block", () => {
  assert.equal(rootTokens(TOKENS_CSS)["--bg"], "#0A0E14");

  const twoBlocks = ":root { --bg: #111111; }\n[data-theme='latte'] { --bg: #EFF1F5; }";
  assert.equal(rootTokens(twoBlocks)["--bg"], "#111111");
});

// Satori resolves neither var() nor color-mix(): it draws the fallback, and for
// a colour the fallback is transparent. A value it cannot use must not be
// offered as if it could be.
void test("values Satori cannot resolve are left out, not passed on", () => {
  const css = [
    ":root {",
    "  --acc: #00E5FF;",
    "  --acc-line: color-mix(in srgb, var(--acc) 35%, transparent);",
    "  --body: var(--face-body), system-ui;",
    "}",
  ].join("\n");

  const tokens = rootTokens(css);
  assert.equal(tokens["--acc"], "#00E5FF");
  assert.equal(tokens["--acc-line"], undefined);
  assert.equal(tokens["--body"], undefined);
});

// A renamed token has to stop the build. The alternative is a transparent
// 1200x630 rectangle that renders over every network's own background and looks
// like a design choice.
void test("a token that is gone throws, and names itself", () => {
  assert.throws(
    () => requireTokens(":root { --bg: #0A0E14; }", ["--bg", "--gone"]),
    /--gone/,
  );
  assert.throws(() => rootTokens("body { color: red }"), /no :root block/);
});

// tokens.css is more comment than declaration, and the German contrast notes
// carry colons and semicolons that would otherwise be parsed as values.
void test("comments are removed before anything is read", () => {
  const css = ":root {\n  /* --bg: #FFFFFF; a comment, not a token */\n  --bg: #0A0E14;\n}";

  assert.ok(!stripCssComments(css).includes("a comment"));
  assert.deepEqual(rootTokens(css), { "--bg": "#0A0E14" });
});
