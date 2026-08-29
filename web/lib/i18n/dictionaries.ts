// The one call a Server Component makes to find out what language it is in.
//
// WHY THERE IS NO PROP DRILLING HERE. `next/root-params` exists for exactly this
// shape: the language is a segment ABOVE the root layout, so every Server
// Component in the tree can read it without being handed it. The alternative —
// threading `locale` and `messages` from the layout through SiteHeader and
// SiteFooter into FooterMeta — is four signatures that all say the same thing
// and one of them eventually forgets.
//
// IT IS NOT FREE FOR CLIENT COMPONENTS, and that is the boundary this file
// draws. Root parameter getters do not run in Client Components, so LangMenu,
// NavLinks, MobileMenu and ThemeSwitch cannot call this — they take the handful
// of strings they need as props, and read the language off `usePathname()`,
// which after the rewrite is the address the visitor sees. Two readers, one
// answer: the root parameter and the first path segment are the same character.
//
// CALLING IT SEVERAL TIMES IN ONE RENDER IS FINE. There is no I/O behind it —
// one root-parameter read and a pure merge of two objects. It is a lookup, not
// a fetch, and it is deliberately not memoised: a cache here would be a second
// thing that can be wrong.

import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import { type Dictionary, resolveMessages } from "./messages.ts";
import { type Locale, isLocale } from "./routes.ts";

export interface RouteDictionary extends Dictionary {
  /** The language of the ROUTE — what goes in `<html lang>`. */
  readonly locale: Locale;
  /** The value to put on a block's `lang` attribute, or `undefined` when the
   *  strings are in the route's own language and no attribute is needed.
   *
   *  In G5 this is `"en"` on `/de` and `/fr`, because both dictionaries are
   *  empty. When P6 fills one, it becomes `undefined` there by itself. */
  readonly textLang: Locale | undefined;
}

export async function getDictionary(): Promise<RouteDictionary> {
  const value = await lang();

  // THIS IS THE ONLY THING STANDING BETWEEN `/es/about` AND AN ENGLISH PAGE AT
  // A SPANISH ADDRESS. `generateStaticParams` in the root layout names the
  // three languages, but under Cache Components it cannot be made exhaustive —
  // `dynamicParams = false` is refused there — so an unknown segment does reach
  // a component, and this is the component it reaches first. It is also what
  // narrows what next/root-params hands back to a `Locale`.
  //
  // AND SINCE G7 THAT VALUE CAN BE `undefined`. The gallery at /dev/components
  // is the first page outside `app/[lang]/`, so the root parameter is no longer
  // present on every route and the generated type says so. It never reaches
  // here undefined — this function is only called from inside the [lang] tree —
  // but the type is right and the guard absorbs it rather than asserting it
  // away.
  if (!isLocale(value)) notFound();

  const { messages, resolved } = resolveMessages(value);
  return {
    locale: value,
    messages,
    resolved,
    textLang: resolved === value ? undefined : resolved,
  };
}
