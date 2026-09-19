// `/privacy`, SYS.07 of the Legal sheet.
//
// THE STUB THAT STOOD HERE IS GONE. It said `PRIVACY [SOON]` and carried a
// comment promising that H12 would replace it; this is that. What the stub was
// for — giving G3's chrome a real nav target to prove itself against — is now
// done by a page with something on it.
//
// EVERY SENTENCE IS IN lib/legal/content.ts AND NOT HERE, because `npm test`
// reads `lib/**` and cannot load a `.tsx`, and the assertions that matter on
// this page are about the sentences: that no duration appears which no file
// enforces, that the six claims the design sheet outgrew are gone, and that the
// only brackets left are the two nobody in this repository can fill. ADR 0076.
//
// ONE CLIENT ISLAND, AND IT IS THE PANEL. Everything else is a server component.

import type { Metadata } from "next";

import { Blocks } from "@/components/legal/Blocks";
import { JumpRail } from "@/components/legal/JumpRail";
import { Readout } from "@/components/legal/Readout";
import { SeeAlso } from "@/components/legal/SeeAlso";
import { ShortVersion } from "@/components/legal/ShortVersion";
import { SectionHead } from "@/components/ui/SectionHead";
import { CONTENT, HERO, LABELS, PANEL, SEE_ALSO, SHORT_VERSION } from "@/lib/legal/content";
import { anchorFor, PRIVACY_SECTIONS } from "@/lib/legal/sections";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { seoFor } from "@/lib/seo/pages";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/privacy");
}

/** The id of the head that names a section, so the `<section>` landmark is
 *  announced by the title already on the screen rather than by a second copy of
 *  it. The About page does the same; the anchor the jump rail targets is the
 *  same id, so there is one string per section and not two. */
function titleIdFor(id: string): string {
  return `${anchorFor(id)}-title`;
}

export default async function Page() {
  // The ROUTE's language, and the page needs it for exactly one thing: the link
  // to the imprint. `/de/privacy` has to point at `/de/imprint` rather than drop
  // the reader into English on the way out. H12c; before it this component took
  // no arguments at all.
  const { locale } = await getDictionary();

  return (
    <div className="lg">
      <header className="lg-hero">
        <div className="lg-hero-text">
          <p className="lg-eyebrow">{HERO.eyebrow}</p>
          <h1 className="lg-h1">{HERO.title}</h1>
          <p className="lg-lede">{HERO.lede}</p>
          <p className="lg-sub">{HERO.sub}</p>
        </div>

        <Readout
          title={PANEL.title}
          badge={PANEL.badge}
          footer={PANEL.footer}
          pending={PANEL.pending}
          label={LABELS.readout}
        />
      </header>

      <div className="lg-body">
        <div className="lg-prose">
          {/* THE SHORT VERSION SITS INSIDE THE PROSE COLUMN AND ABOVE IT at
              every width, rather than in the rail. The sheet draws it in the
              380px column on desktop; putting it there would mean a reader on a
              phone — where the rail is gone — loses the only part of this page
              most people read. */}
          <ShortVersion
            lines={SHORT_VERSION}
            title={LABELS.shortVersion}
            yesLabel={LABELS.yes}
            noLabel={LABELS.no}
          />

          {PRIVACY_SECTIONS.map((section) => (
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
              <Blocks blocks={CONTENT[section.id] ?? []} />
            </section>
          ))}

          <p className="lg-revised">{LABELS.revised}</p>
        </div>

        {/* THE RAIL GAINED A NEIGHBOUR IN H12c, and that is why it is wrapped.
            layout.css hides `.lg-rail` below 1080 — a table of contents between
            the last section and the footer is where one is least useful — and
            the way to the imprint must not go with it: it is the only route
            this page offers to the other half of the document besides the
            footer. The sheet draws both in the same column. */}
        <aside className="lg-aside">
          <JumpRail sections={PRIVACY_SECTIONS} label={LABELS.rail} />
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
