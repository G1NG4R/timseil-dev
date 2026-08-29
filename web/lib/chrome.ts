// What the chrome has to know about the page it is standing on: which nav entry
// is white, and whether the footer carries the contact block.
//
// NOTHING FROM `next/*` IN HERE, and no DOM access — lib/theme.ts's two rules,
// for lib/theme.ts's reason. `usePathname()` gives a client component a string;
// everything that turns that string into a decision is below, where `node
// --test` can reach it. The components hold markup and one call each.
//
// The table these functions implement is CHR.01 EINSATZPLAN in the Chrome
// sheet. It is transcribed into chrome.test.ts rather than imported from here,
// on purpose: a table the implementation reads is not an oracle, it is a second
// copy of the answer.

import { stripLocale } from "./i18n/routes.ts";

/** The four entries, in the order the sheet fixes them.
 *
 *  LOG POINTS AT `/blog`, AND THAT IS NOT A TYPO. Consistency Check K-20:
 *  "Beschriftung überall LOG … Die Route bleibt `/blog`, weil sie geteilt und
 *  verlinkt wird." The label was unified because two words for one thing read as
 *  two things; the path was left alone because it is in other people's
 *  bookmarks. chrome.test.ts refuses both of the tidy-ups that would break it. */
export const NAV = [
  { id: "work", label: "WORK", href: "/work" },
  { id: "log", label: "LOG", href: "/blog" },
  { id: "about", label: "ABOUT", href: "/about" },
  { id: "contact", label: "CONTACT", href: "/contact" },
] as const;

export type NavId = (typeof NAV)[number]["id"];

/** Long carries the contact block and the social row; short is the meta bar
 *  alone. Both carry PRIVACY and IMPRINT — that is why short is the fallback
 *  for a route nobody planned. */
export type FooterVariant = "long" | "short";

/** SEGMENTS, NOT PREFIXES, and that is the whole defence against the one bug
 *  this file can have. `pathname.startsWith("/work")` satisfies every route in
 *  the plan and also claims `/workshop`; splitting on `/` and comparing whole
 *  segments cannot. */
function segments(pathname: string): string[] {
  return pathname.split("/").filter((part) => part.length > 0);
}

/** Which entry is white. `null` means none — the state of `/`, of the legal
 *  pages, of the 404, and of anything unplanned. */
export function activeNav(pathname: string): NavId | null {
  const seg = segments(stripLocale(pathname));
  if (seg.length === 0) return null; // "/" — the sheet: "auf / nichts aktiv"
  const first = seg[0];
  if (first === "work") return "work";
  if (first === "blog") return "log"; // the label/route split, again
  if (first === "about") return "about";
  if (first === "contact") return "contact";
  return null;
}

/** CHR.01: long on the homepage, the two indexes, a blog post and about. Short
 *  everywhere else — including everywhere the plan does not name, because short
 *  still reaches the legal pages and long would hand an unplanned route an
 *  unfinished contact block. */
export function footerVariant(pathname: string): FooterVariant {
  const seg = segments(stripLocale(pathname));
  if (seg.length === 0) return "long"; // /
  if (seg.length === 1 && (seg[0] === "work" || seg[0] === "blog" || seg[0] === "about")) {
    return "long"; // the two indexes and about
  }
  if (seg.length === 2 && seg[0] === "blog") return "long"; // a post, not a case study
  return "short";
}

/** Re-exported because G5 moved it: `stripLocale` was written here one phase
 *  early, and it belongs with the other locale logic now that `/de` and `/fr`
 *  are real. The chrome is still the loudest caller, so the name stays
 *  reachable from the file the components import. */
export { stripLocale };
