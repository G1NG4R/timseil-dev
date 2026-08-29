// A stub, and it is here so that G3 can prove itself. The chrome claims three
// things — the active entry is white, nothing is active on `/`, and the footer
// comes in two versions per CHR.01 — and none of them is observable if every
// nav target is a 404. Six routes cost about fifty lines and turn the phase's
// own acceptance into something a browser can show.
//
// H9 REPLACES this file. Nothing here is a decision about the page.

import type { Metadata } from "next";

import { asLocale } from "@/lib/i18n/routes";
import { seoFor } from "@/lib/seo/pages";

// SEO, in one call. Until G5b this named its own canonical and wrote
// `robots: { index: false }` as a literal, with the reason beside it. The
// reason has not changed — the page is a stub, and a crawler that finds it
// files that away as what this site has to say on the subject — but the
// boolean now lives in lib/seo/pages.ts, because `app/sitemap.ts` needs the
// same answer and two copies of it would drift. H9 flips it there and
// deletes this page, and the sitemap follows in the same commit.
export async function generateMetadata({ params }: PageProps<"/[lang]/blog">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/blog");
}

export default function Page() {
  return <p>LOG [SOON]</p>;
}
