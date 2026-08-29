// The broken case first: a route nobody decided about.
//
// The defect this file guards is quiet. Every function here returns an object,
// and an object with a field missing looks exactly like an object with the
// field set to the harmless value — a page that forgot `noindex` is a page
// Google indexes, and nothing in the build says so.

import assert from "node:assert/strict";
import test from "node:test";

import { NAV } from "../chrome.ts";
import { LOCALES } from "../i18n/routes.ts";
import { SITE_DESCRIPTION, SITE_NAME } from "../site.ts";
import { PAGES, indexablePaths, seoFor } from "./pages.ts";

// A page added to `app/[lang]/` without a line in PAGES has not been decided
// about, and the harmless-looking default is the wrong one: it would be
// indexable. The throw is the whole point of the table.
void test("a path the table does not know throws instead of guessing", () => {
  assert.throws(() => seoFor("en", "/shop"), /no page entry/);
  assert.throws(() => seoFor("en", "/about/"), /no page entry/);
});

// The one route that says something today. The build plan's acceptance for this
// phase is the Rich Results test, and this is the address it reads.
void test("only the homepage is indexable today", () => {
  assert.deepEqual(indexablePaths(), ["/"]);
  assert.equal(seoFor("en", "/").robots, undefined);
});

void test("every stub refuses indexing, and says so in the metadata", () => {
  for (const { path, indexable } of PAGES) {
    if (indexable) continue;
    assert.deepEqual(seoFor("en", path).robots, { index: false }, path);
  }
});

// THE MERGE TRAP, AS A TEST. Next replaces `alternates` wholesale when a page
// sets it, so the feed link has to travel with the canonical rather than sit in
// the layout. If someone moves it back, six routes lose their feed link and the
// page still renders.
void test("the feed link rides along with the canonical, on every page", () => {
  for (const { path } of PAGES) {
    for (const locale of LOCALES) {
      const alternates = seoFor(locale, path).alternates;
      assert.ok(alternates, `${locale} ${path} has no alternates at all`);
      assert.ok(alternates.types, `${locale} ${path} announces no feed`);
      assert.ok(alternates.languages, `${locale} ${path} has no hreflang set`);

      assert.equal(alternates.types["application/rss+xml"], "/feed.xml", path);
      assert.ok(alternates.canonical, `${locale} ${path} has no canonical`);
      assert.ok(alternates.languages["x-default"], `${locale} ${path} has no x-default`);
    }
  }
});

// The canonical is the address the visitor typed, not the internal tree.
// `/en/about` is not an address — proxy.ts answers it with a 308 — so it must
// not appear in a canonical, an hreflang or an og:url.
void test("no metadata ever names the internal /en tree", () => {
  for (const { path } of PAGES) {
    for (const locale of LOCALES) {
      const meta = seoFor(locale, path);
      const seen = JSON.stringify(meta);
      assert.ok(!seen.includes('"/en'), `${locale} ${path} names /en somewhere`);
    }
  }
});

void test("the og url follows the language, and English keeps no prefix", () => {
  assert.equal(seoFor("en", "/about").openGraph?.url, "/about");
  assert.equal(seoFor("de", "/about").openGraph?.url, "/de/about");
  assert.equal(seoFor("fr", "/").openGraph?.url, "/fr");
});

// The social card has to exist on every route, because the one that gets shared
// is never the one you tested. The dimensions are asserted rather than assumed:
// a card without them is re-cropped by every network to its own taste.
//
// The alt text is transcribed here, not imported from pages.ts — the same rule
// chrome.test.ts states: a table the implementation reads is not an oracle, it
// is a second copy of the answer.
void test("every page carries a social image with its dimensions and an alt", () => {
  const expected = [
    {
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: `${SITE_NAME} \u2014 ${SITE_DESCRIPTION}`,
    },
  ];
  for (const { path } of PAGES) {
    assert.deepEqual(seoFor("en", path).openGraph?.images, expected, path);
  }
});

// The two tables are separate files and must not drift: a nav entry pointing at
// a route with no metadata decision is a link into an undecided page.
void test("every nav target is a page this table knows", () => {
  const known = new Set(PAGES.map((page) => page.path));
  for (const { href } of NAV) assert.ok(known.has(href), `NAV points at ${href}`);
});
