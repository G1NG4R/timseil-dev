// The asymmetry is the whole test file: English has no prefix, so every
// function here has one branch that is easy to get right for `/de` and wrong
// for `/`. Each block below names the defect it is guarding, because a table of
// green assertions teaches nobody what would have broken.

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LOCALE,
  LOCALES,
  canonicalRedirect,
  isLocale,
  localeHref,
  localeOf,
  rewriteTarget,
  stripLocale,
  switchLocale,
} from "./routes.ts";

void test("the sheet's table, in the sheet's order", () => {
  assert.deepEqual([...LOCALES], ["en", "de", "fr"]);
  assert.equal(DEFAULT_LOCALE, "en");
});

// THE BUG THIS FILE EXISTS FOR. A prefix comparison satisfies every route in
// the plan and also claims `/design` for German and `/french-toast` for French
// — a whole-locale defect that renders a real page in the wrong language and
// tells a search engine so in `<html lang>`.
void test("a language is a whole segment, never a prefix", () => {
  assert.equal(localeOf("/design"), "en");
  assert.equal(localeOf("/french-toast"), "en");
  assert.equal(stripLocale("/design"), "/design");
  assert.equal(stripLocale("/french-toast"), "/french-toast");

  assert.equal(localeOf("/de/about"), "de");
  assert.equal(localeOf("/de"), "de");
  assert.equal(stripLocale("/de/about"), "/about");
  assert.equal(stripLocale("/de"), "/");
});

void test("an unknown language is English, not a fourth language", () => {
  assert.equal(isLocale("es"), false);
  assert.equal(localeOf("/es/about"), "en");
  // …and because it is not stripped, the page under it is `/es/about`, which
  // no route matches. A 404 is the honest answer; silently serving the English
  // homepage at a Spanish address would be the dishonest one.
  assert.equal(stripLocale("/es/about"), "/es/about");
});

// The one branch that separates this site from every tutorial: the default
// locale carries NO prefix. `/en/work` is not an address here.
void test("English carries no prefix", () => {
  assert.equal(localeHref("en", "/work"), "/work");
  assert.equal(localeHref("en", "/"), "/");
  assert.equal(localeHref("de", "/work"), "/de/work");
  assert.equal(localeHref("de", "/"), "/de");
  assert.equal(localeHref("fr", "/blog/some-post"), "/fr/blog/some-post");
});

void test("switching keeps the page and changes only the language", () => {
  assert.equal(switchLocale("/de/about", "fr"), "/fr/about");
  assert.equal(switchLocale("/de/about", "en"), "/about");
  assert.equal(switchLocale("/about", "de"), "/de/about");
  assert.equal(switchLocale("/", "fr"), "/fr");
  assert.equal(switchLocale("/fr", "en"), "/");

  // Switching to the language you are already in is a no-op, not a trip
  // through the default.
  assert.equal(switchLocale("/de/work", "de"), "/de/work");
});

void test("the rewrite fills in the language the address does not say", () => {
  assert.equal(rewriteTarget("/"), "/en");
  assert.equal(rewriteTarget("/about"), "/en/about");
  assert.equal(rewriteTarget("/blog/some-post"), "/en/blog/some-post");
});

void test("the rewrite leaves a prefixed address alone", () => {
  assert.equal(rewriteTarget("/de"), null);
  assert.equal(rewriteTarget("/de/about"), null);
  assert.equal(rewriteTarget("/fr/work"), null);
});

// THE SILENT ONE. `/en/_next/...` still renders a page, so nothing looks
// broken — the RSC payloads and the dev server's HMR channel just stop
// arriving. Same for the four files G5b adds: a rewritten `/en/robots.txt` is
// a 404 that a crawler reads as "no rules".
void test("infrastructure paths are never given a language", () => {
  assert.equal(rewriteTarget("/_next/rsc-payload"), null);
  assert.equal(rewriteTarget("/healthz"), null);
  assert.equal(rewriteTarget("/api/health"), null);
  assert.equal(rewriteTarget("/favicon.svg"), null);
  assert.equal(rewriteTarget("/robots.txt"), null);
  assert.equal(rewriteTarget("/sitemap.xml"), null);
  assert.equal(rewriteTarget("/feed.xml"), null);
  assert.equal(rewriteTarget("/og.png"), null);
});

// Two addresses for one page is the duplicate-content case the `hreflang`
// block exists to prevent. Declaring a canonical language set and then serving
// a second copy of half of it would be the same claim, made twice, differently.
void test("the internal English address is redirected, never served", () => {
  assert.equal(canonicalRedirect("/en"), "/");
  assert.equal(canonicalRedirect("/en/about"), "/about");
  assert.equal(canonicalRedirect("/en/blog/some-post"), "/blog/some-post");
});

void test("no other address is redirected", () => {
  assert.equal(canonicalRedirect("/"), null);
  assert.equal(canonicalRedirect("/about"), null);
  assert.equal(canonicalRedirect("/de"), null);
  assert.equal(canonicalRedirect("/de/about"), null);
  // And the prefix trap once more, from the redirect's side: `/english` is a
  // page name, not the language segment.
  assert.equal(canonicalRedirect("/english"), null);
});

// A rewritten address must not then be redirected back, or the two functions
// bounce a request between them until the browser gives up.
void test("the rewrite target is never itself a redirect the visitor sees", () => {
  for (const path of ["/", "/about", "/blog/some-post"]) {
    const target = rewriteTarget(path);
    assert.notEqual(target, null);
    // The redirect is decided on the address the VISITOR sent, which is `path`
    // and never `target` — proven here by asking the visitor's address.
    assert.equal(canonicalRedirect(path), null);
  }
});
