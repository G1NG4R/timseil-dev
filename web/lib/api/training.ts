// What the homepage reads off one `/api/training` answer.
//
// IT IS HERE AND NOT IN lib/home/ FOR lib/api/systems.ts's REASON, and the two
// files are deliberately the same shape: one endpoint, one file, every
// judgement about what its numbers MEAN, and nothing that imports `next/*` — so
// `node --test` can reach all of it. lib/home/sections.ts is the other kind of
// file, an order this page fixes for itself; nothing in here is ours to fix.
//
// THIS ENDPOINT IS WHERE INVARIANT 2 BECOMES VISIBLE. A track has no state
// column: `v_track_states` counts the systems that prove it, and ADR 0018 says
// what that leaves for this side of the wire — "H4 rendert den Baum, wie er
// kommt: Reihenfolge, Zustände und Belegzeilen sind serverseitig entschieden,
// die Oberfläche schreibt sie groß und sortiert nicht nach." So there is no
// sort in this file, no count that the answer already carries, and no branch
// that decides a state. What is here is spelling.
//
// THE EMPTY ROW IS THE NORMAL ONE. Nine of the twenty-two tracks have no
// evidence at all at launch, and they are the reason the endpoint exists in
// this shape — a log that dropped them would look fuller than the systems
// behind it. Every function below is written for that row first.
//
// EVERY FIELD IS READ DEFENSIVELY THOUGH THE TYPE IS GENERATED, the rule
// lib/api/values.ts carries: the generated type describes the contract, not the
// bytes, and ADR 0035's overlapping start puts a real case behind the
// difference.

import { NO_DATA, TRACK_MARKS, isTrackState, type TrackState } from "../state/words.ts";

import type { GetBody } from "./client.ts";
import { finiteNumber, nonEmpty } from "./values.ts";

/** The whole log, as the contract answers it. */
export type Training = GetBody<"/api/training">;

/**
 * The line under a track's name: a prefix, and what it points at.
 *
 * TWO FIELDS AND NOT ONE STRING, because the sheet colours them apart — the
 * prefix is dim, the systems are bright, and on hover only the second half
 * lifts. A component that received `"SHIPPED IN → 02 TIMSEIL-DEV"` would have to
 * split it again to draw it.
 */
export interface EvidenceLine {
  /** `RUNS IN`, `SHIPPED IN`, `RUNNING IN`, `PLANNED IN`, `NO SYSTEM YET`. */
  readonly prefix: string;
  /**
   * The systems, or the note that stands in for them, or `null`.
   *
   * `null` IS NOT AN ERROR HERE. `NO SYSTEM YET` is already a complete
   * sentence; when the answer carries no note either, the row says that much
   * and stops rather than printing an arrow into nothing.
   */
  readonly text: string | null;
}

/** One track: a name, what it is in, and what proves it. */
export interface TrackView {
  readonly name: string;
  /**
   * `null` when the answer carried a state this build does not know.
   *
   * INVARIANT 1 RATHER THAN A GUESS. A word from a contract newer than this
   * container is not a track state we may render, and mapping it onto the
   * nearest one we do know would be an invented claim about somebody's skill.
   * The row keeps its name, says `— NO DATA` where the word goes, and draws no
   * bar. ADR 0035's overlapping start is when this happens.
   */
  readonly state: TrackState | null;
  /** How many of the four bar segments are filled. `0` for an unknown state. */
  readonly steps: number;
  readonly evidence: EvidenceLine;
}

/** One module card: its number, its name, and its tracks in the server's order. */
export interface ModuleView {
  readonly no: string;
  readonly title: string;
  readonly tracks: readonly TrackView[];
}

