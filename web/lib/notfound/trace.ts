// What the router did with an address that resolved to nothing, as data.
//
// NOTHING FROM `next/*` IN HERE and no DOM — lib/i18n/routes.ts's two rules,
// for lib/i18n/routes.ts's reason: `proxy.ts` holds one constant from this file
// and the page holds the rest, but every decision below is reachable from
// `node --test`.
//
// THE SHEET CALLS THIS PANEL THE ARGUMENT OF THE PAGE, and it is worth quoting
// because it is the difference between a trace and a decoration: "Die Seite
// bleibt in der Erzählung: Router-Trace zeigt, dass die Anfrage ankam und nur
// kein Handler passte." Nothing here is invented for effect — every line
// describes a step the request really took.
//
// ONE CORRECTION TO THE SHEET, AND IT IS A FACT RATHER THAN A PREFERENCE. The
// design notes say the trace id and the path "im Build kommen sie aus der
// Antwort der Go-API". They do not and they cannot: a 404 never reaches the
// api. Both come from `proxy.ts`, which mints them on the way in — the same two
// ids every log line in this container carries. ADR 0037.

/** The tones the log may use. Three of the four the state language already
 *  draws, by their names in styles/state.css; a line with no tone is the
 *  panel's own colour, which is what the sheet draws for the router steps. */
export type TraceTone = "alert" | "amber" | "dim";

export interface TraceLine {
  readonly text: string;
  readonly tone?: TraceTone;
}

/** The header `proxy.ts` writes the address on.
 *
 *  ALWAYS SET, NEVER ADOPTED — the rule `proxy.ts` already applies to
 *  `X-Request-Id`, and for the same reason. This value is rendered on a page,
 *  so an inbound copy would be a path a stranger chose for a page we serve. The
 *  proxy overwrites it on every request it touches, so there is nothing to
 *  adopt. */
export const REQUESTED_PATH_HEADER = "x-requested-path";

/** How much of an address is shown.
 *
 *  A scanner's URL is not bounded by anything, and this panel is the one place
 *  a stranger's bytes reach the page. Same ceiling as the terminal's input in
 *  the system handbook, and for the same reason: a 100 KB path may neither
 *  render nor wedge the tab. */
export const PATH_LIMIT = 200;

/** The address, fit to be shown.
 *
 *  IT IS TRIMMED AND ESCAPED BY REACT, NEVER INTERPRETED. It becomes a text
 *  node and nothing else — no `href`, no URL, no path segment, no
 *  `dangerouslySetInnerHTML`. The rule is the terminal's fourth: no input flows
 *  into a URL or a path. `<img src=x onerror=alert(1)>` as an address has to
 *  come out as those characters, which is the test notfound.spec.ts drives.
 *
 *  Control characters go because a newline in a log line is a second line the
 *  writer did not authorise — the same log-injection shape internal/logx
 *  refuses on the way out.
 */
export function displayPath(raw: string | null): string | null {
  if (raw === null) return null;

  const clean = raw.replace(/[\u0000-\u001F\u007F]/gu, "").trim();
  if (clean.length === 0) return null;

  return clean.length > PATH_LIMIT ? `${clean.slice(0, PATH_LIMIT)}…` : clean;
}

export interface TraceInput {
  /** The address as the visitor sent it, before any rewrite. */
  readonly path: string | null;
  /** How many routes the router had to match against. */
  readonly mounted: number;
  /** The addresses to suggest, in the order the page lists them. */
  readonly hints: readonly string[];
}

/**
 * The log the panel prints, in the sheet's order.
 *
 * THE COUNT IS PASSED IN RATHER THAN WRITTEN HERE. The sheet's own line says
 * "matching 4 mounted routes" while the artboard beside it draws five columns
 * (`grid-template-columns:repeat(5,1fr)`), and the Routes and Paths sheet
 * settles it: "Routenliste der 404 um /contact ergänzen." A number typed here
 * would be a third opinion; taking it from the list means the sentence cannot
 * disagree with the thing below it.
 *
 * `path` may be `null` — a request that reached this page without the proxy
 * having touched it has no address to show, and invariant 1 says an absent
 * measurement is absent rather than zero. The line is dropped instead of
 * printing a guess.
 */
export function routerTraceLines({ path, mounted, hints }: TraceInput): readonly TraceLine[] {
  const lines: TraceLine[] = [];

  if (path !== null) lines.push({ text: `GET ${path} HTTP/1.1` });

  lines.push(
    { text: `→ router: matching ${String(mounted)} mounted routes … no match` },
    { text: "→ static: no file at that path … miss" },
    { text: "→ handler: fallback 404", tone: "alert" },
    { text: " " },
    { text: "warn: nothing is broken — the path is empty", tone: "amber" },
    { text: `hint: try ${hints.join(" · ")}`, tone: "dim" },
  );

  return lines;
}
