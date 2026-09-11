// The eight lines of the privacy page's live readout, and the browser-shaped
// hole they are read through.
//
// WHAT THE PANEL IS FOR. The sheet calls it "der Moment der Seite": instead of
// describing what a server learns about a visitor in the abstract, the page
// shows the visitor their own request. The argument only works if every line is
// real, which makes this the one file on the site where a convincing-looking
// constant would do the most damage.
//
// NOTHING FROM `next/*` AND NO JSX IN HERE, the rule lib/clock.ts and
// lib/state/words.ts follow: `npm test` reads lib/** directly, Node strips types
// but not JSX, and the branch worth testing is what happens when the browser
// answers "I do not know" to half of these questions.
//
// THE SOURCE IS AN INTERFACE AND NOT `window`, for the same reason. A module
// that reached for globals could only be tested in a browser, and the case that
// matters — a browser that knows nothing — is the one hardest to produce in one.
//
// THE SHEET'S REQUEST LINE IS THE ONE THING HERE THAT IS NOT TRANSCRIBED.
// Its mock writes `GET /privacy HTTP/2 · 200` as a literal. The method is true
// of any navigation and the path is readable, but a browser cannot see the
// status code of the document it is already displaying, and `HTTP/2` is a guess
// about a connection that may well be HTTP/1.1 or h3. On a page whose entire
// argument is "nothing here is invented", three quarters of a line typed by
// hand is the worst possible place to start. So the protocol is MEASURED — the
// Navigation Timing API reports the one actually negotiated — and the status is
// simply not claimed. Invariant 1 has no exception for a line that would look
// good.

/** Text emphasis for a readout line. THREE VALUES AND NO ALERT, which is the
 *  sheet's design note turned into a type: "Kein Alert-Rot. Nichts hier ist ein
 *  Fehlerzustand." A visitor's own user agent is not a failure, and the state
 *  vocabulary's `Tone` in lib/state/words.ts carries `alert` — so this is its
 *  own small union rather than a reuse that would make the wrong colour
 *  spellable. */
export type Emphasis = "dim" | "body" | "ink";

/** One line of the panel. */
export interface ReadoutField {
  /** The label in the left column. Nomenclature, never translated. */
  readonly key: string;
  readonly value: string;
  readonly emphasis: Emphasis;
}

/**
 * Everything this module needs from a browser, and nothing else.
 *
 * Every field is optional-shaped on purpose: a privacy-hardened browser, a
 * minimal embedded webview and a headless run all answer `undefined` to some of
 * these, and the page has to stay true rather than stay pretty.
 */
export interface ReadoutSource {
  readonly userAgent: string | undefined;
  readonly languages: readonly string[] | undefined;
  readonly language: string | undefined;
  readonly referrer: string | undefined;
  readonly path: string | undefined;
  /** The protocol the navigation actually negotiated — `h2`, `h3`, `http/1.1`.
   *  Empty or absent where the entry is not exposed, and then the line simply
   *  does not claim one. */
  readonly protocol: string | undefined;
  readonly screenWidth: number | undefined;
  readonly screenHeight: number | undefined;
  readonly windowWidth: number | undefined;
  readonly windowHeight: number | undefined;
  /** A function rather than a string because `Intl.DateTimeFormat()` throws on
   *  some locked-down configurations, and the caller should not have to
   *  remember that. */
  readonly timeZone: () => string | undefined;
  readonly now: () => number;
}

/** What a line shows before anything has been read, and what every line shows
 *  in HTML that reached a browser with scripting turned off.
 *
 *  NOT `— NO DATA`. That phrase means "this was measured and there is no
 *  value", and it is invariant 1's word. Here the value exists and simply has
 *  not been read yet, and borrowing the stronger phrase for a weaker situation
 *  is how a vocabulary of seven words stops meaning seven things. */
export const PENDING = "—";

/** The label of the line that is deliberately not a measurement. */
export const IP_KEY = "IP";

/** The sheet's own wording, and it is the honest half of the panel: the server
 *  writes the address down, the browser cannot read it, and pretending
 *  otherwise would be the one lie on a page about not lying. */
export const IP_VALUE = "[recorded server-side — your browser cannot read it]";

/** How much user agent is shown. The sheet slices at 96; the ellipsis below is
 *  this file's, because a string cut without a mark reads as a short string. */
export const USER_AGENT_MAX = 96;

const KEYS = [
  IP_KEY,
  "TIMESTAMP",
  "REQUEST",
  "USER-AGENT",
  "REFERRER",
  "LANGUAGE",
  "VIEWPORT",
  "TIME ZONE",
] as const;

/** How many lines the panel has, counted rather than typed.
 *
 *  The sheet prints `8 FIELDS · NOTHING ELSE` under the panel, and a literal
 *  `8` beside a list of eight is the defect lib/notfound/mounted.ts already
 *  names: the sheet's own note said four routes while its drawing said five.
 *  A count that disagrees with the thing it counts is worse than no count. */
export const FIELD_COUNT = KEYS.length;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function viewport(source: ReadoutSource): string {
  const screen = `${String(source.screenWidth ?? 0)}×${String(source.screenHeight ?? 0)}`;
  const window = `${String(source.windowWidth ?? 0)}×${String(source.windowHeight ?? 0)}`;
  return `${screen} screen · ${window} window`;
}

function language(source: ReadoutSource): string {
  const list = source.languages;
  if (list !== undefined && list.length > 0) return list.join(", ");
  const single = source.language;
  return single !== undefined && single.length > 0 ? single : PENDING;
}

