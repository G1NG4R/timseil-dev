/**
 * The seven widths, in one place, because they are one list.
 *
 * CLAUDE.md, "Prüfbreiten": 1440 · 1081 · 1079 · 1024 · 899 · 719 · 390 — every
 * switch from both sides. 1081/1079 and 900/899 are pairs on purpose: they sit
 * one pixel apart around a breakpoint, so a rule that fires at the wrong
 * comparison is caught rather than straddled.
 *
 * The heights are not a measurement of anything and are chosen to be tall
 * enough that a page is not scrolled by accident.
 */
export const WIDTHS = [1440, 1081, 1079, 1024, 899, 719, 390] as const;

export type Width = (typeof WIDTHS)[number];

/** Below this the mobile menu button exists and the desktop nav does not. */
export const MOBILE_BREAKPOINT = 900;

export function heightFor(width: Width): number {
  return width < MOBILE_BREAKPOINT ? 844 : 900;
}

/**
 * A log entry. H9a — the sixth page with a spec of its own.
 *
 * THE OLDEST ENTRY, NOT THE NEWEST, and the choice is about which state is on
 * the screen. `001-…` has no previous entry, so its foot draws the sheet's one
 * empty state without anything having to be arranged; the newest entry draws
 * the other half of the same row, and blog-post.spec.ts visits it by name for
 * that. A slug is hard-coded here for the reason CASE_STUDY is: the rig has no
 * api, and a list read at test time would be a second implementation of
 * lib/content/posts.ts.
 */
export const BLOG_POST = "/blog/001-zero-downtime-measured-not-claimed";

/** The newest entry, whose foot has no NEXT. */
export const BLOG_POST_NEWEST = "/blog/021-the-counter-i-could-not-prove";

/**
 * The routes that exist today.
 *
 * Stage H builds thirteen pages and this list grows with them. It is a list
 * rather than a crawl because a crawl cannot tell a route that is missing from
 * a route that was never meant to be there, and the point of an accessibility
 * sweep is to be exhaustive over something stated.
 */
export const ROUTES = [
  "/",
  "/about",
  "/work",
  // H1. The first route with a segment in it, and the first one that is allowed
  // to be indexed besides `/`. content/case-studies is the list of slugs that
  // exist; there is one.
  "/work/timseil-dev",
  "/blog",
  // H9a. The first entry, and it is the OLDEST rather than the newest on
  // purpose: `001-…` is the one post whose foot draws the empty state on the
  // PREVIOUS side, so an accessibility sweep over this route sweeps the state
  // as well as the page. The newest entry's own empty state is blog-post.spec's
  // to drive, because it can navigate to it.
  BLOG_POST,
  "/contact",
  "/privacy",
  "/imprint",
] as const;

/** The case study every width test drives. One system has a page today. */
export const CASE_STUDY = "/work/timseil-dev";

/** The homepage. H3 — the second route with a spec of its own. */
export const HOME = "/";

/** The work index. H6 — the third. */
export const WORK = "/work";

/** `/contact`. H8 — the fifth page with a spec of its own, and the only route
 *  on this site that a browser POSTs to. */
export const CONTACT = "/contact";

/**
 * The two widths the Blog Post sheet draws.
 *
 * The same two About and Contact have, and the Intermediate Widths sheet says
 * why in one sentence that names this page: "Fliesstext, Blog, About, Contact
 * und Legal fliessen, dort ist nichts zu entscheiden." There is no 1024 frame
 * for a page whose only fixed column is a 196px rail.
 */
export const BLOG_POST_DRAWN_WIDTHS = [1440, 390] as const;

/**
 * The two widths the Contact sheet draws.
 *
 * Two, like About and the homepage, and the Intermediate Widths sheet declines
 * a third IN WRITING rather than by omission: "Fliesstext, Blog, About, Contact
 * und Legal fliessen, dort ist nichts zu entscheiden." The 1024 frames exist
 * for pages with a fixed column to rebuild, and the one fixed column on this
 * page — the 520px TX trace — is drawn at 1440 and gone below 1080, which is a
 * switch this file already lists rather than a frame the sheet owes.
 */
export const CONTACT_DRAWN_WIDTHS = [1440, 390] as const;

/**
 * Where the two-column rows collapse, from the Intermediate Widths sheet.
 *
 * 1080 is not a round number chosen for tidiness: the case study's spec rail is
 * the component that sets it. 400px rail + 80px gap + 517px of reading measure
 * (68 characters at 15px Geist) is 997, in a content column that is the window
 * minus 80 — so the row breaks at 1077, rounded up so that every two-column
 * component in the site switches at one width.
 */
export const RAIL_BREAKPOINT = 1080;

