// One entry of the log. Build plan H9 — the renderer ADR 0002 promised, and the
// route that six earlier phases have been holding links back from.
//
// WHAT MAKES THIS PAGE POSSIBLE AND WHAT IT COSTS. `@next/mdx` compiles the file
// at build time, so the body arrives as a React tree and not as a string of
// HTML: no `dangerouslySetInnerHTML`, no sanitiser, and no runtime markdown
// parser in the bundle. The cost is ADR 0002's, named there: "Ein Beitrag
// erfordert einen Deploy."
//
// ZERO BYTES OF ITS OWN JAVASCRIPT, like the case study next door. Everything on
// this page is prose in the repository — there is no api call, no `use cache`
// profile, and no Suspense hole. The three things the sheet draws that WOULD
// need a client are the reading-progress bar, the active entry in the contents
// rail, and the code block's COPY button; H9a builds none of them and ADR 0070
// says why each.
//
// THE DYNAMIC IMPORT IS A CONTEXT, NOT A PATH. `import(\`…/${slug}.mdx\`)` makes
// the bundler compile every file matching the pattern and pick one at runtime,
// which is what lets twenty-one entries share one route module. The template has
// a literal prefix and a literal suffix on purpose: without them the bundler has
// no directory to scope the context to, and the import would resolve to nothing.
//
// AND THE SLUG IS PROVEN BEFORE IT GETS THERE. `postFor` returns null for a
// segment no file answers to and the route leaves through `notFound()`, so the
// string that reaches the import is one this repository wrote. That is the same
// gate `caseStudyFor` is for `/work/[slug]`, and the same argument: lib/http/url
// proves a segment is SAFE, the registry proves the page was MEANT.

import type { MDXContent } from "mdx/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PostAuthor } from "@/components/blog/PostAuthor";
import { PostCrumb } from "@/components/blog/PostCrumb";
import { PostFoot, type NeighbourSource } from "@/components/blog/PostFoot";
import { PostHeader } from "@/components/blog/PostHeader";
import { PostRail } from "@/components/blog/PostRail";
import { PostSummary } from "@/components/blog/PostSummary";
import { caseStudyFor, caseStudyPath } from "@/content/case-studies/index";
import { neighbours } from "@/lib/content/neighbours";
import { postFor, postPath, postSource, postsOrNull, type PostMeta } from "@/lib/content/posts";
import { toc } from "@/lib/content/toc";
import { readingSize } from "@/lib/content/words";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref, type Locale } from "@/lib/i18n/routes";
import { seoForPost } from "@/lib/seo/pages";
import { REPO_URL } from "@/lib/site";

// The same reason app/[lang]/work/[slug]/page.tsx gives: without this list Next
// builds a shell for the literal segment `[slug]`, the header's `usePathname()`
// has no pathname to read, and the build stops. Turbopack refuses
// `dynamicParams: false` under cacheComponents, so this is the prerender list
// rather than the accept list — an unknown slug still reaches the component.
export function generateStaticParams() {
  return (postsOrNull()?.posts ?? []).map((post) => ({ slug: post.slug }));
}

/**
 * The compiled entry, narrowed rather than trusted.
 *
 * A DYNAMIC IMPORT IS `any`, AND `any` IS FORBIDDEN. The bundler cannot know
 * which of twenty-one modules a template import will resolve to, so it types the
 * result as `any` and every property read off it is unchecked — including
 * `default`, which is the one thing this page renders. CLAUDE.md's rule has no
 * exception for a module the compiler produced, and a lint suppression here
 * would be the assertion written in a comment instead of in code.
 *
 * WHAT IT ACTUALLY CHECKS is the one property that matters: that `default` is
 * callable. An `.mdx` file that compiled to something else is a build that went
 * wrong upstream, and a page that rendered whatever it found would fail deeper
 * in React with a stack nobody can read back to this line.
 */
/**
 * The compiled entry, rendered from a prop.
 *
 * WHY IT IS NOT RENDERED INLINE. `<Body />` where `Body` is a local `const` is
 * "Cannot create components during render" to the React Compiler, and the
 * compiler is right about the shape even though it is wrong about this case: it
 * cannot see that the value came out of a module rather than out of a closure.
 * Taking the component as a prop says what is actually true — the component is
 * stable, and this page chose which one — and it says it in code rather than in
 * a lint suppression, of which this repository has none.
 */
