// Which routes exist, which of them have something to say today, and the one
// call a page makes to get all of its metadata.
//
// WHY A TABLE AND NOT SEVEN LITERALS. Until now each stub carried
// `robots: { index: false }` in its own file, with the reason next to it. That
// reads well and has one defect: `sitemap.ts` needs the same answer, and a
// sitemap that lists a `noindex` URL contradicts the page it is pointing at.
// Two copies of "is this page ready" drift the moment a stage-H phase fills one
// page and forgets the other list. So the boolean lives here once, and the H
// phase flips it in one place — the metadata and the sitemap follow together.
//
// THIS IS THE OPPOSITE OF lib/chrome.ts's RULE, on purpose, and the difference
// is worth naming. There, a transcribed table is an oracle in the test and the
// implementation is not allowed to import it. Here there is no oracle: nothing
// outside this repository knows which of our own pages are finished. The value
// is not a fact to be checked against a sheet, it is a decision we make, and a
// decision belongs in one place.
//
// NOT A ROUTER. `app/[lang]/` decides which addresses exist; this file only
// says what the ones that exist claim about themselves. The two are held
// together by pages.test.ts, which refuses a NAV entry that is not listed here.

import type { Metadata } from "next";

import { caseStudyPaths } from "../../content/case-studies/index.ts";
import { postPaths } from "../content/posts.ts";
import { alternatesFor } from "../i18n/alternates.ts";
import { type Locale, localeHref } from "../i18n/routes.ts";
import { AUTHOR, SITE_DESCRIPTION, SITE_NAME } from "../site.ts";

/** The seven routes, language-free, in the order README's route table lists
 *  them.
 *
 *  `indexable` is "does this page say anything yet", not "is it allowed to
 *  exist". Three of the seven are still `[SOON]` stubs, and a crawler that finds
 *  `BLOG [SOON]` files that away as what this site has to say on the subject
 *  and takes a while to be talked out of it. The phase named in each comment
 *  fills the page and flips the boolean in the same commit — H6 did it for
 *  `/work`, H7 for `/about` and H8 for `/contact`, and every time app/sitemap.ts
 *  picked the page up out of this boolean with no edit of its own. */
const FIXED_PAGES = [
  { path: "/", indexable: true },
  { path: "/work", indexable: true },
  { path: "/blog", indexable: false }, // H9
  { path: "/about", indexable: true }, // filled by H7
  { path: "/contact", indexable: true }, // filled by H8
  { path: "/imprint", indexable: false }, // H12
  { path: "/privacy", indexable: false }, // H12
] as const;

export interface PageEntry {
  readonly path: string;
  readonly indexable: boolean;
}

/**
 * The seven fixed routes, one row per case study, and one per log entry.
 *
 * H1 IS WHERE THIS TABLE STOPPED BEING SEVEN LITERALS, and the alternative was
 * worse than the shape change. `/work/<slug>` is one address per system, so the
 * literals cannot be written out without writing the slug twice — once here and
 * once in content/case-studies — and the second copy is the one that would be
 * forgotten. The registry is therefore the source, and this table reads it.
 *
 * A CASE STUDY WAS INDEXABLE BEFORE `/work` WAS, which looked backwards for
 * five phases and was not: `/work` was the `[SOON]` stub until H6, and a
 * crawler that read it would have filed `WORK [SOON]` as what this site has to
 * say about its work. The case study had something to say, so it said it. The
 * two flipped independently because the boolean is per row, and H6 flipped the
 * second of them — app/sitemap.ts picked the page up out of the same boolean
 * with no edit, which is the whole reason there is one table and not two.
 *
 * H9a REPEATS THAT ASYMMETRY DELIBERATELY, and it is the second time rather than
 * a new idea: twenty-one entries become indexable here while `/blog` stays the
 * `[SOON]` stub until H9b builds the index. The reason is the one above, word for
 * word — the entries have something to say and the stub does not, and a crawler
 * that read `LOG [SOON]` would file that as this site's writing. H9b flips the
 * one remaining row.
 *
 * THE POST ROWS COME FROM THE FILESYSTEM AND THE CASE-STUDY ROWS DO NOT, which
 * is the one wrinkle worth naming. `postPaths()` reads a directory at module
 * scope; it answers `[]` rather than throwing when it cannot, because this table
 * is imported by every page and a log that could not be listed must not be able
 * to take the homepage down with it. lib/content/posts.ts carries that argument.
 */
export const PAGES: readonly PageEntry[] = [
  ...FIXED_PAGES,
  ...caseStudyPaths().map((path) => ({ path, indexable: true })),
  ...postPaths().map((path) => ({ path, indexable: true })),
];

/** The image every page points at, and the feed every page announces. Both are
 *  route handlers at the root, outside `app/[lang]/` — lib/i18n/routes.ts says
 *  why: the canonical redirect must not be able to reach them. */
