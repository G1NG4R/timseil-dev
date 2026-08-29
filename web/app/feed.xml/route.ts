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
// NO `Cache-Control` EITHER. There is no CDN in front of this origin (ADR
// 0006), so an `s-maxage` would be a directive addressed to a machine that does
// not exist. Next serves the prerendered bytes; inventing a caching policy for
// a reader nobody has measured would be the same mistake in a different unit.

import { FEED_CONTENT_TYPE, renderFeed } from "@/lib/seo/feed";

export function GET(): Response {
  // Empty until H9. The six posts in web/content/posts/ have no route yet, and
  // an item whose <link> is a 404 is worse than an item that is absent — a feed
  // reader remembers the entry and shows the failure to a person once per poll.
  return new Response(renderFeed([]), {
    headers: { "content-type": FEED_CONTENT_TYPE },
  });
}
