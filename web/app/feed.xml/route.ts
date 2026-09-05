// The feed, served. Everything that can be wrong is in lib/seo/feed.ts, where
// `node --test` reaches it; this file is the content type and one call.
//
// A DIRECTORY CALLED `feed.xml`, WHICH LOOKS ODD AND IS THE POINT. The route
// has to answer at `/feed.xml` — that is the address in every page's <head>, in
// RESERVED, and in the proxy matcher — and in the App Router a segment is a
// directory. The dot in the name is what keeps this out of `app/[lang]/`, where
// the canonical redirect would reach it.
//
// NO `connection()`, unlike app/healthz/route.ts. That route needs a request
// because its answer changes with one — a readiness probe answered from a
// prerender is a file on disk saying "ready" after the process stopped being
// ready. This one has no such property: the document is the same for every
// visitor and for every second of the container's life, so being answered
// without a request having arrived is exactly right. Under Cache Components
// that means it is part of the static shell, which is where it belongs.
//
// AND THAT IS STILL TRUE NOW THAT IT HAS ITEMS. A new entry is a new image, so
// the document cannot change while this process lives — the same property that
// lets lib/content/posts.ts read the directory with no cache profile at all.
//
// THE `Cache-Control` IS SET HERE BECAUSE NOT SETTING IT DOES NOT MEAN NONE.
// This comment used to say the opposite — that no policy is invented, because
// without a CDN (ADR 0006) an `s-maxage` addresses a machine that does not
// exist. The served bytes disagreed with it: Next gives a prerendered route
// handler `s-maxage=31536000` of its own, and the G5 acceptance found it on
// production. A year, on a document that now changes with every post.
//
// The value is derived rather than chosen, which is ADR 0045's rule for a cache
// window. `robots.txt`, `sitemap.xml` and `og.png` — the three surfaces beside
// this one, doing the same job for the same readers — all answer
// `public, max-age=0, must-revalidate`, because Next treats a metadata route
// differently from a handler somebody wrote. So this one says what they say.
// Four files, one answer, and no year that nobody wrote.

import { postsOrNull } from "@/lib/content/posts";
import { FEED_CACHE_CONTROL, FEED_CONTENT_TYPE, feedItems, renderFeed } from "@/lib/seo/feed";

export function GET(): Response {
  // A DIRECTORY THAT COULD NOT BE READ STILL SERVES A CHANNEL, and it serves an
  // empty one rather than a 500. RSS 2.0 needs nothing but the channel's three
  // fields, and a feed reader that gets a valid document with no items shows a
  // quiet feed; one that gets an error shows the visitor a failure and keeps
  // showing it once per poll. The same read failing on the page is what
  // `— NO DATA` is for — that surface has a person in front of it to tell.
  const read = postsOrNull();

  return new Response(renderFeed(feedItems(read?.posts ?? [])), {
    headers: {
      "content-type": FEED_CONTENT_TYPE,
      "cache-control": FEED_CACHE_CONTROL,
    },
  });
}
