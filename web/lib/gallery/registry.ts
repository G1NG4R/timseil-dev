// The component inventory, as data.
//
// The build plan's acceptance criterion for this phase is "alle 15 Bauteile aus
// dem Handoff-Inventar mit allen dokumentierten Zuständen sichtbar", and the
// first thing this phase did was count them: SYS.00.04.04 of the handoff sheet
// has FOURTEEN ROWS AND SIXTEEN NAMES — two rows carry two components each
// (`SpecRail · PostCard`, `TopNav · StatusDot`). The number 15 appears only in
// docs/build-plan.md and, copied from there, in backlog.md. No sheet says it.
//
// That matters more than a table would suggest. This repository's first rule is
// that no number is invented, and an acceptance criterion counted from memory
// is exactly the defect the rule is about — the same one the G6 acceptance
// found in its own ADR ("vier Bauteile ohne Aufrufer" was five). So the list
// lives here, transcribed from the sheet, and the test holds it against the
// sixteen names rather than against a count anyone typed. ADR 0049.
//
// WHY IN lib/ AND NOT IN THE PAGE. `npm test` reads lib/** and styles/** only,
// and Node strips types but does not transform JSX, so nothing in a .tsx can be
// asserted about (ADR 0044, ADR 0048). A gallery whose inventory lived in its
// own markup would be a checklist that nothing checks.

/** Where an entry comes from, because the three lists are not the same list. */
export type Origin =
  /** SYS.00.04.04 of the handoff sheet — the sixteen the criterion is about. */
  | "inventory"
  /** SYS.00.07.04 of the Foundations sheet: the generic parts, shipped as
   *  reference implementations under docs/design/code/components/. */
  | "foundations"
  /** Invented in G6 for the state language. In no sheet, because the sheets
   *  predate them — ADR 0048 named them and this is where they become visible. */
  | "g6";

export interface Part {
  /** The name exactly as its sheet writes it. */
  readonly id: string;
  /** The ORT column: where the component belongs on the finished site. */
  readonly where: string;
  /** The ZUSTÄNDE column, verbatim. Not our words — the sheet's. */
  readonly states: readonly string[];
  readonly origin: Origin;
  /**
   * The file, relative to web/, or `null` when nothing has been built yet.
   *
   * `module` and `owedBy` are mutually exclusive and one of them is always set;
   * registry.test.ts holds that. A part cannot be both built and owed, and a
   * part that is neither is a name nobody is responsible for.
   */
  readonly module: string | null;
  /** The phase that owes it, or `null` once it exists. */
  readonly owedBy: string | null;
  /** Whether the gallery renders a live example of it. */
  readonly preview: boolean;
  /**
   * Why there is no live example, for a part that exists anyway.
   *
   * STATE.05: "DISABLED SAGT WARUM: 'queued' oder '0 treffer' statt einfach
   * ausgegraut. Ein toter Zustand ohne Begründung ist ein Bug." A cell in this
   * gallery owes the same answer its components owe, so the test requires it.
   */
  readonly note: string | null;
}

/**
 * The sixteen names of SYS.00.04.04, in the sheet's own order, then the parts
 * the other two lists add.
 *
 * The ZUSTÄNDE strings are transcriptions, not translations: they are what a
 * reader can hold the rendered gallery against, and rewording them would make
 * the comparison a matter of taste.
 */
