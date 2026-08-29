// A stub, and it is here so that G3 can prove itself. The chrome claims three
// things — the active entry is white, nothing is active on `/`, and the footer
// comes in two versions per CHR.01 — and none of them is observable if every
// nav target is a 404. Six routes cost about fifty lines and turn the phase's
// own acceptance into something a browser can show.
//
// H6 REPLACES this file. Nothing here is a decision about the page.

import type { Metadata } from "next";

import { alternatesFor } from "@/lib/i18n/alternates";
import { asLocale } from "@/lib/i18n/routes";

// SEO, and one line of it is a decision rather than a convention.
//
// `index: false` is here because the page is a stub. A crawler that finds
// `WORK [SOON]` files that away as what this site has to say on the subject,
// and takes a while to be talked out of it. H6 fills the page and deletes
// this line — it disappears together with its reason. `app/robots.ts` allows
// everything; the refusal is per page, where the reason is legible.
export async function generateMetadata({ params }: PageProps<"/[lang]/work">): Promise<Metadata> {
  const { lang } = await params;
  return { alternates: alternatesFor(asLocale(lang), "/work"), robots: { index: false } };
}

export default function Page() {
  return <p>WORK [SOON]</p>;
}
