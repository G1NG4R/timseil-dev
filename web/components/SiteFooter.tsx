// A Server Component, and for the same reason SiteHeader is one: no dynamic
// API in the root layout, or G4's static shell stops being static.

import { FooterLead } from "@/components/FooterLead";
import { FooterLeadGate } from "@/components/FooterLeadGate";
import { FooterMeta } from "@/components/FooterMeta";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * The footer, in the two versions CHR.01 assigns.
 *
 * "DER UNTERSCHIED IST EIN BLOCK": long carries the contact block and the
 * social column, short does not. The meta bar and the legal links are on every
 * page — "sonst ist das Impressum nur über Umwege erreichbar", which is also
 * why an unplanned route falls back to short rather than to nothing.
 *
 * Long: `/`, `/work`, `/blog`, `/blog/:slug`, `/about`.
 * Short: the case studies, `/contact`, the legal pages, and the 404.
 */
export async function SiteFooter() {
  const { messages, textLang } = await getDictionary();

  return (
    <footer className="foot col" lang={textLang}>
      <FooterLeadGate>
        <FooterLead channel={messages.channel} respond={messages.respond} />
      </FooterLeadGate>
      <FooterMeta />
    </footer>
  );
}
