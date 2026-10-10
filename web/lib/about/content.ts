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
//
// U8a SPLITS THE FILE THE WAY ADR 0083's SIXTH DECISION SPLITS A ROW: "die
// Beschriftung wird übersetzt, der Datenwert und der Metrikname nicht." So the
// facts — `Tim Seil`, `Luxembourg · UTC+1`, the twelve component names — stand
// exactly once below, and every word that is a word in a language lives in
// `ABOUT_WORDS_EN` beside its German counterpart in content.de.ts. The one row
// where that line runs through the VALUE rather than the label is `ROUTE`,
// which is a sentence rather than a datum, and the types below make that the
// only one it can be.

import { type ContentBundle, resolveContent } from "../i18n/bundle.ts";
import type { Locale } from "../i18n/routes.ts";

import { ABOUT_WORDS_DE } from "./content.de.ts";

/** The rows of the OPERATOR card, in the order the card draws them. */
export const OPERATOR_KEYS = [
  "name",
  "role",
  "base",
  "primary",
  // THE BEGINNING WAS WRONG, AND THE FIX IS NOT A LONGER CHAIN. `Helpdesk →
  // self-taught` read the way a CV reads — job first, hobby after — and the
  // hypervisor at home came before the service desk and is the reason it
  // happened. The obvious repair was a third link, `Homelab → helpdesk →
  // self-taught`; measured at 390 it took TWO LINES, alone among the seven rows
  // and in the one colour the card draws in signal.
  //
  // So the row says where it started and stops. The stations are one section
  // down with a paragraph and a tag row each, and a card that recites them is
  // a second, shorter copy of the rail — which is how two surfaces start
  // disagreeing. U5 found `aboutLede` doing exactly that.
  "route",
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
  "tooling",
  "mail",
] as const;

/** One row of the OPERATOR card. */
export type OperatorKey = (typeof OPERATOR_KEYS)[number];

/** The axes of SYS.05.02, bottom up. See `STACK_NAMES` for the order's argument. */
export const STACK_KEYS = ["base", "network", "edge", "delivery", "data", "watch"] as const;

/** One tile of SYS.05.02. */
export type StackKey = (typeof STACK_KEYS)[number];

/** The four principles of SYS.05.03, in the sheet's order. */
export const PRINCIPLE_KEYS = ["source", "ship", "measure", "incident"] as const;

/** One principle. */
export type PrincipleKey = (typeof PRINCIPLE_KEYS)[number];

/**
 * What a row of the card states, where that is a datum rather than a sentence.
 *
 * `null` MEANS THE WORDS CARRY IT, and `ROUTE` is the only row it is true of.
 * The pair is checked both ways by `operatorRows`: a row with no value anywhere
 * throws rather than rendering an empty `<dd>`, and `bundleShapes` refuses a
 * language that translated a datum or left the sentence untranslated.
 */
interface OperatorFact {
  readonly value: string | null;
  /**
   * `ROUTE` is the one value the sheet draws in signal rather than in body ink.
   * It is a flag and not a colour, because invariant 8 puts the colour in a
   * stylesheet and this file has no business naming one.
   */
  readonly accent?: true;
}

/**
 * The facts on the card in the hero's right column.
 *
 * `LANGUAGES` IS NOT HERE. The sheet draws it as `[LANGUAGES]`, and a row whose
 * value is a bracket is a row that says nothing in seven characters of
 * nomenclature. ADR 0055 refused two image placeholders on the case study with
 * the argument that carries unchanged, and dropping the row costs the card
 * nothing: the grid has no fixed row count.
 *
 * NONE OF THESE SIX VALUES IS TRANSLATED, and decision 6 of ADR 0083 is why.
 * `Luxembourg` is a place and not a word about this page — the imprint spells
 * it the same way — `Junior DevOps`, `Kubernetes · GitOps` and `Claude Code`
 * name a role, two practices and a tool, and an address is an address.
 */
const OPERATOR_FACTS: Readonly<Record<OperatorKey, OperatorFact>> = {
  name: { value: "Tim Seil" },
  role: { value: "Junior DevOps" },
  base: { value: "Luxembourg · UTC+1" },
  primary: { value: "Kubernetes · GitOps" },
  route: { value: null, accent: true },
  tooling: { value: "Claude Code" },
  mail: { value: "contact@timseil.dev" },
};

/**
 * Between them exactly the twelve names `stack.yaml` carries for `talos-prod`.
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
const STACK_NAMES: Readonly<Record<StackKey, readonly string[]>> = {
  base: ["Talos", "Kubernetes"],
  network: ["Flannel", "MetalLB"],
  edge: ["Cloudflare Tunnel", "Traefik", "cert-manager"],
  delivery: ["Flux", "SOPS"],
  data: ["CloudNativePG", "Velero"],
  watch: ["kube-prometheus-stack"],
};

/** The label of a card row, and its value where the value is a sentence. */
export interface OperatorWords {
  readonly label: string;
  /** `null` wherever `OPERATOR_FACTS` carries the value. */
  readonly value: string | null;
}

