// No legal page carries a bracket.
//
// THE RULE HAS AN INCIDENT BEHIND IT, WHICH IS WHY IT EXISTS AT ALL. CLAUDE.md
// is explicit that a new check needs a failure somebody can name — "Keine neue
// Prüfregel ohne einen Fehler, der wirklich passiert ist" — and this is that
// failure, in full:
//
// H12b shipped `/privacy` with `[ADDRESS]` in 07.01 and
// `[OVH LEGAL ENTITY AND LOCATION]` in 07.06. Both were known, both were
// deliberate, and both were held by a test — an exact set of permitted
// brackets, so that the set could shrink on purpose and never grow by accident.
// It did exactly what it was asked to do. It was green when the merge button
// was pressed, and the merge put two unfilled facts on a public, indexable page
// about what happens to somebody else's data.
//
// THE DEFECT WAS IN THE QUESTION, NOT IN THE ANSWER. A test can only check the
// condition somebody writes down, and nobody had written down the one that
// mattered: not "is the set exactly right" but "is the set EMPTY BY NOW".
// A permitted-set test is the right tool while a page is being drafted and the
// wrong one at the moment it goes out, and nothing in this repository knew
// which of the two moments it was in.
//
// SO THE RULE IS THE BLUNTEST ONE AVAILABLE and it applies to both pages: a
// square bracket anywhere in the words of a legal page is a failure. It cannot
// be argued with by adding a line to a list, which is the whole point — the only
// way past it is to answer the question the bracket is standing in for.
//
// WHAT IT COSTS: this file is RED for as long as a legal page has an unfilled
// fact in it, which means the phase that writes one cannot be merged until the
// facts arrive. That is the intended cost and not a side effect. ADR 0077.
//
// AND NOT A NEW `make` TARGET. It rides in `npm test` → `make check-web` →
// `make check`, like retention.test.ts, so `selftest.sh` stays frozen and the
// list of twenty-two rules stays at twenty-two.

import assert from "node:assert/strict";
import test from "node:test";

import { imprintText, privacyText } from "./text.ts";

/** The two pages, by the address a reader reaches them at — so a failure names
 *  the page rather than a function. */
const PAGES: [string, () => string[]][] = [
  ["/privacy", privacyText],
  ["/imprint", imprintText],
];

void test("no legal page carries a bracket", () => {
  // BOTH PAGES ARE SWEPT BEFORE ANYTHING IS ASSERTED, so one run names every
  // fact that is still missing. Asserting per page stops at the first one and
  // hands back half a list — which, for a check whose whole job is to be the
  // thing somebody reads before a merge, is the difference between one round
  // trip and three.
  const open: string[] = [];
  for (const [route, words] of PAGES) {
    for (const text of words()) {
      for (const match of text.matchAll(/\[[^\]]*\]/g)) open.push(`${route} ${match[0]}`);
    }
  }
  assert.deepEqual(
    [...new Set(open)],
    [],
    "a legal page still stands in for a fact nobody has filled in — see ADR 0077",
  );
});

// AND THE SAME QUESTION ASKED OF THE OTHER HALF OF A PLACEHOLDER. A bracket is
// the shape this site happens to use; a page that says "TBD" or "to be added"
// is making the same admission in prose, and it would sail past the test above.
void test("no legal page says it is unfinished in words instead", () => {
  const unfinished = [/\bTBD\b/i, /\bto be added\b/i, /\bcoming soon\b/i, /\bSOON\b/, /\bTODO\b/i];
  for (const [route, words] of PAGES) {
    const joined = words().join("\n");
    for (const pattern of unfinished) {
      assert.doesNotMatch(joined, pattern, `${route}: a legal page does not owe a reader a later version`);
    }
  }
});
