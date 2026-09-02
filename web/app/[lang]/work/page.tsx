// `/work` — the list of systems, and the second page on this site that is
// allowed to be indexed.
//
// THE STUB THAT STOOD HERE IS GONE. It shipped in G3 so that the chrome could
// prove three things a 404 cannot show — the active entry is white, nothing is
// active on `/`, and the footer comes in two versions — and its own comment
// said what this phase does with it: "H6 REPLACES this file. Nothing here is a
// decision about the page."
//
// ONE SUSPENSE HOLE, AND IT COVERS THE HEAD. Everything that reads
// `/api/systems` is inside it, including the four stat tiles and the counter,
// because all six numbers are statements about the answer — a prerendered head
// would have to draw counts it does not have. `workMeta(null)` writes
// `— NO DATA · FIGURES FROM /api/systems`, so the head that is still waiting
// names what it waits for. SYS.01 and SYS.02 settled that arrangement.
//
// AND THE LEGEND AND THE CONTACT LINE ARE OUTSIDE IT. Neither reads anything:
// the legend defines three words out of `MARKS`, and the sentence under the
// list is a route. Both prerender into the static shell, so a reader whose api
// is down still gets the vocabulary and the way out — which is the half of an
// outage this site keeps having to remember it owes.
//
// THE POSTS ARE READ HERE AND NOT BEHIND THE BOUNDARY. They are files in this
// image rather than an answer to wait for, so putting them inside would make
// the per-system entry count wait on an endpoint it has nothing to do with.
// `postsOrNull` folds the one failure it can have into `null`, and the row then
// draws no log line at all rather than `00 ENTRIES`.

import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkContact } from "@/components/work/WorkContact";
import { WorkLegend } from "@/components/work/WorkLegend";
import { WorkList } from "@/components/work/WorkList";
import { WorkLive } from "@/components/work/WorkLive";
import { postsOrNull } from "@/lib/content/posts";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { seoFor } from "@/lib/seo/pages";

// SEO, in one call, out of the table in lib/seo/pages.ts — where `/work` is
// `indexable: true` as of this phase. The stub wrote `robots: { index: false }`
// because a crawler that found `WORK [SOON]` would file that away as what this
// site has to say on the subject. It has something to say now, and
// app/sitemap.ts picks the page up from the same boolean with no edit.
export async function generateMetadata({ params }: PageProps<"/[lang]/work">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/work");
}

export default async function Page() {
  const { locale, messages } = await getDictionary();
  const posts = postsOrNull();

  return (
    <>
      <Suspense fallback={<WorkList body={null} posts={posts?.posts ?? []} messages={messages} />}>
        <WorkLive posts={posts?.posts ?? []} messages={messages} />
      </Suspense>

      {/* The training log is SYS.01 of the homepage rather than a route of its
          own, which is why this points at `/` and not at a page that does not
          exist. The Routes matrix expects every claim to reach its evidence,
          and the evidence for a state word is the log that derives it. */}
      <WorkLegend href={localeHref(locale, "/")} messages={messages} />

      <WorkContact href={localeHref(locale, "/contact")} messages={messages} />
    </>
  );
}
