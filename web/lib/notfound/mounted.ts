// The routes the 404 offers as a way out.
//
// FIVE, NOT FOUR, AND THE SHEET SETTLES IT AGAINST ITS OWN NOTE. The design
// note says "vier gemountete Routen mit Beschreibung", and the artboard beside
// it draws `grid-template-columns:repeat(5,1fr)`. The Routes and Paths sheet
// decides between them in words: "Routenliste der 404 um `/contact` ergänzen"
// and "Die 404 listet alle Routen, sonst ist sie eine Sackgasse mit
// Dekoration." The drawing and the later sheet agree, so five it is — and the
// count the router trace prints is taken from this list rather than typed, so
// the sentence cannot disagree with the thing under it.
//
// `/privacy` AND `/imprint` ARE MOUNTED AND ARE NOT HERE, and H12b and H12c
// took the second half of that reason away without changing the answer. They
// are footer business: the chrome already puts them on this page, as it does on
// every other, and app/global-not-found.tsx links both from its own foot. That
// was always the first reason; the second one — that both were `[SOON]` stubs,
// and offering a stub as a way out of a dead end is a second dead end — expired
// in two steps, and as of H12c neither page is a stub.
//
// THE LIST STAYS AT FIVE ANYWAY, and the argument is the drawing. The sheet
// draws `repeat(5,1fr)`, layout.css folds that to three under 1080 and to one
// under 720, and notfound.gen.json measures those track counts. Seven entries
// in five tracks would look broken and would still be green. A visitor who has
// hit a 404 wants the way back to the site, not its legal apparatus.

/** The addresses, in the sheet's order. Language-free: the page maps each one
 *  through `localeHref()` so `/de/nonsense` offers German addresses. */
export const MOUNTED_ROUTES = ["/", "/work", "/blog", "/about", "/contact"] as const;

export type MountedRoute = (typeof MOUNTED_ROUTES)[number];

/** What the trace claims the router had to match against.
 *
 *  Derived rather than written. The sheet's own line said four while the
 *  drawing said five; a constant here would be a third opinion that could drift
 *  from both. */
export const MOUNTED_COUNT = MOUNTED_ROUTES.length;
