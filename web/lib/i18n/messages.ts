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
// says `en` so the caller can put `lang="en"` on the block. In G5 that is every
// block on `/de` and `/fr`, because both overlays are empty — which is exactly
// the acceptance criterion the build plan writes for this phase: "Switcher
// funktioniert auch mit leeren Sprachen."
//
// When P6 fills a language, the attribute disappears on its own. Nothing has to
// remember to remove it.

import type { NavId } from "../chrome.ts";
import { de } from "./messages/de.ts";
import { en, type Messages } from "./messages/en.ts";
import { fr } from "./messages/fr.ts";
import { DEFAULT_LOCALE, type Locale } from "./routes.ts";

export type { Messages };

export interface Dictionary {
  /** The strings to render. Always complete — never a half-filled language. */
  readonly messages: Messages;
  /** The language they came from. Equal to the route's language when that
   *  language is complete, `en` otherwise. */
  readonly resolved: Locale;
}

const OVERLAYS: Record<Locale, Partial<Messages>> = { en, de, fr };

/** Does this language carry every key, with something in it?
 *
 *  A present-but-empty string counts as missing. A translator who deletes the
 *  text and leaves the key would otherwise ship a blank label, and a blank
 *  label is the UI equivalent of a number nobody measured. */
export function isComplete(overlay: Partial<Messages>): boolean {
  return Object.keys(en).every((key) => {
    const value = overlay[key as keyof Messages];
    return typeof value === "string" && value.length > 0;
  });
}

export function resolveMessages(locale: Locale): Dictionary {
  const overlay = OVERLAYS[locale];
  if (locale !== DEFAULT_LOCALE && isComplete(overlay)) {
    return { messages: { ...en, ...overlay }, resolved: locale };
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