/**
 * The four switches layout.css owns, in the order it declares them.
 *
 * They are the ONLY widths at which this site is allowed to change shape, and
 * that is a rule the Intermediate Widths sheet states rather than a summary of
 * the stylesheet: "EIN SCHALTER FÜR ALLE ZWEISPALTER: 1080 gilt für Hero,
 * Fallstudien-Hero, Spec-Rail, Constraints und Architektur gemeinsam. Kein
 * Bauteil bekommt seinen eigenen Wert, auch wenn er rechnerisch günstiger
 * wäre."
 *
 * Each is the FIRST width at which the wider layout no longer applies — the
 * media queries are written `max-width: 1079`, `899`, `719`, `559`, so the
 * change happens between `n` and `n - 1`.
 */
export const SWITCHES = [1080, 900, 720, 560] as const;

/**
 * The content column, as the sheet tabulates it.
 *
 * `LAYOUT.03`: `width: min(1160px, 100% - 80px)`. Above 1240 the column stands
 * at 1160 and the margins grow; from 1240 down the margin is 40 and the column
 * follows the window. The sheet is explicit that 1240 is not a switch — "der
 * Punkt, an dem sich die beiden Grenzen treffen" — so it needs no media query
 * and appears in no protocol.
 *
 * 390 is the exception and it is a real rule: below 560 the column is
 * `calc(100% - 44px)`, which is the mobile artboard's 22px margin on each side.
 *
 * TRANSCRIBED, NOT DERIVED. lib/chrome.test.ts states the reason: a table the
 * implementation reads is not an oracle, it is a second copy of the answer.
 * `column()` below computes the same numbers a different way, and sweep.spec.ts
 * holds the two against each other.
 */
export const COLUMN_TABLE: readonly { viewport: number; column: number; margin: number }[] = [
  { viewport: 1440, column: 1160, margin: 140 },
  { viewport: 1280, column: 1160, margin: 60 },
  { viewport: 1240, column: 1160, margin: 40 },
  { viewport: 1080, column: 1000, margin: 40 },
  { viewport: 1024, column: 944, margin: 40 },
  { viewport: 960, column: 880, margin: 40 },
  { viewport: 900, column: 820, margin: 40 },
  { viewport: 390, column: 346, margin: 22 },
];

/** The formula, so the sweep can check between the table's rows as well as on them. */
export function column(viewport: number): number {
  if (viewport < 560) return viewport - 44;
  return Math.min(1160, viewport - 80);
}

/**
 * The widths a sheet actually draws the case study at.
 *
 * THREE, NOT TWO, and the third was found in H1b. `case-study.spec.ts` says in
 * its header that "five of the seven widths have no drawing to be compared
 * against" — that was one artboard short. `Case Study Template` draws 1440 and
 * 390; `Intermediate Widths` draws the case study a third time at 1024
 * (artboard `#1c`, `data-screen-label="Fallstudie 1024"`), which is the frame
 * that annotates the single-column rebuild.
 *
 * So four of the seven checked widths have no drawing: 1081, 1079, 899, 719.
 * They are covered by the sweep instead, which asks a different question — not
 * "does this match a picture" but "does this obey the arithmetic of its grid".
 */
export const DRAWN_WIDTHS = [1440, 1024, 390] as const;

/**
 * The widths a sheet draws the HOMEPAGE at. Two, and the Intermediate Widths
 * sheet says why there is no third in the same breath as it draws one for the
 * case study: "DIE STARTSEITE FEHLT ABSICHTLICH: ihr Umbau ist der einfachste
 * von allen — Terminal unter den Hero-Text, Reihenfolge bleibt. Die Zahl dafür
 * steht im Register, ein Bild hätte nichts hinzugefügt."
 */
export const HOME_DRAWN_WIDTHS = [1440, 390] as const;

