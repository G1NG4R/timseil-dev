// The RSS channel, and the reason it is empty.
//
// Six posts sit in `web/content/posts/` and nothing renders them: `/blog` is a
// `[SOON]` stub, and `/blog/<slug>` does not exist until H9 builds the MDX
// renderer. A feed with six items would therefore ship six `<link>` elements
// pointing at six 404s — a document whose whole job is to be read by a machine
// that follows links, handing it links that go nowhere. So the channel is real,
// valid and discoverable, and it carries no items yet.
//
// THE ITEM RENDERING IS BUILT ANYWAY, and that is not speculation. It is the
// only part of this file that can be wrong in a way nobody notices: an
// unescaped ampersand in a title produces a document that some readers parse
// and others reject, and the day H9 adds the first real title is the wrong day
// to find that out. The empty channel is the state; the renderer is the
// machine, and the machine is tested.
//
// ONE FEED, NOT THREE. The Language Switcher sheet decides it: "Die Blog-Posts
// bleiben einsprachig englisch — dort steht Fachliches, und Übersetzen wäre
// Arbeit ohne Leser."
//
// NO `lastBuildDate`. It would be the time this container was built, which is
// not the time anything was written. Invariant 1 applies to a feed exactly as
// it applies to a metric: a number nothing measured does not get published.

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
 * The whole document. `items` is empty until H9, and the channel is valid
 * without them — RSS 2.0 requires `title`, `link` and `description` on the
 * channel and nothing else.
 *
 * `<link>` points at `/blog` rather than the site root. That is the page this
 * channel corresponds to, it is already a route, and pointing it there now
 * means H9 has one less thing to remember.
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
