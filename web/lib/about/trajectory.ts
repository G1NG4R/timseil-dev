// The six stations of SYS.05.01, as data.
//
// WHY THERE ARE NO YEARS, AND WHY THAT IS NOW A DECISION RATHER THAN A GAP. The
// sheet labels five of the six `[Y1]`–`[Y5]` and the sixth `NOW`, and its own
// design note says what the brackets are for: "Alle Jahre [Y1–Y5] … sind
// Platzhalter — die Inhalte der Rail sind meine Struktur, deine Fakten." H7b
// answered that with ordinals because nothing in this repository carried a date
// for a station and a timeline asserts two things — WHEN and IN WHAT ORDER —
// only the second of which could be backed.
//
// U5 KEEPS THE ORDINALS AND CLOSES THE QUESTION. The stations below are a
// person's path, so the dates exist; they are simply not what this rail is for.
// A year would be the one figure on this page with nothing running behind it,
// and the page's whole argument is that there is no such figure. So the label
// stays the position — the notation this page already speaks, where
// `SYS.05.01`–`04` number its sections and `01`–`04` number the principles one
// section down — and H7b's note that "K2 swaps ordinals for years by editing
// this file" is withdrawn rather than carried. ADR 0080.
//
// AND IT COLLIDES WITH THE SYSTEM NUMBERS, SO THE TWO ARE KEPT APART BY SHAPE.
// `01` and `02` also name SYSTEMS on this site. A bare number is a station; a
// number WITH A NAME is a system — `02 timseil.dev` in a shipped cell, never a
// bare `02`. trajectory.test.ts holds that apart rather than hoping.

/** One station: where it sits, what it is called, and what it can prove. */
export interface Station {
  /** Stable across renders, used to tie a radio to its label and its panel. */
  readonly key: string;
  /** What the rail prints above the dot. The position, or `NOW` for the last. */
  readonly label: string;
  /** The line under the dot — short, because six of them share a row. */
  readonly caption: string;
  /** The panel's heading. */
  readonly title: string;
  /**
   * The panel's prose.
   *
   * IT IS A `string` SINCE U5, AND THE `null` IS NOT COMING BACK. Five of six
   * were `null` from H7b until U5, and the panel printed `[SOON]` in their
   * place with one sentence saying whose the paragraphs were. U5 is the phase
   * that wrote them, so the absence has no case left to make and the type stops
   * allowing it — a station without prose is now a compile error rather than a
   * rendered apology.
   */
  readonly body: string;
  /**
   * What was picked up here. Nomenclature, so inline rather than translated.
   *
   * COMPONENT NAMES ON FIVE STATIONS AND A PRACTICE ON ONE. The service desk is
   * the exception and it is the honest one: it hands over a habit rather than a
   * tool, and a product name there would look exactly like the backed ones
   * beside it while standing on nothing.
   */
  readonly tags: readonly string[];
  /**
   * The system this station shipped, or `null`.
   *
   * `slug` IS RESOLVED BY THE PAGE, not here, and the page's answer decides
   * whether the cell is a link or a name. Two stations ship a system and only
   * `timseil.dev` has a case study: ADR 0079 §2 gives the cluster none, so its
   * cell prints `01 talos-prod` and does not link — the same treatment `/work`
   * gives that row. Invariant 5 is about where an `<a>` points, and a name is
   * not one.
   */
  readonly shipped: { readonly slug: string; readonly label: string } | null;
}

/**
 * The six, in the order they happened.
 *
 * THE HOMELAB COMES FIRST, AND THAT IS THE CORRECTION THIS PHASE MADE LAST.
 * Every draft had it after the service desk, because that is the order a CV
 * suggests: job, then hobby. It is the wrong way round here — the hypervisor at
 * home came first and is the reason the service desk happened at all, which
 * makes it the one station the rest of the rail hangs off rather than a detour
 * in the middle of it.
 *
 * WHAT THE SHEET DREW HERE AND WHAT BECAME OF IT. Its six stations are a
 * different person's path: `First lines of code`, `Fundamentals, the hard way`,
 * `First service in public`, `Go, and the container habit`, `Own
 * infrastructure`, `Platform work`, shipping five systems of which this
 * repository declares two. Stage U's job is that the page says what its systems
 * can back (ADR 0079), and a trajectory is the one component where that means
 * replacing the content outright rather than correcting it. The divergence from
 * `docs/design/` is deliberate and the sheets are not edited.
 *
 * THE CLUSTER'S TAGS ARE SPELLED THE WAY `stack.yaml` SPELLS THEM, read through
 * `api/internal/seed/stack.gen.json` — the same file `StackTiles` prints one
 * section down. That is why the last row says `CLOUDNATIVEPG` and not `CNPG`:
 * two spellings of one component on one page is the drift U3's acceptance found
 * a page over, and trajectory.test.ts now asks the same question of this row
 * that content.test.ts asks of the tiles.
 *
 * AND NO TAG DESCRIBES HOW THE CLUSTER IS REACHED OR SEGMENTED. ADR 0079 draws
 * that boundary in writing: component names may stand, the network may not.
 * Unsure counts as yes.
 */
