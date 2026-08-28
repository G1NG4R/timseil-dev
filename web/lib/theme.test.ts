// The G2 acceptance, mechanically, for the half a machine can hold: the script
// that runs before the first paint does what it says and nothing else.
//
// IT RUNS THE ACTUAL STRING. `node:vm` executes THEME_SNIPPET — the same text
// that reaches the browser, character for character — against a stubbed
// `localStorage` and a stubbed `document`. A test that re-implemented the logic
// in TypeScript would only prove that two people agree, and lib/scrub.test.ts
// already paid for that lesson: the oracle has to be something other than the
// implementation.
//
// No DOM library and no new dependency for this. The snippet touches exactly
// two globals, and two globals are cheaper to fake than to install.

import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { THEME_IDS, THEME_KEY, THEME_SNIPPET, isThemeId } from "./theme.ts";

interface Element {
  dataset: { theme?: string };
}

/**
 * Runs the snippet with one stored value and reports what it left on the html
 * element. `undefined` means "wrote nothing", which is the Terminal Noir state.
 */
function run(stored: string | null): string | undefined {
  const documentElement: Element = { dataset: {} };
  runInNewContext(THEME_SNIPPET, {
    localStorage: { getItem: (): string | null => stored },
    document: { documentElement },
  });
  return documentElement.dataset.theme;
}

void test("isThemeId turns down everything that is not one of the six", () => {
  for (const id of THEME_IDS) assert.equal(isThemeId(id), true, id);

  // 'noir' is the interesting one: it reads like a theme and is not. Terminal
  // Noir is the absence of the attribute, so an id for it would be a second way
  // to say the same thing — and the two would drift.
  for (const value of ["noir", "", "dark", "light", "MOCHA", "<script>", null, 7, undefined]) {
    assert.equal(isThemeId(value), false, JSON.stringify(value));
  }
});

void test("the snippet applies every palette, and only those", () => {
  for (const id of THEME_IDS) {
    assert.equal(run(id), id, `${id} did not reach data-theme`);
  }

  // The whitelist inside the snippet is built from THEME_IDS rather than typed
  // out beside it. This is the assertion that the two cannot separate: a
  // seventh palette added to the list would fail here if the snippet did not
  // learn about it, and no hand-written regex can make that promise.
  for (const id of THEME_IDS) {
    assert.ok(THEME_SNIPPET.includes(id), `${id} is missing from the snippet`);
  }
});

void test("a value the visitor invented reaches nothing", () => {
  // Harmless today — an unknown data-theme matches no selector. It is checked
  // because the value comes out of the visitor's own storage, and "harmless
  // today" is a property of the stylesheet, not of the script.
  for (const value of ["noir", "", "gruvbox; ", "../../etc", "<script>alert(1)</script>", null]) {
    assert.equal(run(value), undefined, JSON.stringify(value));
  }
});

void test("the snippet reads one storage key and no other", () => {
  assert.ok(THEME_SNIPPET.includes(THEME_KEY));

  // Invariant 9 says exactly two keys exist on the whole site. This one is the
  // first; ts404.best arrives in H10. Anything else here would be a third.
  const keys = [...THEME_SNIPPET.matchAll(/localStorage\.\w+\((["'])(.*?)\1\)/g)];
  assert.deepEqual(
    keys.map((match) => match[2]),
    [THEME_KEY],
  );
});

void test("blocked storage costs the theme, not the page", () => {
  // Safari in private mode throws on the getter itself. This runs before React
  // exists, so an escaping throw is a page that renders with no theme and no
  // error anyone can see.
  const documentElement: Element = { dataset: {} };
  assert.doesNotThrow(() => {
    runInNewContext(THEME_SNIPPET, {
      localStorage: {
        getItem: (): string => {
          throw new Error("SecurityError");
        },
      },
      document: { documentElement },
    });
  });
  assert.equal(documentElement.dataset.theme, undefined);
});
