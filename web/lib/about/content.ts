// What the About page says about the operator and the machine, as data.
//
// WHY IT IS DATA AND NOT MARKUP: `npm test` reads `lib/**` and cannot load a
// `.tsx`, and the single most important assertion this phase makes is about
// these strings rather than about their arrangement — see `placeholders()`
// below and content.test.ts.
//
// EVERY LINE HERE IS A CLAIM ABOUT A RUNNING SYSTEM, AND IN U4 THE SYSTEM
// CHANGED. The design note calls SYS.05.02 "die About-Version der
// Architektur-Platte — belegt die Positionierung, statt sie zu behaupten", and
// that is exactly why the section could not stay as it was: until U3 the
// evidence was the VPS, and since U3 the main evidence is talos-prod, the
// bare-metal cluster that carries the role this page claims (ADR 0079). A
// section whose job is to prove the positioning has to name the machine the
// positioning now rests on.
//
// WHAT THE SHEET DREW HERE, AND WHAT BECAME OF IT. H7a held three of its
// assertions against this repository and none survived: `SERVICES · 4
// containers` (compose.yaml defines ten), `WATCH · Nightly dump off the box.
// The restore has been tested.` (neither job had run) and `ONE VPS · [SPEC] ·
// ADMINISTERED BY ME` (the bracket wants this host's size, which does not go
// outward). U4 does not re-argue them: two of the three tiles they belonged to
// are gone, and the meta is handled in sections.ts. The record of why stays
// here because it is the reason this file carries a test at all.
//
// THE TILES ARE A GROUPING NOW, NOT A LIST. Every name under WHAT I RUN comes
// out of `stack.yaml` under `talos-prod` — the same twelve names `/work` prints
// as chips, read through `api/internal/seed/stack.gen.json`. content.test.ts
// holds each one against that file, so this is one list rendered twice rather
// than two lists that will disagree. The U3 acceptance found that exact drift
// one page over, in a fixture that called itself "transcribed from
// stack.gen.json" and had stopped being it.
//
// AND STILL NO SENTENCES. A tile says what runs, not how well it runs: the
// bodies the sheet drew are gone with the VPS they described. The correction to
// a claim about a host was silence in H7a and it is silence now — the state of
// this machine lives in backlog.local.md, never on a public page.

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
  { label: "ROLE", value: "Junior DevOps" },
  { label: "BASE", value: "Luxembourg · UTC+1" },
  { label: "PRIMARY", value: "Kubernetes · GitOps" },
  { label: "ROUTE", value: "Helpdesk → self-taught", accent: true },
  // `TOOLING` IS THE WHOLE OF WHAT THIS PAGE SAYS ABOUT THE ASSISTANT, and
  // ADR 0079 §3 is why it is a row and not a badge: "ein Etikett ist eine
  // Behauptung, eine Belegzeile und ein Commit-Trailer sind nachlesbar." It
  // stands in the same grammar as the five rows above it, it is checkable in
  // the commit history, and the skill behind it is a track in the training log
  // with its own evidence like any other. A footer reading "built with Claude
  // Code" would be the claim without the evidence.
  //
  // BEFORE `MAIL` AND NOT AFTER IT: the address is the one row that asks the
  // reader to do something, and it stays last for the same reason the contact
  // block sits at the foot of every page.
  { label: "TOOLING", value: "Claude Code" },
  { label: "MAIL", value: "contact@timseil.dev" },
];

/**
 * One tile of SYS.05.02: an axis of the cluster, and the components on it.
 *
 * `names` AND NOT A FINISHED STRING, and the reason is the test rather than the
 * markup. A joined line can only be held against `stack.gen.json` by parsing it
 * back apart, and a separator is a rendering decision: StackTiles owns the
 * ` · `, the same way the work index owns the one between its chips.
 *
 * NO `detail`. The sheet gives every tile a sentence under its title, and those
 * sentences described the VPS — "Certificates renew themselves", "Lint, test,
 * build, deploy, verify". None of them can be written about a cluster in a
 * private repository without either inventing a measurement or publishing how
 * it is wired, and ADR 0079 rules out the second. So a tile names what runs and
 * stops, which is also what makes the membership test possible.
 */
export interface StackTile {
  readonly label: string;
  readonly names: readonly string[];
}

/**
 * Six tiles, and between them exactly the twelve names `stack.yaml` carries for
 * `talos-prod`.
 *
 * THE SHEET DRAWS FOUR AND THEY WERE ABOUT A DIFFERENT MACHINE — `EDGE`,
 * `SERVICES`, `PIPELINE`, `WATCH`, the four axes of a single host running
 * compose. A cluster has more axes and fewer sentences, and ADR 0079 makes it
 * the evidence this section exists to show. The divergence is deliberate and
 * the grid that draws it is declared in about.css; `.run-grid` says why three
 * columns rather than four.
 *
 * THE LABELS ARE AXES AND THE ORDER IS THE STACK, bottom up: what the machines
 * run, how they are wired, how a request reaches them, how code arrives, where
 * the state lives, and who is watching. A reader who knows Kubernetes can check
 * that ordering against their own mental model, which is more than a reader can
 * do with an alphabetical list.
 *
 * WHAT IS NOT HERE AND IS NOT AN OVERSIGHT: no versions (no file in THIS
 * repository can be read for a version of anything running there, so every
 * number would have to be typed), no workloads (nothing on the cluster is
 * public and measured yet — it is `in_build`, invariant 3), and nothing about
 * how the cluster is reached or segmented. The last one is the boundary
 * ADR 0079 draws in writing, and U3 already held it once: the seed's networking
 * track carries `metallb` and not the routing underneath it, on the grounds
 * that "a track name is a sentence on a public page. Unsure counts as yes."
 */
export const STACK: readonly StackTile[] = [
  { label: "BASE", names: ["Talos", "Kubernetes"] },
  { label: "NETWORK", names: ["Flannel", "MetalLB"] },
  { label: "EDGE", names: ["Cloudflare Tunnel", "Traefik", "cert-manager"] },
  { label: "DELIVERY", names: ["Flux", "SOPS"] },
  { label: "DATA", names: ["CloudNativePG", "Velero"] },
  { label: "WATCH", names: ["kube-prometheus-stack"] },
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