/**
 * The prefix each state gives its evidence line.
 *
 * FIVE PREFIXES FOR FOUR STATES, and the fifth is not a state at all: an empty
 * `evidence` array wins over whatever the track is in, because "nothing to
 * point at" is the more specific fact. Today that is nine of twenty-two rows.
 *
 * THE SHEET WRITES THE `learning` CASE TWICE — `TOUCHED IN → 02 RELAY (TOKEN
 * SIGNING)` in one row and `RUNNING IN → 04 TIMSEIL.DEV (UPTIME MONITOR)` in
 * another, for the same state. One of them had to go: two spellings of one
 * prefix are two rows that look like different kinds of evidence and are not.
 * `RUNNING IN` is the one kept — `TOUCHED IN` describes how much of the system
 * the track accounts for, which is a judgement no column carries. Recorded as a
 * sheet finding rather than settled quietly.
 */
const PREFIX: Record<TrackState, string> = {
  core: "RUNS IN",
  applied: "SHIPPED IN",
  learning: "RUNNING IN",
  queued: "PLANNED IN",
};

/** What the line says when the array is empty, whatever the state. */
const NO_EVIDENCE = "NO SYSTEM YET";

/**
 * The prefix for a row that has systems but a state this build cannot name.
 *
 * Neutral on purpose. The four in `PREFIX` each say what the evidence MAKES the
 * track, and that is the half a newer contract has taken away; this one says
 * only what the rows are. `NO SYSTEM YET` would be plainly false about a row
 * that names two.
 */
const UNKNOWN_PREFIX = "EVIDENCE";

/**
 * One evidence row, spelled the way the sheet spells it.
 *
 * `02 TIMSEIL-DEV (API, HEALTH ENDPOINT)` — the system's number, its id, and
 * the detail in brackets. Uppercased here rather than in CSS because the api
 * speaks lowercase and the interface shouts (handbook ch. 14), and because a
 * `text-transform` cannot be read back by a test that asks what the row says.
 *
 * THE SHEET WRITES `TIMSEIL.DEV` AND THIS WRITES `TIMSEIL-DEV`, which is a
 * one-character divergence with a reason. `Evidence` carries `systemId` — the
 * slug — and no display name; the slug is what `/work/timseil-dev` uses and
 * what every other surface on this site shows. Inventing the dot would mean
 * mapping slugs to names in the browser off a second endpoint, for punctuation.
 */
function evidenceRow(row: unknown): string | null {
  const raw = (row ?? {}) as Record<string, unknown>;
  const no = nonEmpty(raw.systemNo);
  const id = nonEmpty(raw.systemId);
  if (id === null) return null;

  const head = no === null ? id.toUpperCase() : `${no} ${id.toUpperCase()}`;
  const detail = nonEmpty(raw.detail);
  return detail === null ? head : `${head} (${detail.toUpperCase()})`;
}

/**
 * The evidence line for one track.
 *
 * The middle dot joins several systems, which is the sheet's separator and the
 * one this site already uses in the meta bar. With one system it never appears;
 * with six it is the whole line — `RUNS IN → 02 RELAY · 03 FEEDHOUND · 04
 * TIMSEIL-DEV` — and the day that happens the mobile artboard wants it
 * abbreviated. That is not this phase's problem and it is written down.
 */
export function evidenceLine(track: unknown): EvidenceLine {
  const raw = (track ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.evidence) ? raw.evidence : [];
  const state = isTrackState(raw.state) ? raw.state : null;

  const systems = rows.map(evidenceRow).filter((row): row is string => row !== null);

  if (systems.length === 0) {
    // The note is the api's word for what stands in place of a system, and the
    // contract sets it only in this branch. Absent, the prefix stands alone.
    const note = nonEmpty(raw.note);
    return { prefix: NO_EVIDENCE, text: note === null ? null : note.toUpperCase() };
  }

  return { prefix: state === null ? UNKNOWN_PREFIX : PREFIX[state], text: systems.join(" · ") };
}

/** One track, read defensively. `null` when the row has no name to show. */
export function trackView(track: unknown): TrackView | null {
  const raw = (track ?? {}) as Record<string, unknown>;
  const name = nonEmpty(raw.name);
  if (name === null) return null;

  const state = isTrackState(raw.state) ? raw.state : null;

  return {
    name,
    state,
    steps: state === null ? 0 : TRACK_MARKS[state].steps,
    evidence: evidenceLine(track),
  };
}

