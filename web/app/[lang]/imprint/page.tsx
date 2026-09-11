// `/imprint`, SYS.06 of the Legal sheet.
//
// THE STUB THAT STOOD HERE IS GONE. It said `IMPRINT [SOON]` and its own
// comment promised that H12 would replace it and delete the file's `noindex`
// literal; this is that phase. What the stub was for — giving G3's chrome a
// real nav target to prove itself against — is now done by a page with a
// document on it.
//
// EVERY SENTENCE IS IN lib/legal/imprint.ts AND NOT HERE, for the reason
// `/privacy` gives one route over: `npm test` reads `lib/**` and cannot load a
// `.tsx`, and the assertions that matter on a legal page are about the
// sentences — that no bracket survives, that no duration appears which no file
// enforces, that the sheet's flat third-party claim is scoped.
//
// NO CLIENT ISLAND AT ALL, which makes this the third page on this site that
// reads nothing and suspends on nothing, after the 404 and `/privacy` — and the
// only one of the three with no `'use client'` anywhere beneath it. An imprint
// is a document that has to be legible with scripting off, from a text browser,
// to a machine that archives it.

import type { Metadata } from "next";

import { Blocks } from "@/components/legal/Blocks";
import { Fields } from "@/components/legal/Fields";
import { JumpRail } from "@/components/legal/JumpRail";
import { NotApplicable } from "@/components/legal/NotApplicable";
import { SeeAlso } from "@/components/legal/SeeAlso";
import { SectionHead } from "@/components/ui/SectionHead";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { CONTENT, HERO, LABELS, NOT_APPLICABLE, OPERATOR, SEE_ALSO } from "@/lib/legal/imprint";
import { anchorFor, IMPRINT_SECTIONS } from "@/lib/legal/sections";
import { seoFor } from "@/lib/seo/pages";

// SEO, in one call. The stub wrote `robots: { index: false }` because a crawler
// that found `IMPRINT [SOON]` would file that away as what this site has to say
// on the subject; since G5b the boolean lives in lib/seo/pages.ts, and this
// phase flips it there. app/sitemap.ts reads the same answer and needs no edit.
export async function generateMetadata({
  params,
}: PageProps<"/[lang]/imprint">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/imprint");
}

/** The id of the head that names a section, so the `<section>` landmark is
 *  announced by the title already on the screen rather than by a second copy of
 *  it. `/privacy` and `/about` do the same. */
function titleIdFor(id: string): string {
  return `${anchorFor(id)}-title`;
}

/** The section the operator's details belong to. A constant rather than a
 *  literal in the loop below, because the field list and the marker have to name
 *  the same section — and `IMPRINT_SECTIONS` is what decides the marker. */
const OPERATOR_SECTION = "06.01";

export default async function Page() {
  // The ROUTE's language, which is what a link has to carry: `/de/imprint` must
  // point at `/de/privacy` and not drop the reader into English on the way.
  const { locale } = await getDictionary();

  return (
    <div className="lg">
      {/* NO `.lg-hero-text` WRAPPER, because there is nothing to wrap it
          against: on `/privacy` that div is the first column of a grid whose
          second column is the readout panel, and here the headline has the row
          to itself. */}
      <header className="lg-head">
        <p className="lg-eyebrow">{HERO.eyebrow}</p>
        <h1 className="lg-h1">{HERO.title}</h1>
        <p className="lg-lede">{HERO.lede}</p>
      </header>

      <div className="lg-body">
        <div className="lg-prose">
          {IMPRINT_SECTIONS.map((section) => (
            <section
              className="lg-section"
              key={section.id}
              id={anchorFor(section.id)}
              aria-labelledby={titleIdFor(section.id)}
            >
              <SectionHead
                id={section.id}
                title={section.title}
                titleId={titleIdFor(section.id)}
              />
              {/* THE FIELD LIST COMES BEFORE THE PROSE OF ITS SECTION, which is
                  the sheet's order and the useful one: somebody who opened this
                  page wants a name and an address, and a paragraph explaining
                  which of the two to use is only interesting once they have
                  seen both. */}
              {section.id === OPERATOR_SECTION ? (
                <Fields fields={OPERATOR} label={LABELS.operator} />
              ) : null}
              <Blocks blocks={CONTENT[section.id] ?? []} />
            </section>
          ))}

          <p className="lg-revised">{LABELS.revised}</p>
        </div>

        {/* THE ASIDE IS THREE THINGS AND ONLY THE FIRST OF THEM GOES AWAY ON A
            PHONE. layout.css hides `.lg-rail` below 1080 — a table of contents
            between the last section and the footer is where one is least useful
            — and the other two stay, which is what the mobile artboard draws:
            the list of what does not apply is part of the document, and the way
            to the other legal page is the only one this page offers besides the
            footer. */}
        <aside className="lg-aside">
          <JumpRail sections={IMPRINT_SECTIONS} label={LABELS.rail} />
          <NotApplicable
            items={NOT_APPLICABLE.items}
            note={NOT_APPLICABLE.note}
            label={LABELS.notApplicable}
          />
          <SeeAlso
            label={SEE_ALSO.label}
            marker={SEE_ALSO.marker}
            blurb={SEE_ALSO.blurb}
            href={localeHref(locale, SEE_ALSO.path)}
          />
        </aside>
      </div>
    </div>
  );
}