const OG_IMAGE = "/og.png";
const FEED = "/feed.xml";

/** The alt text for the social image. It describes what the image SAYS, not
 *  what it looks like — a reader who gets the alt instead of the picture is
 *  owed the sentence, not a description of the typography. */
const OG_ALT = `${SITE_NAME} — ${SITE_DESCRIPTION}`;

function entryFor(path: string): PageEntry {
  const entry = PAGES.find((page) => page.path === path);
  // A path this table does not know is a page that was added without deciding
  // whether it may be indexed. Returning something harmless here would ship
  // that omission as a default; the build stops instead.
  if (entry === undefined) throw new Error(`no page entry for: ${path}`);
  return entry;
}

/** Every route that may appear in `sitemap.xml`, language-free. */
export function indexablePaths(): readonly string[] {
  return PAGES.filter((page) => page.indexable).map((page) => page.path);
}

/**
 * Everything a page has to say to a machine: the canonical URL, the four
 * `hreflang` links, the feed, and the social card — plus the refusal, while the
 * page is still a stub.
 *
 * IT RETURNS THE WHOLE `alternates` OBJECT, AND IT HAS TO. Next merges metadata
 * from layout and page FLAT: a page that sets `alternates` replaces the
 * layout's rather than extending it, and the same holds for `openGraph`
 * (generate-metadata.md:1405-1418 — a page setting only `title` still emits the
 * layout's `og:title`). So the feed link cannot live in the layout next to
 * `metadataBase`; it would be silently dropped by every page that names its own
 * canonical, which is all of them.
 *
 * NO `og:locale`. The format is `language_TERRITORY`, and this site has no
 * territory to claim — `en_US` would be a guess and `en_GB` a different one.
 * The `hreflang` block already carries the language set, and it carries it in
 * the form a crawler acts on.
 */
export function seoFor(locale: Locale, path: string): Metadata {
  const { indexable } = entryFor(path);
  const url = localeHref(locale, path);

  return {
    alternates: {
      ...alternatesFor(locale, path),
      types: { "application/rss+xml": FEED },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url,
      // `title` AND `description` ARE REPEATED HERE, AND THEY HAVE TO BE. Next
      // does not derive `og:title` from `title`: its own example shows a page
      // setting `title: 'About'` and still emitting the layout's `og:title`
      // (generate-metadata.md:1405-1418). Left out, the card would carry no
      // title at all rather than falling back to the document's.
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE],
    },
    // Present only while the page is a stub, so that it disappears together
    // with its reason rather than being carried as `index: true` noise.
    ...(indexable ? {} : { robots: { index: false } }),
  };
}

/**
 * A log entry's metadata: the site's card with the entry's words on it.
 *
 * WHY A SECOND FUNCTION AND NOT A FLAG ON THE FIRST. `seoFor` answers one
 * question — what does THIS SITE say about this address — and every page it
 * serves says the same three things with a different canonical. An entry says
 * something else: it has its own title, its own description, and two dates. A
 * boolean parameter would make one function do two jobs and leave the caller
 * reading the implementation to find out which.
 *
 * `type: "article"` AND THE TWO TIMES, because that is the difference a crawler
 * acts on: an article is dated and a website is not. `publishedTime` is the
 * frontmatter's own `published`; `modifiedTime` appears only when the entry
 * carries `updated`, which none does yet — the same absence sitemap.ts records,
 * for the same reason.
 *
 * THE IMAGE IS STILL THE SITE'S CARD. There is no per-entry image: nothing in
 * content/posts is a picture, and `next/og` generating one per entry is a phase
 * nobody has planned. A shared card is a true statement about a shared site; a
 * generated one that said something else would be the fourth place a title lives.
 *
 * THE DESCRIPTION IS THE DEK AND NOT THE SUMMARY, which is the opposite of what
 * lib/seo/feed.ts does and is deliberate. A feed reader shows a paragraph and a
 * search result shows about 160 characters — the dek is one line written to be
 * read alone, and the summary is three sentences that would be cut mid-clause.
 */
export function seoForPost(
  locale: Locale,
  path: string,
  entry: { title: string; deck: string; published: string; updated: string | null },
): Metadata {
  const base = seoFor(locale, path);

  return {
    ...base,
    title: entry.title,
    description: entry.deck,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: localeHref(locale, path),
      title: entry.title,
      description: entry.deck,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
      publishedTime: entry.published,
      ...(entry.updated === null ? {} : { modifiedTime: entry.updated }),
      authors: [AUTHOR.name],
    },
    twitter: {
      card: "summary_large_image",
      title: entry.title,
      description: entry.deck,
      images: [OG_IMAGE],
    },
  };
}