export const PARTS: readonly Part[] = [
  {
    id: "Terminal",
    where: "homepage",
    states: ["rest", "hover", "focus (caret blinkt)", "degraded (read-only)"],
    origin: "inventory",
    module: null,
    owedBy: "J1",
    preview: false,
    note: null,
  },
  {
    id: "ContributionGraph",
    where: "hero",
    states: ["loading (skeleton)", "ok", "error (cache)", "no-data"],
    origin: "inventory",
    module: null,
    owedBy: "H4",
    preview: false,
    note: null,
  },
  {
    id: "SkillRow",
    where: "SYS.01",
    states: ["rest 28 %", "hover 100 % + beleg"],
    origin: "inventory",
    module: null,
    owedBy: "H4",
    preview: false,
    note: null,
  },
  {
    id: "SystemRow",
    where: "SYS.02, work",
    states: ["rest", "hover (brackets + preview)", "aktiv", "disabled (queued)"],
    origin: "inventory",
    module: null,
    owedBy: "H5",
    preview: false,
    note: null,
  },
  {
    id: "OperationGrid",
    where: "homepage SYS.03 (30 d) · jede case study (91 d, klickbar)",
    states: ["ok", "degraded", "outage", "nodata", "selected"],
    origin: "inventory",
    module: "components/case/OpsGrid.tsx",
    owedBy: null,
    preview: true,
    // H2b built the case study half. The homepage's 30-day strip is display
    // only — the sheet is explicit that the same grammar is used there without
    // the click — and it belongs to H5 with the rest of SYS.02–04.
    note: "case study only; the homepage strip is H5",
  },
  {
    id: "MetricTile",
    where: "work, case study",
    states: ["loading", "ok", "no-data"],
    origin: "inventory",
    module: "components/ui/MetricTile.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "FilterChip",
    where: "work, blog",
    states: ["rest", "hover", "focus", "gesetzt (invertiert)", "leer (0 treffer)"],
    origin: "inventory",
    module: null,
    owedBy: "H6",
    preview: false,
    note: null,
  },
  {
    id: "TrajectoryRail",
    where: "about",
    states: ["jahr aktiv", "inaktiv", "tastatur ← →"],
    origin: "inventory",
    module: null,
    owedBy: "H7",
    preview: false,
    note: null,
  },
  {
    id: "SpecRail",
    where: "case study",
    states: ["sticky", "gelöst"],
    origin: "inventory",
    module: "components/case/SpecRail.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "PostCard",
    where: "blog",
    states: ["rest", "hover"],
    origin: "inventory",
    module: null,
    owedBy: "H9",
    preview: false,
    note: null,
  },
  {
    id: "CTA E-Mail",
    where: "homepage, about",
    states: ["rest", "hover (glow)", "focus", "active"],
    origin: "inventory",
    // Built in G3 as `.foot-mail` and rendered in every long footer; H3 is the
    // phase that owed it the other three states, and the gallery shows the
    // component itself rather than a copy of its markup.
    module: "components/FooterLead.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "ContactForm",
    where: "contact",
    states: ["rest", "fokus", "feldfehler", "sending", "accepted (202 + id)", "failed (502/429)"],
    origin: "inventory",
    module: null,
    owedBy: "H8",
    preview: false,
    note: null,
  },
  {
    id: "ThemeSwitch",
    where: "fußzeile, alle seiten",
    states: ["7 paletten", "aktiv", "hover", "focus"],
    origin: "inventory",
    module: "components/ThemeSwitch.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "ErrorBudgetGame",
    where: "404",
    states: ["idle", "running", "paged"],
    origin: "inventory",
    module: null,
    owedBy: "H10",
    preview: false,
    note: null,
  },
  {
    id: "TopNav",
    where: "global",
    states: ["rest", "hover (scramble)", "focus", "aktiv"],
    origin: "inventory",
    module: "components/SiteHeader.tsx",
    owedBy: null,
    preview: false,
    // Built in G3 and seen on every page of the site. This gallery has a root
    // layout of its own precisely so that it does NOT carry the site chrome —
    // a header nested inside a page would be a second <header> and a worse
    // example than the real one two clicks away.
    note: "built in G3 · rendered on every page of the site, not nested here",
  },
  {
    id: "StatusDot",
    where: "global",
    states: ["live", "degraded", "offline", "puls 2.6s"],
    origin: "inventory",
    module: "components/state/StatusDot.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },

  // ── Foundations sheet, SYS.00.07.04 ────────────────────────────────────────
  // Generic parts rather than page parts, which is why they are not in the
  // inventory above. G7 brings them into the tree because the open finding
  // about letter-spacings is parked on exactly these files (chrome.css) and
  // cannot be settled while they live only in a read-only reference.
  {
    id: "Button",
    where: "überall",
    states: ["primary", "secondary", "ghost", "hover", "focus", "disabled"],
    origin: "foundations",
    module: "components/ui/Button.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "Field",
    where: "contact, suche",
    states: ["rest", "gefüllt", "fehler", "hinweis", "mehrzeilig"],
    origin: "foundations",
    module: "components/ui/Field.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "SectionHead",
    where: "alle abschnitte",
    states: ["mit meta", "ohne meta"],
    origin: "foundations",
    module: "components/ui/SectionHead.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },

  // ── The state language, G6 ─────────────────────────────────────────────────
  // In no sheet: the sheets predate them. ADR 0048 built them and said in as
  // many words that five of them had no caller and that "gerendert werden sie
  // zuerst von G7s Galerie". This is that gallery.
  {
    id: "StateWord",
    where: "tabellenspalten mit eigener zustandsspalte",
    states: ["die acht schlüssel aus words.ts, ohne punkt"],
    origin: "g6",
    module: "components/state/StatusDot.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "EmptyState",
    where: "work, blog",
    states: ["mit filtern", "ohne filter", "mit weg zurück"],
    origin: "g6",
    module: "components/state/EmptyState.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "ErrorPanel",
    where: "jede seite mit einem gemessenen wert",
    states: ["ohne antwort", "mit status", "mit retry-zeile", "ohne letzte messung"],
    origin: "g6",
    module: "components/state/ErrorPanel.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "LoadingLines",
    where: "jede seite mit einem gemessenen wert",
    states: ["zwei zeilen", "sechs zeilen"],
    origin: "g6",
    module: "components/state/LoadingLines.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "DegradedNotice",
    where: "jede seite bei teilausfall",
    states: ["mit einer einschränkung", "mit dreien"],
    origin: "g6",
    module: "components/state/DegradedNotice.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
  {
    id: "NoData",
    where: "in einer zelle, deren label schon sagt was fehlt",
    states: ["— NO DATA"],
    origin: "g6",
    module: "components/state/NoData.tsx",
    owedBy: null,
    preview: true,
    note: null,
  },
];

/** Built means: there is a file. Not "planned", not "designed". */
export function isBuilt(part: Part): boolean {
  return part.module !== null;
}

/** The parts of one list, in the order the sheet writes them. */
export function partsOf(origin: Origin): Part[] {
  return PARTS.filter((part) => part.origin === origin);
}

/**
 * How far the inventory is, as two counted numbers.
 *
 * The gallery prints this and the phase's acceptance quotes it. Neither of them
 * types a number: the criterion is "all of them", and "all" is `total`.
 */
export function inventoryProgress(): { built: number; total: number } {
  const inventory = partsOf("inventory");
  return { built: inventory.filter(isBuilt).length, total: inventory.length };
}
