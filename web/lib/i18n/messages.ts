// Which strings a route gets, and which language they actually came from.
//
// NOTHING FROM `next/*` IN HERE — dictionaries.ts is the thin layer that reads
// the route parameter, and it exists so that this file stays reachable from
// `node --test`.
//
// THE SECOND RETURN VALUE IS THE POINT. `resolved` is the language the strings
// came from, which is not always the language of the URL. The sheet forbids the
// obvious per-key merge:
//
//	KEINE HALBEN SEITEN: fehlt eine Übersetzung, zeigt die Route den
//	englischen Text mit lang="en" am Element — nicht die halbe Seite
//	auf Deutsch.
//
// So a language is all or nothing. An incomplete overlay is not blended with
// English key by key; it is set aside, English is served whole, and `resolved`
// says `en` so the caller can put `lang="en"` on the block. From G5 to U8 that
// was every block on `/de` and `/fr`, because both overlays were empty — which
// was exactly the acceptance criterion the build plan wrote for G5: "Switcher
// funktioniert auch mit leeren Sprachen."
//
// SINCE U8 IT IS `/fr` ALONE, and the French overlay is empty on purpose rather
// than on the way to being filled: ADR 0083's first decision is that a language
// nobody can proof-read is a claim without evidence. The attribute on `/de`
// disappeared on its own when the overlay filled up. Nothing had to remember to
// remove it.
//
// WHAT COUNTS AS FILLED MOVED OUT OF THIS FILE IN U8. It used to be
// `isComplete`, which walks the keys of messages/en.ts — a true answer to a
// smaller question than `<main lang>` asks, because about 3.040 words of page
// prose live outside that catalogue. complete.ts holds the whole predicate and
// ADR 0083 holds the reasoning; this file asks it and is otherwise unchanged.

import type { NavId } from "../chrome.ts";
import { OVERLAYS, languageComplete } from "./complete.ts";
import { en, type Messages } from "./messages/en.ts";
import { DEFAULT_LOCALE, type Locale } from "./routes.ts";

export type { Messages };

export interface Dictionary {
  /** The strings to render. Always complete — never a half-filled language. */
  readonly messages: Messages;
  /** The language they came from. Equal to the route's language when that
   *  language is complete, `en` otherwise. */
  readonly resolved: Locale;
}

export function resolveMessages(locale: Locale): Dictionary {
  if (locale !== DEFAULT_LOCALE && languageComplete(locale)) {
    return { messages: { ...en, ...OVERLAYS[locale] }, resolved: locale };
  }
  return { messages: { ...en }, resolved: DEFAULT_LOCALE };
}

/** The four nav labels, keyed the way lib/chrome.ts keys the entries.
 *
 *  Written out rather than derived from the id, because `navWork` from `work`
 *  is a string concatenation that TypeScript cannot check — and a fifth entry
 *  should fail to compile here rather than render an empty label. */
export function navLabels(messages: Messages): Record<NavId, string> {
  return {
    work: messages.navWork,
    log: messages.navLog,
    about: messages.navAbout,
    contact: messages.navContact,
  };
}
