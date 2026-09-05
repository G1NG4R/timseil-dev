import Link from "next/link";

import { BlogFilters, type FilterRowNode, type YearNode } from "@/components/blog/BlogFilters";
import { BlogHeader } from "@/components/blog/BlogHeader";
import { PostCard } from "@/components/blog/PostCard";
import { EmptyState } from "@/components/state/EmptyState";
import { blogEntries, blogLatest } from "@/lib/blog/counts";
import { byYear, latestPublished } from "@/lib/blog/entries";
import { haystack } from "@/lib/blog/filter";
import { tagChips } from "@/lib/blog/tags";
import type { PostMeta, PostRead } from "@/lib/content/posts";
import { postPath, postSource } from "@/lib/content/posts";
import { minutesLabel, readingSize } from "@/lib/content/words";
import type { Locale } from "@/lib/i18n/routes";
import { localeHref } from "@/lib/i18n/routes";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA } from "@/lib/state/words";

/**
 * `/blog` whole: the head, the two controls, the counter, and the list.
 *
 * THREE STATES, AND ONLY TWO OF THEM ARE THE SHEET'S. The Blog Index artboard
 * draws `EMPTY · KEIN EINTRAG` and `EMPTY · FILTER OHNE TREFFER`, which is what
 * the build plan means by "Zwei Leerzustände im Index". The third is not new
 * either: ADR 0062 §4 already decided, for this same read on the homepage, that
 * a directory which could not be READ is a different claim from one that was
 * read and holds nothing. `00 ENTRIES` is a measurement; `— NO DATA` means this
 * image shipped without its own content. Three states, two vocabularies, and
 * nothing invented here.
 *
 * THE THIRD OF THE SHEET'S TWO IS NOT IN THIS FILE AT ALL. Nought MATCHING
 * entries is the island's to draw, because only the island knows a filter is on
 * — `WorkList` makes the same split.
 *
 * THE ROWS ARE RENDERED HERE AND HANDED OVER AS OUTPUT. `FilterRowNode.node` and
 * `YearNode.head` are Server Components that have already run, which is what
 * keeps `PostCard` and `next/link` out of the island's module graph. The head of
 * components/blog/BlogFilters.tsx holds the argument and the numbers.
 *
 * THE READING TIME COSTS A SECOND READ OF EVERY FILE, and it is paid rather than
 * avoided. `PostMeta` deliberately holds no word count — lib/content/posts.ts
 * says why: the homepage and the Work Index draw neither, and putting it in the
 * type would make them pay for it on every read. So this page opens twenty-odd
 * files once, at build time, in a route that is prerendered. `PostFoot` already
 * pays the same price twice per entry.
 */
export function BlogList({
  read,
  locale,
  feedHref,
  caseStudyHref,
  exit,
  messages,
}: {
  /** The directory read, or `null` when it could not be read. */
  read: PostRead | null;
  locale: Locale;
  feedHref: string;
  caseStudyHref: string | null;
  /** The way out of the empty log. `null` in the gallery. */
  exit: { href: string; label: string } | null;
  messages: Messages;
}) {
  const posts = read?.posts ?? [];
  const readable = read !== null;

  const head = (
    <BlogHeader
      entries={blogEntries(read === null ? null : posts)}
      latest={blogLatest(latestPublished(posts), readable)}
      feedHref={feedHref}
      caseStudyHref={caseStudyHref}
      messages={messages}
    />
  );

  if (posts.length === 0) {
    return (
      <>
        {head}
        <EmptyState
          heading={readable ? "00 ENTRIES" : NO_DATA}
          reason={readable ? messages.blogNoEntriesReason : messages.blogListDown}
        >
          {/* "BEIDE ZUSTÄNDE NENNEN EINEN AUSWEG — ohne Ausweg ist ein
              Leerzustand eine Sackgasse." The sheet names this one: `SYSTEME
              ANSEHEN →`. It is offered for both, because a reader whose image
              lost its content is no less stuck than one who arrived early. */}
          {exit === null ? null : (
            <p className="blog-exit">
              <Link href={exit.href}>{exit.label} →</Link>
            </p>
          )}
        </EmptyState>
      </>
    );
  }

  const newest = posts[0]?.slug;

  /** One entry, drawn, plus the two fields the axes read. */
  const rowOf = (post: PostMeta): FilterRowNode => {
    const raw = postSource(post.slug);

    return {
      key: post.slug,
      tags: post.tags,
      text: haystack(post),
      node: (
        <PostCard
          post={post}
          href={localeHref(locale, postPath(post))}
          // `null` rather than a guess when the file the listing named cannot be
          // re-read. It is not `— NO DATA`: nobody attempted a measurement of a
          // file that is not there, and PostCard leaves the cell standing empty
          // so the grid does not shift.
          minutes={raw === null ? null : minutesLabel(readingSize(raw))}
          latest={post.slug === newest}
          messages={messages}
        />
      ),
    };
  };

  const years: readonly YearNode[] = byYear(posts).map((group) => ({
    key: group.year,
    // A HEADING AND NOT A LIST ITEM, though the sheet draws the separator inside
    // the list. An `<li>` here would make `23 entries` announce itself as 25
    // items, and the year would be counted as one of them. As a heading it is
    // also something a screen reader can jump between, which is the navigation
    // the sheet's own note claims for it: "Jahres-Trenner mit Zähler ersetzt
    // Endlos-Scroll-Gefühl".
    head: (
      <h2 className="post-cards-year">
        <span className="post-cards-year-no">{group.year}</span>
        <span className="post-cards-year-count">{group.count} ENTRIES</span>
      </h2>
    ),
    rows: group.posts.map(rowOf),
  }));

  return (
    <>
      {head}
      <BlogFilters
        years={years}
        chips={tagChips(posts)}
        strings={{
          searchPlaceholder: messages.blogSearchPlaceholder,
          noMatchHead: messages.blogNoMatchHead,
          noMatchReason: messages.blogNoMatchReason,
          reset: messages.blogReset,
        }}
      />
    </>
  );
}