export const STATIONS: readonly Station[] = [
  {
    key: "s1",
    label: "01",
    caption: "Homelab",
    title: "Homelab",
    body:
      "This starts at home and not at work: hardware in a cupboard and a " +
      "hypervisor on it, machines to take apart on purpose. It is what made " +
      "the service desk possible — the job came after the lab rather than the " +
      "other way around, and the lab is still running.",
    // NOT A BAUTEIL-ROW LIKE THE OTHERS, AND DELIBERATELY NOT. `LXC` and `ZFS`
    // are components; nothing above them says how the machines are reached or
    // cut up, which is the boundary ADR 0079 draws for every sentence in stage
    // U. Unsure counts as yes, so the row stops at what runs.
    tags: ["PROXMOX", "LXC", "ZFS"],
    shipped: null,
  },
  {
    key: "s2",
    label: "02",
    caption: "Helpdesk",
    title: "Helpdesk",
    body:
      "Then the service desk, and not a degree: other people's machines, " +
      "other people's deadlines, and a queue that does not care which layer " +
      "the fault is in. It is where the habit of reading the error before " +
      "guessing at it comes from.",
    // THE ONE ROW ON THIS RAIL THAT NAMES NO TECHNOLOGY, and the exception is
    // the honest one. Every other station picked up a component; a service desk
    // hands over a practice, and a product name here would look exactly like
    // the backed ones beside it while standing on nothing. The words say what
    // the work was and claim no tool.
    tags: ["TROUBLESHOOTING", "USER SUPPORT", "HARDWARE"],
    shipped: null,
  },
  {
    key: "s3",
    label: "03",
    caption: "First website",
    title: "First website",
    body:
      "The first thing built rather than repaired: a storefront on Shopify " +
      "Hydrogen, put together with an AI assistant at hand. It taught the " +
      "shape of a modern front end, and that a page which works on a laptop " +
      "has not yet met a certificate, a cold cache or a slow connection.",
    tags: ["SHOPIFY HYDROGEN", "AI-ASSISTED DEV"],
    shipped: null,
  },
  {
    key: "s4",
    label: "04",
    caption: "Own VPS",
    title: "Own VPS",
    // THE ONE BODY THAT SURVIVED H7b, because every clause in it still points at
    // something a reader can open: the case study draws the request path and
    // quotes the compose file, the operation grid counts the days, and the log
    // carries the post-mortems. Nothing here is a number, which is why it can be
    // prose rather than a measurement.
    body:
      "One VPS instead of a hosted platform: the proxy, the certificates, the " +
      "logs and the restarts are mine. The site you are reading is that " +
      "machine describing itself — every figure on it comes from the system " +
      "that produces it, and the outages are written down rather than waited out.",
    tags: ["DOKPLOY", "DOCKER", "TRAEFIK"],
    shipped: { slug: "timseil-dev", label: "02 timseil.dev" },
  },
  {
    key: "s5",
    label: "05",
    caption: "Talos lab",
    title: "Talos lab",
    body:
      "Kubernetes without a shell underneath it: an immutable, API-driven " +
      "operating system, an address pool of its own, and a repository the " +
      "cluster reads instead of a console I click. The lab is where that stack " +
      "was learned while nothing depended on it yet.",
    tags: ["TALOS", "METALLB", "FLUX"],
    shipped: null,
  },
  {
    key: "s6",
    label: "NOW",
    caption: "Bare-metal cluster",
    title: "Bare-metal cluster",
    // THE STATION THIS WHOLE STAGE IS ABOUT, and the last sentence is the one
    // that keeps it honest: `talos-prod` is seeded `in_build`, so invariant 3
    // gives it no metrics, and saying so here costs nothing a reader cannot
    // check against `/api/systems`.
    body:
      "The same stack on hardware I own, and the system the role on this page " +
      "rests on: declared in Git, reconciled by Flux, with the database and " +
      "the backups run as operators. It is in build and not live, because " +
      "nothing public is measured on it yet — and on this site a state is a " +
      "measurement rather than a feeling.",
    tags: ["TALOS", "FLUX", "SOPS", "METALLB", "CLOUDNATIVEPG", "VELERO"],
    shipped: { slug: "talos-prod", label: "01 talos-prod" },
  },
];

/** The station the rail rests on: the last one, which is `NOW`. */
export function restingStation(): number {
  return STATIONS.length - 1;
}

/**
 * How far the fill line has run when station `index` is chosen, as a percentage.
 *
 * THE CENTRE OF THE DOT, NOT THE EDGE OF THE COLUMN. Each station owns `1/n` of
 * the rail and its dot sits at the start of its own column, so the fill has to
 * reach `(index + 0.5) / n` for the line to end under the mark rather than past
 * it. It is written here rather than in the stylesheet so a test can hold the
 * six numbers against the arithmetic instead of against six hand-typed widths.
 *
 * THE SHEET MEASURES THIS WITH `getBoundingClientRect()` AND THIS DOES NOT. Its
 * script reads the dot's box on every paint; that is a measurement taken before
 * the display face has loaded and then never again, because the sheet has no
 * resize handling. A percentage of the track is the same line with nothing to
 * go stale.
 */
export function fillPercent(index: number): number {
  return ((index + 0.5) / STATIONS.length) * 100;
}
