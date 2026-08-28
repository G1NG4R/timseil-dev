// CHR.01 EINSATZPLAN, transcribed from the Chrome sheet and used as the oracle.
//
// THE TABLE LIVES HERE RATHER THAN IN lib/chrome.ts, and that is the point. A
// table the implementation reads and the test then checks proves only that one
// object equals itself. This one was copied out of the sheet's own component
// state; lib/chrome.ts arrives at the same answers by splitting a path into
// segments, which is a different route to the same place — the property
// lib/scrub.test.ts paid for and lib/theme.test.ts repeats.
//
// The valuable cases are below the table: the prefix bug, the deliberate
// label/route split that looks like a typo, the unplanned route, and G5's
// locale prefix.

import assert from "node:assert/strict";
import test from "node:test";

import {
  type FooterVariant,
  type NavId,
  NAV,
  activeNav,
  footerVariant,
  stripLocale,
} from "./chrome.ts";

/** Sheet page → path → active entry → footer. `null` is the sheet's `—`. */
const PLAN: [string, string, NavId | null, FooterVariant][] = [
  ["Homepage", "/", null, "long"],
  ["Work Index", "/work", "work", "long"],
  ["Case Study 02", "/work/timseil-dev", "work", "short"],
  ["Case Study — Vorlage", "/work/some-other-system", "work", "short"],
  ["Blog Index", "/blog", "log", "long"],
  ["Blog Post", "/blog/001-zero-downtime-measured-not-claimed", "log", "long"],
  ["About", "/about", "about", "long"],
  ["Contact", "/contact", "contact", "short"],
  ["Legal · privacy", "/privacy", null, "short"],
  ["Legal · imprint", "/imprint", null, "short"],
];

void test("every page of CHR.01 gets the chrome the sheet assigns it", () => {
  for (const [page, path, active, variant] of PLAN) {
    assert.equal(activeNav(path), active, `${page} (${path}) — active entry`);
    assert.equal(footerVariant(path), variant, `${page} (${path}) — footer`);
  }
});

// THE BUG THIS FILE EXISTS FOR. `pathname.startsWith("/work")` satisfies all ten
// rows above and then lights up WORK on a route that has nothing to do with it.
// Nothing else in this phase catches it, because every planned path is also a
// legitimate prefix of itself.
void test("a path that merely begins like a route is not that route", () => {
  assert.equal(activeNav("/workshop"), null);
  assert.equal(activeNav("/blogging"), null);
  assert.equal(activeNav("/aboutus"), null);
  assert.equal(activeNav("/contacts"), null);

  assert.equal(footerVariant("/workshop"), "short");
  assert.equal(footerVariant("/aboutus"), "short");
});

// The acceptance criterion of the phase, in one line: "auf / nichts aktiv".
// Three of the eleven sheets got this wrong before the consistency pass — the
// homepage used to highlight WORK.
void test("nothing is active on the homepage", () => {
  assert.equal(activeNav("/"), null);
  assert.equal(footerVariant("/"), "long");
});

// K-20 CANNOT BE TIDIED AWAY. The label says LOG and the href says /blog, on
// purpose, and it looks exactly like a mistake someone would helpfully correct.
// Both directions of that correction fail here and land on this comment.
void test("LOG is the label and /blog is the route", () => {
  const log = NAV.find((entry) => entry.id === "log");
  assert.ok(log);
  assert.equal(log.label, "LOG");
  assert.equal(log.href, "/blog");

  // Widened to string on purpose. `as const` makes the literal types so narrow
  // that TypeScript rejects the comparison outright — which is a stronger
  // guarantee than this test, and also the reason the test would not compile
  // without the widening. Both survive the edit that matters: change the
  // literal and the type follows it, leaving only this assertion standing.
  const hrefs: string[] = NAV.map((entry) => entry.href);
  const labels: string[] = NAV.map((entry) => entry.label);

  assert.equal(
    hrefs.includes("/log"),
    false,
    "the route was renamed to match the label — it is in other people's bookmarks",
  );
  assert.equal(
    labels.includes("BLOG"),
    false,
    "the label was renamed to match the route — K-20 unified it to LOG",
  );
});

void test("the four entries are four, in the sheet's order", () => {
  assert.deepEqual(
    NAV.map((entry) => entry.label),
    ["WORK", "LOG", "ABOUT", "CONTACT"],
  );
});

// A route nobody planned still has to reach the imprint. Long would give it an
// unfinished contact block; short is the answer that stays correct.
void test("an unplanned route falls back to the short footer and no active entry", () => {
  assert.equal(footerVariant("/nothing-here"), "short");
  assert.equal(activeNav("/nothing-here"), null);
  assert.equal(footerVariant("/work/deep/deeper"), "short");
});

void test("a trailing slash is the same page", () => {
  assert.equal(activeNav("/work/"), "work");
  assert.equal(footerVariant("/work/"), "long");
  assert.equal(activeNav("/"), null);
});

// G5'S TRAP, PINNED ONE PHASE EARLY. Without stripLocale the German site has no
// active entry anywhere and every page gets the short footer — a whole-locale
// defect that no single-page check would show.
void test("a locale prefix does not hide the page behind it", () => {
  assert.equal(activeNav("/de/about"), "about");
  assert.equal(activeNav("/fr/work"), "work");
  assert.equal(footerVariant("/fr/"), "long");
  assert.equal(footerVariant("/de/blog/some-post"), "long");

  // The locale root is the homepage of that locale, not an unknown route.
  assert.equal(activeNav("/de"), null);
  assert.equal(footerVariant("/de"), "long");

  // And a path that only starts with the two letters keeps them.
  assert.equal(stripLocale("/design"), "/design");
  assert.equal(stripLocale("/french-toast"), "/french-toast");
  assert.equal(stripLocale("/de/about"), "/about");
  assert.equal(stripLocale("/de"), "/");
});