/**
 * Where the homepage changes shape. ALL FOUR SINCE H5c, and the fourth took
 * three phases to arrive because everyone predicted it from the wrong section.
 *
 * 560 turns table rows into cards — `.work-row`, `.sys-row`, `.log-row`.
 *
 * H3 WROTE THAT NONE OF THOSE WAS ON THIS PAGE "UNTIL H5 FILLS SYS.02 AND
 * SYS.04", AND H5a FOUND THAT REASON TO BE THE WRONG ONE. SYS.02 is built and
 * `.sys-row` still never appears here, because this rig runs a production build
 * with NO API — playwright.config.ts says so — and a system list with no answer
 * renders an EmptyState rather than rows. The case study's sweep is unaffected
 * only because its five metric tiles draw `— NO DATA` and stay in the document;
 * a list has nothing to draw one of.
 *
 * AND 560 TURNED OUT NOT TO BE `.sys-row`'s SWITCH ANYWAY. It resolves at 1080 —
 * six tracks carry 526px that will not shrink, so below that the description
 * column collapses and at 560 the row is wider than its container. That is
 * measured, in layout.css beside the rule.
 *
 * `.sys-row`'s SWITCH IS THEREFORE STILL NOT MEASURED HERE. It is measured where
 * the rows exist — e2e/gallery.systems.spec.ts, at /dev/components — which is
 * the arrangement `home.sheet.spec.ts` uses for ten of its measurements and
 * H2b's finding one page over: a rule about a component has to be checked where
 * the component is.
 *
 * SO THE EDGE CAME FROM `.log-row`, WHICH IS THE ONE ROW ON THIS PAGE THAT DOES
 * NOT NEED AN API. SYS.04 reads content/posts out of the repository, and the rig
 * has the repository — so three real rows stand here in every run, they switch
 * at 560, and the sweep can finally see an edge that has been declared in
 * layout.css since G1 with nothing to move.
 *
 * WHICH IS ALSO WHY THE OLD PARAGRAPH IS GONE. It said a fourth entry here would
 * report "there is no api in this rig" rather than "a switch is missing". That
 * was true of `.sys-row` and it is not true of this one: `.log-row` is on the
 * page for the same reason at every width, so the edge it makes is a fact about
 * the stylesheet and not about the fixture.
 */
export const HOME_SWITCHES = [1080, 900, 720, 560] as const;

/**
 * The widths a sheet draws the WORK INDEX at. Three, like the case study and
 * unlike the homepage: the Work Index sheet draws 1440 and 390, and the
 * Intermediate Widths sheet adds a 1024 frame of its own — "1024 · Work Index —
 * Vorschauspalte weg, Name gewinnt 154px", which is the frame that annotates
 * the five-track rebuild.
 */
export const WORK_DRAWN_WIDTHS = [1440, 1024, 390] as const;

/**
 * Where `/work` changes shape. THREE OF THE FOUR, and the missing one is a fact
 * about this rig rather than about the page.
 *
 * 1080 collapses the header grid — the deck and the four stat tiles stop being
 * two columns. 900 is the chrome, ADR 0044. 720 drops the display step to 34.
 *
 * 560 IS NOT HERE BECAUSE NOTHING ON THIS PAGE ANSWERS TO IT, and that is H5a's
 * finding for `.sys-row` arriving at the second row on this site: the rig runs
 * a production build with NO API — playwright.config.ts says so — and a system
 * list with no answer renders an EmptyState rather than rows. `.work-row` is
 * therefore never in the document on `/work`, at any width.
 *
 * AND THE ROW'S OWN SWITCHES ARE MEASURED WHERE IT EXISTS. H6 moved
 * `.work-row` off 560 and onto 900 after measuring it — layout.css carries the
 * arithmetic — so the row has two switches, 1080 and 900, and both are checked
 * in e2e/gallery.work.spec.ts against the only rows this rig can produce. A
 * fourth entry in this list would report "there is no api here" and call it a
 * missing switch.
 */
export const WORK_SWITCHES = [1080, 900, 720] as const;

/** `/about`. */
export const ABOUT = "/about";

/**
 * The widths a sheet draws ABOUT at. TWO, like the homepage and unlike the
 * other two pages — and here it is not an omission the Intermediate Widths
 * sheet leaves unexplained but one it states: "Fliesstext, Blog, About,
 * Contact und Legal fliessen, dort ist nichts zu entscheiden." The 1024 frame
 * exists for pages with a fixed column to rebuild; this page has none.
 */
export const ABOUT_DRAWN_WIDTHS = [1440, 390] as const;

/**
 * Where `/about` changes shape. TWO OF THE FOUR, and unlike `/work` neither
 * absence is a fact about the rig — this page reads no endpoint, so everything
 * it draws is in the document at every width.
 *
 * 1080 is `.hero`, which this page inherits rather than declares: layout.css
 * has carried one hero row since G1, and H3 deleted the second geometry it was
 * handed rather than keep a rule nobody could reach.
 *
 * 900 IS THIS PAGE'S OWN AND IT WAS DERIVED, NOT DRAWN. The sheet draws four
 * tiles at 1440 and two at 390 and says nothing about where they swap;
 * layout.css carries the arithmetic and the measurement. The principle grid
 * takes the same switch, which the same comment argues for rather than assumes.
 *
 * 720 is the display step, K-08 — `h1` goes 62 to 34, which the sheet draws at
 * both of its widths.
 *
 * 560 IS NOT HERE AND NOTHING ON THIS PAGE ANSWERS TO IT. `.col` narrows its
 * margin there for every page at once, and layout.sweep.spec.ts checks that
 * once against the sheet's table rather than eleven times.
 */
export const ABOUT_SWITCHES = [1080, 900, 720] as const;