/** One of the four principles of SYS.05.03. */
export interface Principle {
  readonly title: string;
  readonly detail: string;
}

/** Every word on this page that is a word in a language. */
export interface AboutWords {
  readonly operator: Readonly<Record<OperatorKey, OperatorWords>>;
  /** The axis over a tile's component names. A label, so it is translated. */
  readonly stack: Readonly<Record<StackKey, string>>;
  readonly principles: Readonly<Record<PrincipleKey, Principle>>;
}

/**
 * The page's words in English — and the shape every other language fills.
 *
 * THE FOUR PRINCIPLES ARE IN THE SHEET'S OWN ENGLISH. The numerals `01` through
 * `04` are not in this table: they are the position and nothing else, so they
 * are derived by `stationNumber` — a typed ordinal beside a list is a second
 * opinion about the order, and K-26 is what that costs.
 */
export const ABOUT_WORDS_EN: AboutWords = {
  operator: {
    name: { label: "NAME", value: null },
    role: { label: "ROLE", value: null },
    base: { label: "BASE", value: null },
    primary: { label: "PRIMARY", value: null },
    route: { label: "ROUTE", value: "Self-taught, from the lab up" },
    tooling: { label: "TOOLING", value: null },
    mail: { label: "MAIL", value: null },
  },
  stack: {
    base: "BASE",
    network: "NETWORK",
    edge: "EDGE",
    delivery: "DELIVERY",
    data: "DATA",
    watch: "WATCH",
  },
  principles: {
    source: {
      title: "Read the source before the docs",
      detail:
        "Documentation tells you the intent. The code tells you the behaviour. " +
        "When the two disagree, production follows the code.",
    },
    ship: {
      title: "Ship it where it can break",
      detail:
        "A project on a laptop teaches you syntax. A project on a public address " +
        "teaches you timeouts, certificates, backups, and your own blind spots.",
    },
    measure: {
      title: "Measure before you claim",
      detail:
        "Every number on this site has something producing it. If I cannot point " +
        "at the source, the number does not go up.",
    },
    incident: {
      title: "Write the incident down",
      detail:
        "The outage is not the interesting part. The cause, the fix, and the thing " +
        "I would set up differently next time are what carry over.",
    },
  },
};

/** The About page's words, per language. Registered in lib/i18n/complete.ts. */
export const ABOUT: ContentBundle<AboutWords> = { en: ABOUT_WORDS_EN, de: ABOUT_WORDS_DE };

/** One row of the OPERATOR card, assembled: a label, a value, and the accent. */
export interface OperatorRow {
  readonly key: OperatorKey;
  readonly label: string;
  readonly value: string;
  readonly accent?: true;
}

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
  readonly key: StackKey;
  readonly label: string;
  readonly names: readonly string[];
}

/**
 * The card, in one language.
 *
 * IT THROWS ON A ROW WITH NOTHING TO SAY, which is the kind of refusal this
 * repository already makes in lib/seo/pages.ts and in `fill`: every caller of
 * this function is prerendered, so a build error arrives before a visitor and
 * an empty `<dd>` under a label would not.
 */
export function operatorRows(words: AboutWords): readonly OperatorRow[] {
  return OPERATOR_KEYS.map((key) => {
    const fact = OPERATOR_FACTS[key];
    const said = words.operator[key];
    const value = said.value ?? fact.value;

    if (value === null) {
      throw new Error(`operator row ${key} has no value: neither the facts nor the words carry one`);
    }

    return { key, label: said.label, value, ...(fact.accent === true ? { accent: fact.accent } : {}) };
  });
}

/** The six tiles, in one language. The names are the same in every language. */
export function stackTiles(words: AboutWords): readonly StackTile[] {
  return STACK_KEYS.map((key) => ({ key, label: words.stack[key], names: STACK_NAMES[key] }));
}

/** The four principles, in one language, in `PRINCIPLE_KEYS`' order. */
export function principleList(words: AboutWords): readonly Principle[] {
  return PRINCIPLE_KEYS.map((key) => words.principles[key]);
}

/** Everything SYS.05 draws, in the route's language. */
export function aboutContentFor(locale: Locale): {
  readonly operator: readonly OperatorRow[];
  readonly stack: readonly StackTile[];
  readonly principles: readonly Principle[];
  readonly resolved: Locale;
} {
  const { value, resolved } = resolveContent(ABOUT, locale);
  return {
    operator: operatorRows(value),
    stack: stackTiles(value),
    principles: principleList(value),
    resolved,
  };
}

/** The card in English — what every page but a translated one draws. */
export const OPERATOR: readonly OperatorRow[] = operatorRows(ABOUT_WORDS_EN);

/** The tiles in English. */
export const STACK: readonly StackTile[] = stackTiles(ABOUT_WORDS_EN);

/** The principles in English. */
export const PRINCIPLES: readonly Principle[] = principleList(ABOUT_WORDS_EN);

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
