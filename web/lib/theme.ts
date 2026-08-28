// The seven palettes, the one storage key, and the script that has to run
// before the first paint.
//
// NOTHING FROM `next/*` IN HERE, and no DOM access at import time — the same two
// rules lib/correlation.ts follows, and for the same reason: `node --test` reads
// this file directly, and the snippet below is the thing most worth testing in
// the whole phase. What touches `document` sits in named functions the component
// calls; what decides anything is pure.
//
// TERMINAL NOIR HAS NO ID, and that is the design's shape rather than an
// omission. The six ids below are the six `[data-theme]` blocks in tokens.css;
// Noir is `:root` itself. So "no attribute" and "Terminal Noir" are the same
// state, and the switch's Noir button removes the attribute instead of setting
// one. ADR 0043 — this only works because G2 dropped the
// `prefers-color-scheme` block: while it existed, removing the attribute on a
// light machine landed on Gruvbox Light rather than on Noir.

/** Invariant 9, one of exactly two keys. The other is `ts404.best`, in H10. */
export const THEME_KEY = "ts.theme";

/** The six named palettes. Terminal Noir is the absence of all of them. */
export const THEME_IDS = [
  "mocha",
  "amber",
  "phosphor",
  "tokyo",
  "latte",
  "gruvbox",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Reads as a type guard, but the reason it exists is that the value comes from
 *  the visitor's own storage. An unknown `data-theme` matches no selector today,
 *  so writing it through would be harmless — right up until a selector exists. */
export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" && (THEME_IDS as readonly string[]).includes(value)
  );
}

/**
 * The anti-flash script, as the exact string the browser will run.
 *
 * A CONSTANT RATHER THAN A FUNCTION, on purpose: L4 needs a stable text to hang
 * a nonce or a hash on, and a text that is assembled per render can be neither.
 *
 * The whitelist is BUILT FROM `THEME_IDS` rather than written out beside it. A
 * second list would be a second place to add the eighth palette, and the one
 * that gets forgotten is always the one nobody looks at. styles are irrelevant
 * here: the script does one thing, before any of them apply.
 *
 * The `try` is not defensive dressing. Safari in private mode throws on the
 * getter itself, and a throw here happens before React exists to catch it — the
 * page would render with no theme and no error anyone can see.
 */
export const THEME_SNIPPET =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `if(${JSON.stringify([...THEME_IDS])}.indexOf(t)>-1)` +
  `document.documentElement.dataset.theme=t;}catch(e){}})();`;

// THE THEME LIVES ON THE HTML ELEMENT, NOT IN REACT, and the three functions
// below are the whole of what that costs.
//
// It has to live there: ThemeScript writes the attribute before React exists,
// and every utility on the page is a `var(--…)` that reads it. React state
// holding a second copy would be a second source, and the first one to be wrong
// after a back/forward navigation.
//
// So this is an external store in React's own sense, and the switch subscribes
// to it with useSyncExternalStore. The handoff drew `useState('')` plus a
// `useEffect` that corrects it after mount; React 19's linter refuses that shape
// now — "Calling setState synchronously within an effect can trigger cascading
// renders" — and it is right about the reason, not just the symptom. Backlog,
// ADR 0043.

const listeners = new Set<() => void>();

/** The subscribe half of useSyncExternalStore. Only our own clicks move this
 *  value, so there is no platform event to attach to — `applyTheme` is the
 *  notification. */
export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** What the snippet (or a previous click) left on the html element. Returns a
 *  primitive, so useSyncExternalStore's Object.is check is stable without a
 *  cache. */
export function currentTheme(): ThemeId | null {
  const value = document.documentElement.dataset.theme;
  return isThemeId(value) ? value : null;
}

/** `null` means Terminal Noir, which is the attribute being gone. */
export function applyTheme(id: ThemeId | null): void {
  const html = document.documentElement;
  if (id === null) delete html.dataset.theme;
  else html.dataset.theme = id;
  for (const listener of listeners) listener();
}

/** Same shape, and the same `try` for the same Safari reason. Choosing Noir
 *  clears the key rather than storing a name for "no name". */
export function storeTheme(id: ThemeId | null): void {
  try {
    if (id === null) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, id);
  } catch {
    // A visitor with storage blocked still gets the theme, just not the memory
    // of it. Failing the click over that would be the worse trade.
  }
}
