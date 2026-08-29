// The broken case is the only interesting one here: an empty channel is a
// string, and a string cannot really fail. What can fail is the day H9 hands
// this renderer a title somebody wrote by hand.

import assert from "node:assert/strict";
import test from "node:test";

import { SITE_URL } from "../site.ts";
import { type FeedItem, escapeXml, renderFeed, rfc822 } from "./feed.ts";

const POST: FeedItem = {
  title: 'Zero-downtime & the "three seconds" <nobody> measured',
  link: `${SITE_URL}/blog/001-zero-downtime-measured-not-claimed`,
  description: "A & B < C",
  published: new Date("2026-08-23T09:04:05Z"),
};

// THE DEFECT THIS FILE EXISTS FOR. An ampersand in a title is not exotic — it
// is in the first sentence of half the posts already written. Unescaped, it
// produces a document strict parsers reject outright and lenient ones show
// wrongly, and the feed is exactly the surface where nobody is watching.
void test("a title with the five dangerous characters survives as text", () => {
  const xml = renderFeed([POST]);

  assert.ok(xml.includes("Zero-downtime &amp; the &quot;three seconds&quot;"));
  assert.ok(xml.includes("&lt;nobody&gt; measured"));
  assert.ok(xml.includes("<description>A &amp; B &lt; C</description>"));
  // The raw characters must not survive anywhere inside the item's text.
  assert.ok(!xml.includes("<nobody>"));
});

// Order, not just coverage: escaping `&` after `<` turns `&lt;` into
// `&amp;lt;` and the reader shows the entity instead of the character.
void test("an already-escaped-looking string is escaped once, not twice", () => {
  assert.equal(escapeXml("&lt;"), "&amp;lt;");
  assert.equal(escapeXml("a & b"), "a &amp; b");
  assert.equal(escapeXml("plain"), "plain");
});

// RSS 2.0 wants RFC 822 with a four-digit year, in GMT. A reader that cannot
// parse the date does not skip the date, it skips the item.
void test("the date is RFC 822 in GMT, zero-padded", () => {
  assert.equal(rfc822(new Date("2026-08-23T09:04:05Z")), "Sun, 23 Aug 2026 09:04:05 GMT");
  assert.equal(rfc822(new Date("2026-01-02T00:00:00Z")), "Fri, 02 Jan 2026 00:00:00 GMT");
  assert.equal(rfc822(new Date("2026-12-31T23:59:59Z")), "Thu, 31 Dec 2026 23:59:59 GMT");
});

// The state this phase ships. The three channel elements RSS 2.0 requires are
// there, the self link is absolute, and there is no item.
void test("the empty channel is a complete document", () => {
  const xml = renderFeed([]);

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(xml.includes("<title>"));
  assert.ok(xml.includes("<link>"));
  assert.ok(xml.includes("<description>"));
  assert.ok(xml.includes("<language>en</language>"));
  assert.ok(xml.includes(`href="${SITE_URL}/feed.xml" rel="self"`));
  assert.ok(!xml.includes("<item>"), "the feed claims posts that have no page yet");
  assert.ok(xml.trimEnd().endsWith("</rss>"));
});

// A feed is read on a machine that is not this one, where a relative path
// resolves against somebody else's host.
void test("every link the feed emits is absolute", () => {
  for (const line of renderFeed([POST]).split("\n")) {
    const href = /<(?:link|guid[^>]*)>([^<]+)</.exec(line)?.[1];
    if (href === undefined) continue;
    assert.ok(href.startsWith("https://"), `relative link in the feed: ${href}`);
  }
});

// No lastBuildDate, no generator timestamp: the only date in this document is
// one a person put on a post. Invariant 1, applied to a feed.
void test("the empty feed carries no date of its own", () => {
  const xml = renderFeed([]);
  assert.ok(!xml.includes("lastBuildDate"), "the build time is not a publication time");
  assert.ok(!xml.includes("pubDate"), "an empty channel has nothing to date");
});
