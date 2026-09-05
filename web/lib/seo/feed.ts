// The RSS channel, and it carries the log at last.
//
// IT WAS EMPTY FOR A REASON THAT EXPIRED, AND THE GAP IS WORTH RECORDING. This
// file used to say: "`/blog/<slug>` does not exist until H9 builds the MDX
// renderer. A feed with six items would therefore ship six `<link>` elements
// pointing at six 404s." That was invariant 5 in the machine-readable half of
// the site, and it was right. H9a built the renderer and every entry became a
// real address — so from that merge until this one, the sitemap listed
// twenty-odd entries and the feed listed none, and two machine-readable
// surfaces of one site disagreed about whether anything had been written.
// H9b closes it, because H9b is the phase that draws a `SUBSCRIBE` block.
//
// THE ITEM RENDERING WAS BUILT BEFORE THERE WAS ANYTHING TO RENDER, and this is
// the phase that collects on it. The argument then was that an unescaped
// ampersand in a title "produces a document that some readers parse and others
// reject, and the day H9 adds the first real title is the wrong day to find
// that out." Today is that day, and the escaping was already under test.
//
// ONE FEED, NOT THREE. The Language Switcher sheet decides it: "Die Blog-Posts
// bleiben einsprachig englisch — dort steht Fachliches, und Übersetzen wäre
// Arbeit ohne Leser."
//
// NO `lastBuildDate`. It would be the time this container was built, which is
// not the time anything was written. Invariant 1 applies to a feed exactly as
// it applies to a metric: a number nothing measured does not get published.

import { type PostMeta, postPath } from "../content/posts.ts";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../site.ts";

/** The path the feed answers on. It is in RESERVED (lib/i18n/routes.ts) so that
 *  it never gets a language segment, and in proxy.ts's matcher so that it never
 *  gets a request id. */
export const FEED_PATH = "/feed.xml";

export const FEED_CONTENT_TYPE = "application/rss+xml; charset=utf-8";

/** What the three surfaces beside this one already answer. Transcribed from
 *  what Next gives `robots.txt`, `sitemap.xml` and `og.png` — a route handler
 *  is not a metadata route, so without this it inherits `s-maxage=31536000`
 *  instead, which the G5 acceptance measured on production. */
export const FEED_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export interface FeedItem {
  readonly title: string;
  /** Absolute, and it has to be: a feed is read far away from the site it came
   *  from, where a relative path resolves against somebody else's host. */
  readonly link: string;
  readonly description: string;
  readonly published: Date;
}

/** The five characters that can end an element or an attribute early.
 *
 *  `&` FIRST, ALWAYS. Replace it last instead and the escapes the other four
 *  just wrote get escaped a second time: the `&` inside `&lt;` becomes
 *  `&amp;`, the reader shows the literal text `&lt;`, and the defect looks
 *  like a content problem rather than an ordering one. */
export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** RFC 822 with a four-digit year, which is what RSS 2.0 asks for.
 *
 *  Written out rather than taken from `toUTCString()` because that method's
 *  exact output is a host detail this file should not depend on, and because
 *  the day and month names must be English regardless of where the container
 *  runs — `toLocaleString` on a machine with another default locale would emit
 *  a date no reader parses. */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function rfc822(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = DAYS[date.getUTCDay()];
  const month = MONTHS[date.getUTCMonth()];
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return `${day}, ${pad(date.getUTCDate())} ${month} ${String(date.getUTCFullYear())} ${time} GMT`;
}

function renderItem(item: FeedItem): string {
  return [
    "    <item>",
    `      <title>${escapeXml(item.title)}</title>`,
    `      <link>${escapeXml(item.link)}</link>`,
    // The link doubles as the identity. `isPermaLink="true"` is the default and
    // is written out anyway: a reader that guesses wrong shows every post twice
    // after the first time a URL changes.
    `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
    `      <pubDate>${rfc822(item.published)}</pubDate>`,
    `      <description>${escapeXml(item.description)}</description>`,
    "    </item>",
  ].join("\n");
}

/**
 * Every entry, as feed items — newest first, because `readPosts` already is.
 *
 * `summary` AND NOT `deck`, and lib/content/posts.ts named this reader when it
 * decided the difference: the deck is "one line above the fold" that the
 * homepage and the index draw, and the summary is "the only text about a post
 * that leaves this site". A `<description>` is exactly that — the paragraph a
 * stranger reads in an application that is not this one.
 *
 * THE LINK IS THE ENGLISH ADDRESS, WITH NO LANGUAGE SEGMENT. There is one feed
 * and not three, which the Language Switcher sheet decided: "Die Blog-Posts
 * bleiben einsprachig englisch — dort steht Fachliches, und Übersetzen wäre
 * Arbeit ohne Leser." `localeHref("en", …)` adds no prefix, so `postPath` is
 * already the address, and prefixing it per language would give three feeds one
 * identity.
 *
 * THE DATE IS BUILT AT UTC MIDNIGHT AND NOT PARSED LOOSELY. `published` is
 * `YYYY-MM-DD`, and `new Date("2026-09-05")` is already UTC midnight by
 * specification while `new Date("2026/09/05")` is local — the `T00:00:00Z` is
 * written out so the value cannot depend on the container's timezone. This is
 * the only place in the repository that turns a `published` string into a
 * `Date`; lib/content/posts.ts keeps it as text everywhere else precisely
 * because nothing there does arithmetic on it.
 */
export function feedItems(posts: readonly PostMeta[]): readonly FeedItem[] {
  return posts.map((post) => ({
    title: post.title,
    link: `${SITE_URL}${postPath(post)}`,
    description: post.summary,
    published: new Date(`${post.published}T00:00:00Z`),
  }));
}

/**
 * The whole document. The channel is valid with no items at all — RSS 2.0
 * requires `title`, `link` and `description` on the channel and nothing else —
 * and that is still the shape it takes if the directory cannot be read.
 *
 * `<link>` points at `/blog` rather than the site root. That is the page this
 * channel corresponds to, and as of H9b that page is the index rather than a
 * stub.
 */
export function renderFeed(items: readonly FeedItem[]): string {
  const self = `${SITE_URL}${FEED_PATH}`;

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(SITE_NAME)}</title>`,
    `    <link>${SITE_URL}/blog</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${self}" rel="self" type="application/rss+xml" />`,
    ...items.map(renderItem),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
