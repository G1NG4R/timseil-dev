// The two axes of the log index, as a value and a predicate.
//
// IN lib/ FOR THE REASON lib/work/filter.ts GIVES: the island keeps the
// `useState` and the click, and every judgement about what a chip or a query
// MEANS lives here, where `node --test` can reach it.
//
// TWO AXES, AND THE BUILD PLAN NAMES BOTH. H9 is "MDX, Filter, Suche, Lesemaß
// 68 Zeichen. Zwei Leerzustände im Index, einer im Beitrag." There is no third:
// the sheet's empty-state artboard echoes `TAG: KUBERNETES × · JAHR: 2025 ×`,
// but nothing on the page can set a year — its own script holds `tag` and `q`
// and nothing else, and the year separators are a grouping rather than a
// control. A third axis here would be a filter invented from a drawing.
//
// SINGLE-SELECT ON THE TAG, AND THE DECISION FALLS FOR THE SECOND TIME. The
// sheet's script holds one tag (`this.tag = e.currentTarget.dataset.chip`);
// docs/design/README.md:610 lists `activeTags: Set`. The same README lists
// `activeStacks: Set, activeStates: Set` for the Work Index, and H6b decided
// that one against the README and for the executed sheet. Deciding it the other
// way here would give one site two filter surfaces that behave differently —
// the shape this repository files as #241.

import type { PostMeta } from "../content/posts.ts";
import { tagLabel, type TagChip } from "./tags.ts";

/**
 * The sentinel of the tag axis, taken from OUTSIDE the tag alphabet.
 *
 * NOT `"all"`, WHICH IS WHAT THE SHEET'S SCRIPT USES. `lib/content/posts.ts`
 * constrains a tag to `^[a-z0-9]+(?:-[a-z0-9]+)*$`, so `*` is a string no
 * frontmatter can ever produce — while `all` is a perfectly ordinary English
 * word that a future entry could be filed under, and on the day it is, the
 * sentinel and a subject would be the same value. `ANY_STACK` did not need this
 * care because its vocabulary arrives from the api; this one arrives from prose
 * I write later, which is the half of the system that has no schema review.
 */
export const ALL_TAGS = "*";

/** Where both axes stand. */
export interface Axis {
  /** One tag key, or `ALL_TAGS`. */
  readonly tag: string;
  /** The search text, already normalised. Empty means the axis is off. */
  readonly q: string;
}

/** Nothing narrowed — the state the page loads in, and what reset returns to. */
export const NO_FILTER: Axis = { tag: ALL_TAGS, q: "" };

/** Whether anything is narrowing the list at all. */
export function isFiltered(axis: Axis): boolean {
  return axis.tag !== ALL_TAGS || axis.q !== "";
}

/**
 * What a reader typed, reduced to what can be compared.
 *
 * TRIMMED AND LOWER-CASED IN ONE PLACE, because the query is compared against a
 * haystack that was built by another function on the other side of the client
 * boundary. Two spellings of "normalised" is how a search silently stops
 * matching capitals.
 */
export function normaliseQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Everything one entry is searchable by, as one lower-case string.
 *
 * TITLE, DECK AND TAGS — AND THE SHEET CONTRADICTS ITSELF HERE. Its input says
 * `grep titles…` and its script matches `r.textContent`, which is the whole
 * row: the ISO date and `12 MIN` included. Neither reading is followed blindly.
 * The rule that decides it is the one ADR 0070 §2 used on the frontmatter
 * schema — every field that is DRAWN — with the date and the reading time left
 * out, because `2026` must not return twenty-two entries when nobody searched
 * for a year. The placeholder on the input says what this line does.
 *
 * `summary` IS NOT IN HERE, and it is the one drawn field that is missing on
 * purpose: the index does not print it. It is the paragraph the post page and
 * the feed carry, and searching text a reader cannot see on this page would
 * return rows whose match is invisible.
 */
export function haystack(post: PostMeta): string {
  return [post.title, post.deck, ...post.tags].join(" ").toLowerCase();
}

/**
 * One row, reduced to what the two axes actually read.
 *
 * NOT `PostMeta`, AND THAT IS THE POINT OF THE INTERFACE — lib/work/filter.ts's
 * `FilterRow` makes the same cut for the same reason. What crosses the client
 * boundary as DATA is these two fields and a key; the visible half of the row
 * is a node the server already rendered. A predicate that took the whole entry
 * would invite the island to read the rest of it.
 */
export interface FilterRow {
  /** The entry's tags, exactly as the frontmatter wrote them. */
  readonly tags: readonly string[];
  /** `haystack`, computed on the server. Never rebuilt here. */
  readonly text: string;
}

/**
 * Whether one row survives both axes.
 *
 * THE TAG MATCH IS WHOLE-TOKEN and the query match is a substring, and the
 * asymmetry is deliberate. A tag is a key out of a closed set, so `design` may
 * never match `design-handoff`; `includes` over the array does that by
 * construction. A query is what somebody typed, and a reader who types "witness"
 * means the word wherever it sits.
 */
export function matches(row: FilterRow, axis: Axis): boolean {
  const byTag = axis.tag === ALL_TAGS || row.tags.includes(axis.tag);
  const byQuery = axis.q === "" || row.text.includes(axis.q);

  return byTag && byQuery;
}

/** Every row that survives both axes, in the order it came in. */
export function applyFilter<T extends FilterRow>(rows: readonly T[], axis: Axis): readonly T[] {
  return rows.filter((row) => matches(row, axis));
}

/**
 * What is narrowing the list, in the words the controls carry.
 *
 * FOR THE EMPTY PANEL AND NOTHING ELSE, which is `EmptyState.filters`'s whole
 * job: show a reader the cause of the emptiness rather than make them infer it.
 *
 * EACH LABEL NAMES ITS AXIS, and the Work Index's does not. There the two axes
 * are both closed vocabularies, so `LIVE` and `GO` cannot be mistaken for each
 * other. Here one is a subject and the other is arbitrary text — a bare
 * `witness` beside a bare `TESTING` would read as two tags. The sheet draws the
 * same form, `TAG: KUBERNETES × · JAHR: 2025 ×`.
 *
 * THE QUERY IS ECHOED IN QUOTES AND NOT UPPER-CASED. It is the reader's string,
 * not our vocabulary, and shouting it back changes what they typed.
 */
export function activeLabels(axis: Axis, chips: readonly TagChip[]): readonly string[] {
  const labels: string[] = [];

  if (axis.tag !== ALL_TAGS) {
    // A key with no chip cannot come from the control, which only ever sets a
    // key it drew. Printing the raw tag beats printing nothing: a panel that
    // named one filter instead of two explains the emptiness with half its cause.
    const chip = chips.find((one) => one.key === axis.tag);
    labels.push(`TAG: ${chip?.label ?? tagLabel(axis.tag)}`);
  }
  if (axis.q !== "") labels.push(`SEARCH: "${axis.q}"`);

  return labels;
}
