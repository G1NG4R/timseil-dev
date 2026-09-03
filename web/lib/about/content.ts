// What the About page says about the operator and the machine, as data.
//
// WHY IT IS DATA AND NOT MARKUP: `npm test` reads `lib/**` and cannot load a
// `.tsx`, and the single most important assertion this phase makes is about
// these strings rather than about their arrangement — see `placeholders()`
// below and content.test.ts.
//
// EVERY LINE HERE IS A CLAIM ABOUT A RUNNING SYSTEM, AND THREE OF THE SHEET'S
// DID NOT SURVIVE IT. The design note calls SYS.05.02 "die About-Version der
// Architektur-Platte — belegt die Positionierung, statt sie zu behaupten". Held
// against the repository, the section it draws contains three assertions
// nothing here can back:
//
//   1. `SERVICES · 4 containers`. compose.yaml defines ten services. The number
//      is not off by a rounding, it is a different number, and it is the kind
//      that would go stale the next time one is added.
//   2. `WATCH · Nightly dump off the box. The restore has been tested.` The
//      backup job is build plan L6 and the restore drill is L6 and M5. Neither
//      has run. This is the eight invented boot lines of ADR 0058 in another
//      costume.
//   3. `ONE VPS · [SPEC] · ADMINISTERED BY ME`. Handled in sections.ts: the
//      bracket wants the host's size, and that does not go outward.
//
// AND THE CORRECTION FOR (2) IS SILENCE, NOT `[SOON]`. Everywhere else on this
// site an absent thing says so and names the phase that brings it — the
// terminal frame, the empty sections, the gallery inventory. A tile reading
// "BACKUPS [SOON]" would say, on a public page, that this host is not backed up
// yet. CLAUDE.md forbids exactly that sentence. So the tile names what is
// measured today and the gap is recorded in backlog.local.md instead.

/** One row of the OPERATOR card: a label, a value, and whether it is the accent. */
export interface OperatorRow {
  readonly label: string;
  readonly value: string;
  /**
   * `ROUTE` is the one value the sheet draws in signal rather than in body ink.
   * It is a flag and not a colour, because invariant 8 puts the colour in a
   * stylesheet and this file has no business naming one.
   */
  readonly accent?: true;
}

/**
 * The card in the hero's right column.
 *
 * `LANGUAGES` IS NOT HERE. The sheet draws it as `[LANGUAGES]`, and a row whose
 * value is a bracket is a row that says nothing in seven characters of
 * nomenclature. ADR 0055 refused two image placeholders on the case study with
 * the argument that carries unchanged, and dropping the row costs the card
 * nothing: the grid has no fixed row count.
 */
export const OPERATOR: readonly OperatorRow[] = [
  { label: "NAME", value: "Tim Seil" },
  { label: "ROLE", value: "Backend · DevOps" },
  { label: "BASE", value: "Luxembourg · UTC+1" },
  { label: "PRIMARY", value: "Go · TypeScript" },
  { label: "ROUTE", value: "Self-taught", accent: true },
  { label: "MAIL", value: "contact@timseil.dev" },
];

/** One tile of SYS.05.02: the axis, what stands on it, and what that buys. */
export interface StackTile {
  readonly label: string;
  readonly title: string;
  readonly detail: string;
}

/**
 * The four tiles, with the sheet's own English wherever the repository can
 * stand behind it.
 *
 * TWO TITLES MOVED, AND BOTH FOR THE SAME REASON. `4 containers` became the
 * arrangement rather than a count, because the count is wrong and a right one
 * would need a generated artefact this content phase has no business building
 * (`tools/gen-compose-excerpt.mjs` quotes ONE service, by design). `Probe ·
 * logs · backups` lost its third word and its second sentence, because the
 * probe and the retention are stage F and shipped, and the backup is not.
 */
export const STACK: readonly StackTile[] = [
  {
    label: "EDGE",
    title: "Reverse proxy · TLS",
    detail: "Certificates renew themselves. Nothing else terminates TLS.",
  },
  {
    label: "SERVICES",
    title: "Compose, health-gated",
    detail: "Web, API, database, and the collectors that watch them.",
  },
  {
    label: "PIPELINE",
    title: "Push → live",
    detail: "Lint, test, build, deploy, verify. Rollback is one tag.",
  },
  {
    label: "WATCH",
    title: "Probe · logs · metrics",
    detail: "A probe measures this address on a schedule, and the answers are kept.",
  },
];

/** One of the four principles of SYS.05.03. */
export interface Principle {
  readonly title: string;
  readonly detail: string;
}

/**
 * Four principles, in the sheet's order, in the sheet's own English.
 *
 * THE NUMERALS ARE NOT IN THIS TABLE. `01` through `04` are the position and
 * nothing else, so they are derived by `stationNumber` — a typed ordinal beside
 * a list is a second opinion about the order, and K-26 is what that costs.
 */
export const PRINCIPLES: readonly Principle[] = [
  {
    title: "Read the source before the docs",
    detail:
      "Documentation tells you the intent. The code tells you the behaviour. " +
      "When the two disagree, production follows the code.",
  },
  {
    title: "Ship it where it can break",
    detail:
      "A project on a laptop teaches you syntax. A project on a public address " +
      "teaches you timeouts, certificates, backups, and your own blind spots.",
  },
  {
    title: "Measure before you claim",
    detail:
      "Every number on this site has something producing it. If I cannot point " +
      "at the source, the number does not go up.",
  },
  {
    title: "Write the incident down",
    detail:
      "The outage is not the interesting part. The cause, the fix, and the thing " +
      "I would set up differently next time are what carry over.",
  },
];

/** The ordinal a list position carries, two digits, as the sheet draws it. */
export function stationNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/**
 * Every bracketed placeholder in a set of strings, in the order they appear.
 *
 * THIS IS THE PHASE'S OWN GUARD, and it exists because the argument for
 * dropping a placeholder is only as good as the thing that notices the next one
 * being added. The About sheet carries eleven of them — `[Y1]`, `[LANGUAGES]`,
 * `[SPEC]`, `[BOOK OR PAPER]`, `[ONE LINE]`, `[PORTRAIT PHOTO]`, `[99.98%]` and
 * more — and every one of them is a sentence this page would otherwise be
 * making up.
 *
 * `[SOON]` IS NOT ONE OF THEM. It is the site's own word for a named absence —
 * lib/state/words.ts owns it, the chrome has printed it since G3 — and it is
 * exactly the opposite of a placeholder: it says that nothing is there. So it
 * is excluded by name rather than by pattern, and a second exception would have
 * to be argued for here rather than slipped into a regular expression.
 */
export function placeholders(strings: readonly string[]): readonly string[] {
  const found: string[] = [];
  for (const value of strings) {
    for (const match of value.matchAll(/\[[^\]]*\]/g)) {
      if (match[0] !== "[SOON]") found.push(match[0]);
    }
  }
  return found;
}
