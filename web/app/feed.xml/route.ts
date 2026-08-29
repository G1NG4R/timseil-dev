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
// THE `Cache-Control` IS SET HERE BECAUSE NOT SETTING IT DOES NOT MEAN NONE.
// This comment used to say the opposite — that no policy is invented, because
// without a CDN (ADR 0006) an `s-maxage` addresses a machine that does not
// exist. The served bytes disagreed with it: Next gives a prerendered route
// handler `s-maxage=31536000` of its own, and the G5 acceptance found it on
// production. A year, on a document H9 starts changing with every post.
//
// The value is derived rather than chosen, which is ADR 0045's rule for a cache
// window. `robots.txt`, `sitemap.xml` and `og.png` — the three surfaces beside
// this one, doing the same job for the same readers — all answer
// `public, max-age=0, must-revalidate`, because Next treats a metadata route
// differently from a handler somebody wrote. So this one says what they say.
// Four files, one answer, and no year that nobody wrote.

import { FEED_CACHE_CONTROL, FEED_CONTENT_TYPE, renderFeed } from "@/lib/seo/feed";

export function GET(): Response {
  // Empty until H9. The six posts in web/content/posts/ have no route yet, and
  // an item whose <link> is a 404 is worse than an item that is absent — a feed
  // reader remembers the entry and shows the failure to a person once per poll.
  return new Response(renderFeed([]), {
    headers: {
      "content-type": FEED_CONTENT_TYPE,
      "cache-control": FEED_CACHE_CONTROL,
    },
  });
}
