// The first client component of stage H, and the only one on `/work`.
//
// WHY `'use client'` AT ALL. The two chip rows change what the reader sees
// without asking the server anything, and the sheet's own note is the whole
// brief: "Zwei Filterreihen, beide live: Status und Stack kombinieren sich,
// Zähler läuft mit, leere Kombination bietet Reset". Nothing on the server can
// hold "which chip is pressed" without turning the route dynamic, and that
// would cost the prerendered shell H6a built on purpose — the legend and the
// way to a conversation stand even when the api does not answer.
//
// THE ROWS DO NOT CROSS THE BOUNDARY, AND THAT IS THE POINT OF THIS FILE'S
// SHAPE. Each row arrives as `node`: markup React already rendered on the
// server. Next's own guide draws the line — a Server Component passed "as
// children or other props ... is not imported into the Client Component's
// module graph" — so `WorkRow`, `WorkPreview`, `StatusDot`, `NoData` and
// `next/link` stay where they were, and what ships here is this file, its chip
// and the empty panel. Handing the island `WorkEntry[]` and letting it draw the
// list would have pulled all five in to save one prop.
//
// THE SHEET FILTERS BY `style.display` AND THIS DOES NOT. Its script walks the
// DOM and hides rows; doing that here would mean writing to nodes React owns.
// A conditional render is the same result in the framework's own terms, and it
// is the reason the empty panel can be a branch rather than a second element
// that is permanently in the document waiting to be shown.
//
// THE STATE IS NOT IN THE URL, and that is a trade rather than an oversight.
// `searchParams` would make this route dynamic and take the static shell with
// it. What it costs: a narrowed list cannot be linked to and does not survive a
// reload. Written down in the ADR rather than left to be re-decided.

"use client";

import { Fragment, useId, useState } from "react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/state/EmptyState";
import { FilterChip } from "@/components/work/FilterChip";
import { workCount } from "@/lib/work/counts";
import type { StateWord } from "@/lib/state/words";
import {
  ANY_STACK,
  type Axis,
  type Chip,
  type StatusAxis,
  NO_FILTER,
  activeLabels,
  applyFilter,
  isFiltered,
} from "@/lib/work/filter";

/** One row: what the axes read, and what the server already drew. */
export interface FilterRowNode {
  readonly key: string;
  /** The row's state, or `null` when this build has no word for what arrived. */
  readonly st: StateWord | null;
  /** The row's stack, as `StackTag.key`s. */
  readonly sk: readonly string[];
  /** `<WorkRow>`, rendered on the server. Never re-rendered here. */
  readonly node: ReactNode;
}

/** A status chip: the axis value it sets, its word, and how many rows carry it. */
export interface StatusChip extends Chip {
  /** Narrower than `Chip.key`, because this row's vocabulary is the enum. The
   *  stack row's is whatever the answer held, so its keys stay plain strings. */
  readonly key: StatusAxis;
  /** Already padded to two digits by the server — see `statusChipsOf`. */
  readonly count: string;
}

/**
 * The two chip rows, the counter, the list, and the panel for nought.
 *
 * THE LABELS ARE PROPS AND `messages` IS NOT. Every prop of a client component
 * is serialised into the payload of every page that renders it — `LangMenu`
 * wrote that rule down for four strings and it holds for six. The status words
 * come in already looked up, so `MARKS` stays server-side and no second table
 * can spell a state differently from the row beside it.
 *
 * `STATUS`, `STACK`, `ALL` AND `ANY` ARE INLINE ENGLISH, by LANG.01's rule and
 * by the example one component over: `WorkHeader` writes `SYSTEMS` inline for
 * the same reason. They are nomenclature — the words a reader of any language
 * would see on this kind of control — and the prose that would have to be
 * translated is in `strings`. The two visible labels also NAME their groups, so
 * no accessible name has to cross the boundary either.
 */
