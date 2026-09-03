// The broken case first: a route nobody decided about.
//
// The defect this file guards is quiet. Every function here returns an object,
// and an object with a field missing looks exactly like an object with the
// field set to the harmless value — a page that forgot `noindex` is a page
// Google indexes, and nothing in the build says so.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { NAV } from "../chrome.ts";
import { LOCALES } from "../i18n/routes.ts";
import { SITE_DESCRIPTION, SITE_NAME } from "../site.ts";
import { CASE_STUDIES, caseStudyPath } from "../../content/case-studies/index.ts";
import { PAGES, indexablePaths, seoFor } from "./pages.ts";

// A page added to `app/[lang]/` without a line in PAGES has not been decided
// about, and the harmless-looking default is the wrong one: it would be
// indexable. The throw is the whole point of the table.
void test("a path the table does not know throws instead of guessing", () => {
  assert.throws(() => seoFor("en", "/shop"), /no page entry/);
  assert.throws(() => seoFor("en", "/about/"), /no page entry/);
});

// The four routes that say something today. It was one until H1, two until H6,
// three when `/work` itself stopped being a [SOON] stub in that same phase, and
// four since H7 filled `/about`. The other four stay out until the phase named
// beside each fills them.
//
// THE ORDER IS THE TABLE'S AND NOT ALPHABETICAL: `/about` sits where README's
// route table puts it, after `/blog`, so this list reads the way the file does.
// THIS TEST IS SUPPOSED TO GO RED WHEN A PHASE DOES ITS WORK, and it has four
// times now: H1 for the case study, H6 for `/work`, H7 for `/about`, H8 for
// `/contact`. The list is the point — a page that starts being indexed without
// anybody writing the line here is a page that started being indexed by
// accident.
void test("the homepage, the work index, about, contact and the case studies are indexable, and nothing else", () => {
  assert.deepEqual(indexablePaths(), ["/", "/work", "/about", "/contact", "/work/timseil-dev"]);
  assert.equal(seoFor("en", "/").robots, undefined);
  assert.equal(seoFor("en", "/work/timseil-dev").robots, undefined);
  assert.equal(seoFor("en", "/work").robots, undefined);
  assert.equal(seoFor("en", "/about").robots, undefined);
  assert.equal(seoFor("en", "/contact").robots, undefined);
  // And the three that are still stubs still refuse. `/privacy` is the one that
  // matters most right now: H8 put a form on this site, and the page that will
  // explain it says `[SOON]` until H12.
  assert.deepEqual(seoFor("en", "/privacy").robots, { index: false });
});

// The drift this table was restructured to make impossible: a case study that
// renders at an address the SEO table has never heard of. `entryFor` throws for
// an unknown path, so the failure would be a 500 on the page rather than a
// missing sitemap line — loud, but only for whoever visits it first.
void test("every case study has a row, and every row says it may be indexed", () => {
  const known = new Map(PAGES.map((page) => [page.path, page.indexable]));
  for (const study of CASE_STUDIES) {
    const path = caseStudyPath(study);
    assert.ok(known.has(path), `no page entry for ${path}`);
    assert.equal(known.get(path), true, `${path} is written but not indexable`);
    assert.doesNotThrow(() => seoFor("en", path));
  }
});

// The drift that would be invisible from inside web/: a case study written for a
// system the api has never heard of. The page would 404 at the api, render its
// empty form, and the sitemap would go on advertising it — nothing red anywhere.
// seed.sql is the curated list of systems, so it is the file to hold this
// against; reading across the boundary is the same move og/tokens.ts makes when
// it parses tokens.css rather than keeping a copy.
void test("every case study names a system the seed actually creates", () => {
  const seed = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "api", "internal", "seed", "seed.sql"),
    "utf8",
  );
  for (const study of CASE_STUDIES) {
    assert.match(seed, new RegExp(`\\('${study.slug}',`), `seed.sql has no system ${study.slug}`);
  }
});

// The slug travels into a URL, so it is held against the contract's own shape
// rather than trusted. A capital letter or a dot here would be a 404 from the
// api and a page nobody could reach — and the sitemap would still list it.
void test("a case study slug is a slug the api can be asked about", () => {
  for (const study of CASE_STUDIES) {
    assert.match(study.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, study.slug);
    assert.match(study.updatedAt, /^\d{4}-\d{2}-\d{2}$/, `${study.slug} has no real date`);
    assert.ok(!Number.isNaN(Date.parse(study.updatedAt)), `${study.slug}: ${study.updatedAt}`);
  }
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