function request(source: ReadoutSource): string {
  // GET is not a guess: a document navigation a visitor arrived at by following
  // a link, typing an address or restoring a tab is a GET. The path is read.
  // The protocol is appended only when the browser reported one.
  const path = source.path !== undefined && source.path.length > 0 ? source.path : PENDING;
  const protocol = source.protocol;
  return protocol !== undefined && protocol.length > 0 ? `GET ${path} · ${protocol}` : `GET ${path}`;
}

function timeZone(source: ReadoutSource): string {
  let zone: string | undefined;
  try {
    zone = source.timeZone();
  } catch {
    // A browser that refuses to name its zone is answering the question, and
    // the answer is that it will not say. That is a dash, not a crash.
    return PENDING;
  }
  return zone !== undefined && zone.length > 0 ? zone : PENDING;
}

function timestamp(source: ReadoutSource): string {
  // UTC by definition via `toISOString`, the same argument lib/clock.ts makes:
  // the alternative reads correctly on CI, which runs on UTC, and wrongly
  // everywhere else.
  return `${new Date(source.now()).toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/**
 * The eight lines, from one browser, once.
 *
 * PURE, AND IT READS NOTHING ITSELF. Given the same source it returns the same
 * eight strings, which is what lets the test below hand it a browser that knows
 * nothing and read the answer rather than a stack trace.
 */
export function readFields(source: ReadoutSource): readonly ReadoutField[] {
  const userAgent = source.userAgent;
  const referrer = source.referrer;

  return [
    { key: IP_KEY, value: IP_VALUE, emphasis: "dim" },
    { key: "TIMESTAMP", value: timestamp(source), emphasis: "ink" },
    { key: "REQUEST", value: request(source), emphasis: "body" },
    {
      key: "USER-AGENT",
      value:
        userAgent !== undefined && userAgent.length > 0
          ? truncate(userAgent, USER_AGENT_MAX)
          : PENDING,
      emphasis: "body",
    },
    {
      key: "REFERRER",
      value:
        referrer !== undefined && referrer.length > 0
          ? referrer
          : "(none — typed or bookmarked)",
      emphasis: "body",
    },
    { key: "LANGUAGE", value: language(source), emphasis: "body" },
    { key: "VIEWPORT", value: viewport(source), emphasis: "body" },
    { key: "TIME ZONE", value: timeZone(source), emphasis: "body" },
  ];
}

// ── The store ──────────────────────────────────────────────────────────────
//
// The same shape lib/clock.ts uses and for the same reason: React renders
// `getServerSnapshot` during hydration, so the server pass and the hydration
// pass are identical BY CONSTRUCTION and the measured values only arrive in the
// render after commit. There is no divergent tree at any point, which is a
// different thing from suppressing a warning.
//
// WHAT IS DIFFERENT FROM THE CLOCK: this reading does not tick. It is the record
// of one request, and a timestamp that advanced while being read would be a
// clock rather than a log line — the sheet draws `tail -f` and means the
// metaphor, not a feed. So `subscribe` never notifies, and the browser snapshot
// is computed once and then frozen in place.

const PLACEHOLDER: readonly ReadoutField[] = KEYS.map((key) => ({
  key,
  // The IP line is the one value that is known without a browser, because it is
  // not a measurement — it is a sentence about where the measurement lives. It
  // is therefore true in the server HTML too, and showing it there rather than
  // a dash means the panel's most important line is the one line that never
  // depends on scripting.
  value: key === IP_KEY ? IP_VALUE : PENDING,
  // Every pending line is dim, the IP one included: nothing has been read yet,
  // so nothing has earned emphasis.
  emphasis: "dim",
}));

let live: readonly ReadoutField[] | null = null;

/** No-op, and a stable module-level reference so React does not re-subscribe on
 *  every render. Nothing about a finished request changes. */
export function subscribeReadout(): () => void {
  return () => {
    /* nothing to unsubscribe from: this reading happens once */
  };
}

/**
 * The reading, computed on first call and cached.
 *
 * THE CACHE IS LOAD BEARING AND NOT AN OPTIMISATION. `useSyncExternalStore`
 * compares snapshots with `Object.is`; a fresh array on every call is never
 * equal to the last one, and React re-renders forever — "The result of
 * getSnapshot should be cached to avoid an infinite loop". readout.test.ts pins
 * the identity rather than the contents.
 */
export function readoutSnapshot(makeSource: () => ReadoutSource): readonly ReadoutField[] {
  // A THUNK AND NOT A SOURCE, because React calls `getSnapshot` on every render
  // and building a source means touching `navigator`, `screen` and the
  // Navigation Timing entry each time. After the first call the answer is
  // already known, so the thunk is simply never invoked again.
  live ??= readFields(makeSource());
  return live;
}

/** The pending eight, on the server and during hydration alike. Always the same
 *  frozen array, for the reason above. */
export function readoutServerSnapshot(): readonly ReadoutField[] {
  return PLACEHOLDER;
}

/** Whether a snapshot is the un-read one. The panel says why it is dashes only
 *  when it is, and a comparison by reference is exact where a scan for dashes
 *  would call a visitor with no referrer and no time zone "not read yet". */
export function isPending(fields: readonly ReadoutField[]): boolean {
  return fields === PLACEHOLDER;
}

/** For tests only: forget the cached reading. Nothing in the app calls it — a
 *  request is read once per page load, and a page load is a fresh module. */
export function resetReadoutForTest(): void {
  live = null;
}
