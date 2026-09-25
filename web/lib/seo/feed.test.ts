// The broken case is the only interesting one here: an empty channel is a
// string, and a string cannot really fail. What can fail is a title somebody
// wrote by hand — and as of H9b this renderer is handed twenty-odd of them.

import assert from "node:assert/strict";
import test from "node:test";

import { SITE_URL } from "../site.ts";
import type { PostMeta } from "../content/posts.ts";
import { type FeedItem, escapeXml, feedItems, renderFeed, rfc822 } from "./feed.ts";

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

// ── H9b · the channel is filled ─────────────────────────────────────────────

// The broken case, and it is the one the whole phase turns on: a directory that
// could not be read must still produce a document a reader can parse, because a
// feed reader shows an error to a person once per poll and a quiet feed not at
// all.
void test("a log that could not be read still renders a valid channel", () => {
  const xml = renderFeed(feedItems([]));
  assert.ok(xml.includes("<channel>") && xml.includes("</channel>"));
  assert.ok(!xml.includes("<item>"), "no items, and no empty item either");
});

// ENTRIES THIS FILE WRITES. Four tests below read the first post out of
// web/content/posts/ until U2 emptied it (ADR 0079) — `readPosts(POSTS_DIR).posts`
// destructured to `undefined`, which is a crash rather than a failure. An entry
// built here says the same things and says them about chosen values: a summary
// that is not the dek, and markup in both.
const ENTRY: PostMeta = {
  slug: "001-a-slug",
  title: 'Zero-downtime & the "three seconds" <nobody> measured',
  deck: "One line above the fold.",
  published: "2026-09-05",
  systemId: "timseil-dev",
  tags: ["ci-cd"],
  summary: "Two sentences a stranger reads in a reader. A & B < C.",
  updated: null,
};

void test("an entry becomes an item with the summary as its description", () => {
  const [item] = feedItems([ENTRY]);

  // NOT the deck. lib/content/posts.ts names this reader when it draws the
  // line: the summary is "the only text about a post that leaves this site".
  assert.equal(item.description, ENTRY.summary);
  assert.notEqual(item.description, ENTRY.deck);
  assert.equal(item.title, ENTRY.title);
});

void test("the item link is the English address, with no language segment", () => {
  const [item] = feedItems([ENTRY]);
  // One feed, not three. A `/de` prefix here would give three feeds one identity.
  assert.equal(item.link, `${SITE_URL}/blog/${ENTRY.slug}`);
  assert.ok(!item.link.includes("/de/") && !item.link.includes("/fr/"));
});

void test("a published date becomes UTC midnight, whatever the container's timezone", () => {
  const [item] = feedItems([{ ...ENTRY, published: "2026-09-05" }]);
  assert.equal(item.published.toISOString(), "2026-09-05T00:00:00.000Z");
});

// THE SWEEP OVER THE CORPUS IS GONE AND ITS ASSERTION IS NOT. It used to render
// every file in web/content/posts/ and then refuse to be vacuous — "a repository
// with no entries would make this vacuous" is the line it carried — which is
// exactly the state U2 puts this repository in. So the document is rendered over
// entries written here, and the scan for a raw `&`, `<` or `>` runs over a title
// and a summary that both carry all three.
void test("every entry it is handed survives the renderer", () => {
  const posts = [ENTRY, { ...ENTRY, slug: "002-b-slug", published: "2026-09-01" }];
  const xml = renderFeed(feedItems(posts));

  assert.equal(xml.split("<item>").length - 1, posts.length);
  assert.ok(posts.length > 0, "a feed over no entries would make this vacuous");

  const inner = xml.replaceAll(/&(?:amp|lt|gt|quot|apos);/g, "");
  for (const line of inner.split("\n")) {
    const value = /<(?:title|description)>(.*)<\/(?:title|description)>/.exec(line)?.[1];
    if (value === undefined) continue;
    assert.ok(!/[&<>]/.test(value), `unescaped markup in the feed: ${line}`);
  }
});

void test("the newest entry is the first item", () => {
  // `feedItems` preserves the order it is given, and `readPosts` gives newest
  // first — so this is about the renderer keeping its hands off the order.
  const posts = [ENTRY, { ...ENTRY, slug: "002-b-slug", title: "Older", published: "2025-01-01" }];
  const items = feedItems(posts);
  assert.equal(items[0].title, posts[0].title);
});