export function WorkFilters({
  rows,
  statusChips,
  stackChips,
  strings,
}: {
  rows: readonly FilterRowNode[];
  /** `ALL` first, then the contract's three states. Built by the server. */
  statusChips: readonly StatusChip[];
  /** Derived from the answer by `stackTags`, so no chip can match nothing. */
  stackChips: readonly Chip[];
  strings: {
    noMatchHead: string;
    noMatchReason: string;
    reset: string;
  };
}) {
  const [axis, setAxis] = useState<Axis>(NO_FILTER);
  // Stable across the server pass and hydration, which a counter in this file
  // would not be — two islands on one page would then claim the same ids.
  const id = useId();

  const shown = applyFilter(rows, axis);

  return (
    <>
      {/* A grid of two columns rather than two flex rows with a fixed label
          width. The sheet gives the label `width:52px` so the two chip columns
          line up; `auto 1fr` gets the same alignment out of the longer of the
          two words, which is one number nobody has to type and one that cannot
          go stale when a word changes. layout.css turns it into one column
          under the 900 switch, where the row already becomes a card. */}
      <div className="work-filters">
        {/* THE GROUP IS THE CHIPS AND ITS NAME IS THE VISIBLE LABEL. `STATUS`
            is a whole word on the page, so `aria-labelledby` says the same
            thing to everyone rather than inventing a second sentence only some
            readers get. The row arrow one component over does the opposite for
            the opposite reason: `→` on its own names nothing. */}
        <span className="work-filter-label" id={`${id}-status`}>
          STATUS
        </span>

        <div className="work-chips" role="group" aria-labelledby={`${id}-status`}>
          {statusChips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              count={chip.count}
              pressed={axis.status === chip.key}
              sentinel={chip.key === "all"}
              onPress={() => {
                setAxis((current) => ({ ...current, status: chip.key }));
              }}
            />
          ))}
        </div>

        {/* NO ROW AT ALL RATHER THAN A LONE `ANY`. `stackTags` answers `[]`
            when no system named a technology, which is a measurement; a row
            holding only the control that turns itself off is a dead control,
            and stacks.test.ts already states this as the expected behaviour. */}
        {stackChips.length === 0 ? null : (
          <>
            <span className="work-filter-label" id={`${id}-stack`}>
              STACK
            </span>

            <div className="work-chips" role="group" aria-labelledby={`${id}-stack`}>
              <FilterChip
                label="ANY"
                pressed={axis.stack === ANY_STACK}
                sentinel
                onPress={() => {
                  setAxis((current) => ({ ...current, stack: ANY_STACK }));
                }}
              />

              {stackChips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  label={chip.label}
                  pressed={axis.stack === chip.key}
                  onPress={() => {
                    setAxis((current) => ({ ...current, stack: chip.key }));
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* The line the server used to render on its own. It is here now because
          it changes on every chip press, and `workCount` is the one author of
          the sentence either way. `aria-live` is deliberate and polite: a
          reader who cannot see the list shorten is otherwise told nothing by a
          press that changed everything below it. */}
      <p className="work-count" aria-live="polite">
        {workCount(rows.length, shown.length)}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          heading={strings.noMatchHead}
          reason={strings.noMatchReason}
          filters={activeLabels(axis, statusChips, stackChips)}
        >
          {/* The way back. STATE.05 asks for one and the sheet draws one; it is
              a button rather than the sheet's `<span onClick>` for the reason
              FilterChip gives. It appears only when something is narrowing —
              this panel cannot be reached otherwise, and a reset that resets
              nothing would be the dead control the same sheet refuses. */}
          {isFiltered(axis) ? (
            <button
              className="btn"
              data-variant="ghost"
              type="button"
              onClick={() => {
                setAxis(NO_FILTER);
              }}
            >
              {strings.reset}
            </button>
          ) : null}
        </EmptyState>
      ) : (
        // THE `<li>` IS THE ROW'S OWN, NOT THIS FILE'S. `WorkRow` renders it,
        // because the list is an `<ol>` for the reason WorkList states — the
        // number the row prints IS the order. A wrapper here would nest one
        // list item inside another.
        <ol className="work-list">
          {shown.map((row) => (
            <Fragment key={row.key}>{row.node}</Fragment>
          ))}
        </ol>
      )}
    </>
  );
}