function MdxBody({ body: Body }: { body: MDXContent }) {
  return <Body />;
}

function mdxBody(module: unknown): MDXContent | null {
  if (typeof module !== "object" || module === null) return null;
  if (!("default" in module)) return null;
  const body: unknown = module.default;
  return typeof body === "function" ? (body as MDXContent) : null;
}

/** Where a reader can go and read the file this page was rendered from. `main`
 *  is the branch every phase squash-merges into; a phase branch is deleted. */
function sourceHref(post: PostMeta): string {
  return `${REPO_URL}/blob/main/web/content/posts/${post.slug}.mdx`;
}

/** The case study for the system an entry names, when that system has one.
 *  `vat-check` is a system with no page, so an entry about it would link
 *  nowhere — invariant 5, decided once in content/case-studies/index.ts. */
function systemLink(post: PostMeta, locale: Locale): string | null {
  if (post.systemId === null) return null;
  const study = caseStudyFor(post.systemId);
  return study === null ? null : localeHref(locale, caseStudyPath(study));
}

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/blog/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const post = postFor(slug);
  if (post === null) notFound();

  return seoForPost(asLocale(lang), postPath(post), post);
}

export default async function Page({ params }: PageProps<"/[lang]/blog/[slug]">) {
  const { slug } = await params;

  const read = postsOrNull();
  const post = read?.posts.find((entry) => entry.slug === slug) ?? null;
  const raw = post === null ? null : postSource(slug);
  // TWO WAYS TO NOT EXIST, ONE ANSWER. A slug nothing wrote and a file that
  // vanished between the listing and the read are the same thing to a visitor:
  // there is no such entry. The distinction matters to the log — readPosts
  // already warns for a file it could not use — and not to the page.
  if (post === null || raw === null) notFound();

  const { locale, messages } = await getDictionary();
  const indexHref = localeHref(locale, "/blog");
  const around = neighbours(read?.posts ?? [], slug);

  /** A neighbour needs its address and its source, and the source is only read
   *  to count its minutes. `null` when there is no neighbour — which is the
   *  sheet's one empty state, and PostFoot draws the row anyway. */
  const sourceFor = (entry: PostMeta | null): NeighbourSource | null => {
    if (entry === null) return null;
    const text = postSource(entry.slug);
    return text === null ? null : { href: localeHref(locale, postPath(entry)), raw: text };
  };

  const Body = mdxBody(await import(`../../../../content/posts/${slug}.mdx`));
  // Unreachable through the router: `postFor` already proved a file with this
  // name exists and the bundler compiled every file in the directory. It is a
  // 404 rather than a throw for the same reason the two cases above are one —
  // a visitor cannot act on the difference.
  if (Body === null) notFound();

  const systemHref = systemLink(post, locale);

  return (
    <>
      <PostCrumb
        href={indexHref}
        back={messages.navLog}
        published={post.published}
        title={post.title}
      />

      <PostHeader
        post={post}
        size={readingSize(raw)}
        systemHref={systemHref}
        sourceHref={sourceHref(post)}
        messages={messages}
      />

      <div className="post-body-grid">
        <PostRail
          entries={toc(raw)}
          systemHref={systemHref}
          systemLabel={post.systemId}
          messages={messages}
        />

        <div className="post-column">
          <PostSummary summary={post.summary} messages={messages} />

          {/* The compiled entry. Everything inside it is markdown from the file:
              headings carry ids from `rehype-slug`, tables come from
              `remark-gfm`, and mdx-components.tsx frames the two blocks that
              scroll. Nothing here styles it — styles/blog.css does, from
              `.post-body`. */}
          <article className="post-body">
            <MdxBody body={Body} />
          </article>

          <PostAuthor messages={messages} />
        </div>
      </div>

      <PostFoot
        neighbours={around}
        previousSource={sourceFor(around.previous)}
        nextSource={sourceFor(around.next)}
        indexHref={indexHref}
        messages={messages}
      />
    </>
  );
}
