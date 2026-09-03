// `/contact` — the one place on this site where a reader can start something,
// and the only unauthenticated write path the whole system has.
//
// THE STUB THAT STOOD HERE IS GONE. It shipped in G3 so the chrome could prove
// what a 404 cannot show, and its own comment said what this phase does with it:
// "H8 REPLACES this file. Nothing here is a decision about the page."
//
// THE API HALF WAS BUILT IN C6 AND HAS BEEN LIVE SINCE. Validation, honeypot,
// dwell floor, idempotency, two rate limiters, a peppered IP hash, SMTP against
// OVH, an hourly send budget and a dispatcher that carries what the request path
// could not — all of it accepted, all of it measured (L1: mail-tester 10/10,
// 20.08.2026). What was missing was a form. `docs/runbooks/mail.md` says so in
// the middle of an acceptance procedure: "Es gibt bis H8 kein Formular."
//
// NO SUSPENSE AND NO `await` ON AN ENDPOINT. Like `/about`, this page reads
// nothing: every word comes from lib/i18n and lib/contact, so the route
// prerenders into the static shell. The one thing that talks to the api does it
// from the browser, after somebody presses a button.
//
// AND THE PAGE IS SERVER-RENDERED AROUND AN ISLAND, not the other way round. The
// headline, the lede, the address and the notice are markup with no behaviour,
// so they stand for a visitor with no JavaScript — who has no form, and has the
// address instead. ContactForm's header carries that argument in full.

import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/ContactForm";
import { JsonLd } from "@/components/JsonLd";
import { SectionHead } from "@/components/ui/SectionHead";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { asLocale, localeHref } from "@/lib/i18n/routes";
import { contactLd } from "@/lib/seo/jsonld";
import { seoFor } from "@/lib/seo/pages";
import { AUTHOR } from "@/lib/site";

// SEO, in one call, out of the table in lib/seo/pages.ts — where `/contact` is
// `indexable: true` as of this phase. The stub was `noindex` because a crawler
// that found `CONTACT [SOON]` would file that away as what this site has to say
// on the subject. It has something to say now, and app/sitemap.ts picks the page
// up from the same boolean with no edit.
export async function generateMetadata({ params }: PageProps<"/[lang]/contact">): Promise<Metadata> {
  const { lang } = await params;
  return seoFor(asLocale(lang), "/contact");
}

const TITLE_ID = "contact-SYS-06";

export default async function Page() {
  // `resolved` is the language the STRINGS are in, which is not always the
  // language of the route: `/de` serves English until P6 fills the dictionary.
  // The graph gets that value rather than the route's, so it never claims a
  // translation the page does not have.
  const { locale, resolved, messages } = await getDictionary();

  return (
    <>
      <section className="contact" aria-labelledby={TITLE_ID}>
        <SectionHead id="SYS.06" title="CHANNEL" titleId={TITLE_ID} />

        <h1 className="contact-headline">{messages.contactHeadline}</h1>

        {/* THE ADDRESS IS IN THE LEDE AND NOT IN A FOOTNOTE, because for a
            visitor without JavaScript it is not an alternative — it is the
            page. It is also the sheet's own arrangement. */}
        <p className="contact-lede">
          {messages.contactLede}{" "}
          <a className="contact-address" href={`mailto:${AUTHOR.email}`}>
            {AUTHOR.email}
          </a>
        </p>

        <ContactForm
          copy={{
            emailHint: messages.contactEmailHint,
            sending: messages.contactSending,
            accepted: messages.contactAccepted,
            invalid: messages.contactInvalid,
            refused: messages.contactRefused,
            unexpected: messages.contactUnexpected,
            rateLimited: messages.contactRateLimited,
            providerDown: messages.contactProviderDown,
            noAnswer: messages.contactNoAnswer,
          }}
        />

        {/* WHAT THIS PAGE STORES, SAID BEFORE IT IS STORED. `/privacy` is a
            `[SOON]` stub until H12 and the retention job is L7, so this is the
            only page that can carry the sentence today — and a form that
            collects a name, an address and a message while the site's only
            page on the subject says nothing would be this site breaking its own
            rule on the one page where it is not a style question. The sheet
            names the same obligation under "FOLGE FÜR DIE PRIVACYSEITE". */}
        <p className="contact-notice">{messages.contactNotice}</p>
      </section>

      <JsonLd data={contactLd(resolved, localeHref(locale, "/contact"))} />
    </>
  );
}
