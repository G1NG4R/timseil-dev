// `/blog` — the log, and the third page on this site a reader can do something
// to rather than only read.
//
// THE STUB THAT STOOD HERE IS GONE. It shipped in G3 so that the chrome could
// prove three things a 404 cannot show — the active entry is white, nothing is
// active on `/`, and the footer comes in two versions — and its own comment said
// what this phase does with it: "H9 REPLACES this file. Nothing here is a
// decision about the page."
//
// NO SUSPENSE AND NO `*Live` TWIN, which makes this the second page on this site
// after `/about` that arrives whole. There is nothing to wait for: the entries
// are files in this image, and lib/content/posts.ts explains why no `use cache`
// profile is derived for reading them. The whole page is part of the static
// shell, and the one interactive thing on it is an island of its own.
//
// THE POSTS ARE READ ONCE HERE AND THE FILES A SECOND TIME BELOW. `postsOrNull`
// gives the frontmatter of every entry; components/blog/BlogList.tsx re-opens
// each file to count its minutes, because `PostMeta` deliberately holds no word
// count. That is twenty-odd small reads in a prerender, and the argument for
// paying them is in BlogList's head.
//
// AND THE PAGE IS INDEXABLE AS OF THIS PHASE. lib/seo/pages.ts held `/blog` at
// `indexable: false` while it said `LOG [SOON]`, because a crawler that read
// that would file it away as what this site has to say on the subject. It has
// twenty-three things to say now, and app/sitemap.ts picks the page up out of
// the same boolean with no edit of its own.

import type { Metadata } from "next";

import { BlogList } from "@/components/blog/BlogList";
import { BlogSubscribe } from "@/components/blog/BlogSubscribe";
import { JsonLd } from "@/components/JsonLd";
import { caseStudyFor, caseStudyPath } from "@/content/case-studies";
import { postPath, postsOrNull } from "@/lib/content/posts";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { FEED_PATH } from "@/lib/seo/feed";
import { collectionLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { SITE_SYSTEM_SLUG } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/blog">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/blog");
}

export default async function Page() {
  const { locale, messages } = await getDictionary();
  const read = postsOrNull();

  // The study this log points at, asked of the gate in front of /work/[slug] —
  // the same question the route asks, so `null` here is a head with no link
  // rather than a link to a 404. components/home/Log.tsx asks it the same way.
  const study = caseStudyFor(SITE_SYSTEM_SLUG);
  const feedHref = FEED_PATH;

  return (
    <>
      {/* #322, and the second half of it is on `/work`. A list that describes
          itself does so through one builder, so the two cannot come out
          differently. It is drawn only when there is a list: an `ItemList` with
          `numberOfItems: 0` over a directory that could not be read would be a
          machine-readable claim that this site has written nothing. */}
      {read === null || read.posts.length === 0 ? null : (
        <JsonLd
          data={collectionLd(
            locale,
            localeHref(locale, "/blog"),
            messages.blogIndexTitle,
            read.posts.map((post) => ({
              name: post.title,
              path: localeHref(locale, postPath(post)),
            })),
          )}
        />
      )}

      <BlogList
        read={read}
        locale={locale}
        feedHref={feedHref}
        caseStudyHref={study === null ? null : localeHref(locale, caseStudyPath(study))}
        exit={{ href: localeHref(locale, "/work"), label: messages.blogViewSystems }}
        messages={messages}
      />

      <BlogSubscribe feedHref={feedHref} messages={messages} />
    </>
  );
}
