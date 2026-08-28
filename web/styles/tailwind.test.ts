// The G1 acceptance criterion, mechanically: "`bg-blue-500` no longer works;
// lint forbids hex outside tokens.css." This file is the first half. The second
// half — a hex literal written by hand into a stylesheet or a component — is
// tools/check-tokens.sh, because no theme setting can stop `bg-[#ff0000]`.
//
// It compiles styles/tailwind.css the way the build does and asks what a set of
// candidate class names produces. Nothing is stubbed: the same `tailwindcss`
// package that the PostCSS plugin drives does the work.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compile } from "tailwindcss";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Compile tailwind.css and emit only what these candidates ask for. */
async function build(candidates: string[]): Promise<string> {
  const css = await readFile(path.join(here, "tailwind.css"), "utf8");
  const compiled = await compile(css, {
    base: here,
    // `@import "tailwindcss/theme.css"` and friends resolve against
    // node_modules; import.meta.resolve does that without a bundler in the loop.
    async loadStylesheet(id: string) {
      const resolved = fileURLToPath(import.meta.resolve(id));
      return {
        path: resolved,
        base: path.dirname(resolved),
        content: await readFile(resolved, "utf8"),
      };
    },
  });
  return compiled.build(candidates);
}

/** A candidate that resolves to nothing still yields the banner and the empty
 *  layer declarations — a rule is the first thing that brings a brace. */
function emitsARule(css: string): boolean {
  return css.includes("{");
}

void test("the default palette is gone", async () => {
  const css = await build(["bg-blue-500", "text-red-600", "border-gray-200"]);

  assert.equal(css.includes("blue"), false, "bg-blue-500 emitted a rule");
  assert.equal(css.includes("oklch"), false, "a shipped palette colour survived");
});

void test("tokens are the palette", async () => {
  const css = await build(["bg-bg", "text-acc", "border-line"]);

  // `@theme inline` is what puts the variable itself into the rule. If this
  // ever reads `#0a0e14`, the seven [data-theme] palettes have stopped working
  // for every utility on the site — switching the attribute would repaint
  // hand-written CSS and nothing else.
  assert.match(css, /var\(--bg\)/);
  assert.match(css, /var\(--acc\)/);
  assert.match(css, /var\(--line\)/);
  assert.equal(css.toLowerCase().includes("#0a0e14"), false, "a token was inlined by value");
});

void test("the families are the tokens, and the tokens are the faces", async () => {
  const css = await build(["font-display", "font-body", "font-mono"]);

  // Same argument as "tokens are the palette", one namespace over. If these
  // ever read `'Chakra Petch'` outright, the utilities have been frozen on the
  // literal stack — and G2's whole point is that tokens.css resolves the
  // family through var(--face-*), so a Next release that renames the generated
  // face keeps working. Utilities baked with the name would not.
  assert.match(css, /var\(--display\)/);
  assert.match(css, /var\(--body\)/);
  assert.match(css, /var\(--mono\)/);
  assert.equal(css.includes("Chakra Petch"), false, "a family name was inlined");
  assert.equal(css.includes("JetBrains Mono"), false, "a family name was inlined");
});

void test("the spacing scale is the 4px grid, not a generator", async () => {
  const good = await build(["p-26"]);
  assert.match(good, /var\(--s-26\)/);

  // 5 is not a step anyone drew. With Tailwind's dynamic scale on, `p-5` would
  // quietly produce 20px and look like a decision.
  const invented = await build(["p-5"]);
  assert.equal(emitsARule(invented), false, "p-5 invented a spacing step");
});

void test("radius and breakpoints are not utilities", async () => {
  const radius = await build(["rounded-lg"]);
  assert.equal(emitsARule(radius), false, "rounded-lg exists");

  // Responsive lives in layout.css, as four max-width switches. A `md:` here
  // would be a second set of numbers, and the first one to drift.
  const responsive = await build(["md:flex"]);
  assert.equal(emitsARule(responsive), false, "a default breakpoint survived");
});
