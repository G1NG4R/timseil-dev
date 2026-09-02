import Link from "next/link";

import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The way from the list to a conversation. Routes gap #06.
 *
 * THE TWO SHEETS DISAGREE AND ONLY ONE OF THEM CAN BE RIGHT. The Routes and
 * Paths matrix marks `/work → /contact` as `c` — "Querverweis im Inhalt,
 * vorhanden" — and lists it under the ten gaps it closed, with the place named:
 * "unter der Systemliste. Heute führt von der Liste nur die Nav weiter. Ein
 * Satz mit Link genügt."
 *
 * THE WORK INDEX SHEET DRAWS THAT SENTENCE AND FORGETS THE LINK. It sits in
 * exactly the right place, above the footer, and it is a `<div>` with no
 * anchor, no pointer and no hover — and it is in German, which INDEX.md's
 * correction table turns into English wherever it appears in the interface. So
 * the gap is closed on the matrix and open in the drawing, and what ships is
 * what the matrix says: a sentence WITH a link.
 *
 * THE LINK IS IN THE SENTENCE, NOT AFTER IT. The Routes sheet makes that a rule
 * of its own — "Querverweise stehen im Text, wo die Behauptung fällt — keine
 * zusätzliche Linkliste am Seitenende" — and the claim here falls on the word
 * that names the thing being offered.
 */
export function WorkContact({ href, messages }: { href: string; messages: Messages }) {
  return (
    <p className="work-contact">
      {messages.workContact}{" "}
      <Link href={href}>{messages.navContact} →</Link>
    </p>
  );
}