/**
 * The five module cards, in the order the answer put them in.
 *
 * NO SORT, AND THAT IS D5 OF THIS PHASE. `ORDER BY module_no, sort_order` is
 * part of the answer rather than a convenience (ADR 0018) — it is also what
 * keeps the ETag stable. The sheet draws the cards `01 · 02 · 04 · 03 · 05`
 * because DevOps has six tracks and that balances the row; on this page the
 * number is the order, the same rule HOME.01 states for the sections above.
 */
export function modules(body: Training | null): readonly ModuleView[] {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;
  const list = Array.isArray(raw.modules) ? raw.modules : [];

  const views: ModuleView[] = [];
  for (const entry of list) {
    // Not named `module`: Next refuses that identifier in application code, and
    // the rule is older than this file (@next/next/no-assign-module-variable).
    const card = (entry ?? {}) as Record<string, unknown>;
    const no = nonEmpty(card.no);
    const title = nonEmpty(card.title);
    if (no === null || title === null) continue;

    const tracks = (Array.isArray(card.tracks) ? card.tracks : [])
      .map(trackView)
      .filter((track): track is TrackView => track !== null);

    // A module with no tracks keeps its card. ADR 0018 kept it in the answer
    // for the same reason: "das Modul ist leer" is a different statement from
    // "das Modul gibt es nicht", and only one of them is true here.
    views.push({ no, title, tracks });
  }

  return views;
}

/**
 * The line over the log: what it is, how big it is, and where it comes from.
 *
 * `SELF-TRACKED · 22 TRACKS · EVIDENCE: 01 SYSTEM · SOURCE: /api/training`
 *
 * BOTH NUMBERS ARE THE ANSWER'S, NOT A COUNT TAKEN HERE. ADR 0018 decided that
 * on the other side of the wire and gave the reason this side has to honour:
 * the api counts the distinct systems of exactly the rows it serves, so "the
 * line above the list cannot disagree with the list". Counting the tree again
 * here would rebuild the second source of truth that argument removed — and it
 * would put the disagreement in the one place it shows.
 *
 * `UPDATED [DATE]` IS NOT IN THIS LINE, and the sheet draws it. The only
 * timestamp the contract carries is `generatedAt`, which
 * api/internal/training/training.go fills AFTER computing the ETag: it is the
 * moment this answer was assembled, not the day the log last changed. Printed
 * as UPDATED it would move on every reload while nothing had moved, which is
 * the class of number this whole site is an argument against. The sheet means
 * the `updated` field of its own `progress.json` draft, and no column holds it.
 *
 * The words are nomenclature and stay English — the same call `lib/home/
 * sections.ts` makes for `SYS.02 SELECTED WORK`, and the reason no count on
 * this page has ever been a dictionary key.
 */
export function trainingMeta(body: Training | null): string {
  const raw = (body ?? {}) as unknown as Record<string, unknown>;

  // `finiteNumber` and not a guard written here: lib/api/values.ts exists
  // because two copies of a guard this small are how the copies start
  // disagreeing, and the day somebody tightens it for the case study is the day
  // this one would keep the old rule.
  const tracks = finiteNumber(raw.trackCount);
  const systems = finiteNumber(raw.evidenceSystems);

  const parts = ["SELF-TRACKED"];
  parts.push(tracks === null ? `${NO_DATA} TRACKS` : `${String(tracks)} TRACKS`);
  parts.push(
    systems === null
      ? `EVIDENCE: ${NO_DATA}`
      : `EVIDENCE: ${pad(systems)} ${systems === 1 ? "SYSTEM" : "SYSTEMS"}`,
  );
  parts.push("SOURCE: /api/training");

  return parts.join(" · ");
}

/**
 * Two digits, the way every identifier on this site is written.
 *
 * `SYS.01`, `02 TIMSEIL-DEV`, `01 SYSTEM` — the padding is the house style and
 * the sheet uses it in the same line. It stops at two on purpose: a hundredth
 * system is a nicer problem than a mis-aligned column.
 */
function pad(value: number): string {
  return value < 10 && value >= 0 ? `0${String(value)}` : String(value);
}
