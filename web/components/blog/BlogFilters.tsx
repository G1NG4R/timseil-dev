// The only client component of `/blog`, and the second one in stage H.
//
// WHY `'use client'` AT ALL. The chip row and the search field change what the
// reader sees without asking the server anything, and the sheet's own title for
// the artboard is the brief: "Filter und Suche funktionieren". Nothing on the
// server can hold "which chip is pressed" without turning the route dynamic,
// and that would cost the prerendered page — which on this route is the whole
// page, because it reads files in this image rather than an api.
//
// THE ROWS DO NOT CROSS THE BOUNDARY, AND THAT IS THE POINT OF THIS FILE'S
// SHAPE. Each row and each year heading arrives as `node`: markup React already
// rendered on the server. Next's own guide draws the line — a Server Component
// passed "as children or other props ... is not imported into the Client
// Component's module graph" — so `PostCard`, `next/link` and `EmptyState`'s
// neighbours stay where they were. `WorkFilters` measured what that saves on
// `/work`: an island of 1 635 B against a page that would otherwise have pulled
// in five more components. With #237 at 143 581 B of a 150 000 B budget this is
// not a matter of taste.
//
// THE SHEET FILTERS BY `style.display` AND THIS DOES NOT. Its script walks the
// DOM and hides rows; doing that here would mean writing to nodes React owns. A
// conditional render is the same result in the framework's own terms.
//
// THE STATE IS NOT IN THE URL, and `WorkFilters` already wrote down the trade:
// `searchParams` would make this route dynamic and take the static page with
// it. What it costs is that a narrowed list cannot be linked to and does not
// survive a reload. Stated here rather than re-decided later.

"use client";

import { Fragment, useId, useState } from "react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/state/EmptyState";
import { FilterChip } from "@/components/work/FilterChip";
import { blogCount } from "@/lib/blog/counts";
import {
  ALL_TAGS,
  type Axis,
  activeLabels,
  applyFilter,
  isFiltered,
  normaliseQuery,
} from "@/lib/blog/filter";
import type { TagChip } from "@/lib/blog/tags";

/** One entry: what the axes read, and what the server already drew. */
export interface FilterRowNode {
  readonly key: string;
  /** The entry's tags, as written. */
  readonly tags: readonly string[];
  /** `haystack`, built on the server. Never rebuilt here. */
  readonly text: string;
  /** `<PostCard>`, rendered on the server. Never re-rendered here. */
  readonly node: ReactNode;
}

/** One year of the log: its heading, already drawn, and the entries under it. */
export interface YearNode {
  readonly key: string;
  /** The `2026 ——— 07 ENTRIES` separator, rendered on the server. */
  readonly head: ReactNode;
  readonly rows: readonly FilterRowNode[];
}

/**
 * The chip row, the search field, the counter, the list, and the panel for nought.
 *
 * `TAG`, `ALL` AND `SEARCH` ARE INLINE ENGLISH, by LANG.01's rule and by the
 * example one directory over: `WorkFilters` writes `STATUS` and `STACK` inline
 * because they are nomenclature — the words a reader of any language would see
 * on this kind of control. The prose that would have to be translated is in
 * `strings`, and every one of those is a prop rather than the whole `Messages`
 * table, because every prop of a client component is serialised into the payload
 * of every page that renders it.
 *
 * THE YEAR HEADINGS GO WHEN ANYTHING NARROWS, which is the sheet's script
 * exactly: `const plain = this.tag === "all" && !this.q`. A separator saying
 * `07 ENTRIES` over three visible rows would be a count that measures the
 * corpus while the list beside it measures the filter.
 *
 * AND THE NARROWED LIST IS ONE `<ol>`, not the year-by-year structure. Once the
 * years are gone there are no groups left to be lists of.
 */
export function BlogFilters({
  years,
  chips,
  strings,
}: {
  years: readonly YearNode[];
  /** Derived from the corpus by `tagChips`, so no chip can match nothing. */
  chips: readonly TagChip[];
  strings: {
    searchPlaceholder: string;
    noMatchHead: string;
    noMatchReason: string;
    reset: string;
  };
}) {
  const [tag, setTag] = useState<string>(ALL_TAGS);
  // The raw field value is its own state and the axis is derived from it. One
  // state for both would mean the input showed a trimmed, lower-cased copy of
  // what was being typed — the field would fight the reader mid-word.
  const [query, setQuery] = useState("");
  // Stable across the server pass and hydration, which a counter in this file
  // would not be — two islands on one page would then claim the same ids.
  const id = useId();

  const axis: Axis = { tag, q: normaliseQuery(query) };
  const rows = years.flatMap((year) => year.rows);
  const shown = applyFilter(rows, axis);
  const narrowed = isFiltered(axis);

  const reset = () => {
    setTag(ALL_TAGS);
    setQuery("");
  };

  return (
    <>
      <div className="blog-filters">
        {/* THE GROUP IS THE CHIPS AND ITS NAME IS THE VISIBLE LABEL. `TAG` is a
            whole word on the page, so `aria-labelledby` says the same thing to
            everyone rather than inventing a second sentence only some readers
            get. `WorkFilters` settled this idiom. */}
        <span className="blog-filter-label" id={`${id}-tag`}>
          TAG
        </span>

        <div className="blog-chips" role="group" aria-labelledby={`${id}-tag`}>
          <FilterChip
            label="ALL"
            count={String(rows.length).padStart(2, "0")}
            pressed={tag === ALL_TAGS}
            sentinel
            onPress={() => {
              setTag(ALL_TAGS);
            }}
          />

          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              count={chip.count}
              pressed={tag === chip.key}
              onPress={() => {
                setTag(chip.key);
              }}
            />
          ))}
        </div>

        <span className="blog-filter-label" id={`${id}-search`}>
          SEARCH
        </span>

        {/* THE `/` IS DECORATION AND THE LABEL IS THE WORD BESIDE IT. The sheet
            draws a `/` glyph in front of the field, which is the terminal's
            prompt and not a name; a reader who hears only "slash" has been told
            nothing. `aria-labelledby` points at `SEARCH`, which is on the page. */}
        <div className="blog-search">
          <span className="blog-search-glyph" aria-hidden="true">
            /
          </span>
          <input
            className="blog-search-input"
            type="search"
            aria-labelledby={`${id}-search`}
            placeholder={strings.searchPlaceholder}
            value={query}
            // No debounce. The list is twenty-odd rows already in memory and
            // every keystroke is one `filter` over them; a timer here would add
            // a lag nobody asked for and a second piece of state to reason about.
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
      </div>

      {/* `aria-live` is deliberate and polite: a reader who cannot see the list
          shorten is otherwise told nothing by a press that changed everything
          below it. `blogCount` is the one author of the sentence. */}
      <p className="blog-count" aria-live="polite">
        {blogCount(rows.length, shown.length)}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          heading={strings.noMatchHead}
          reason={strings.noMatchReason}
          filters={activeLabels(axis, chips)}
        >
          {/* The way back. STATE.05 asks for one and the sheet draws one. It is
              a button rather than the sheet's `<span onClick>` for the reason
              FilterChip gives. It is always drawn here, unlike on `/work`:
              this panel cannot be reached without something narrowing, because
              every chip is derived from the corpus and therefore holds at least
              one entry — nought matches is only ever the search or a
              combination. */}
          <button
            className="btn"
            data-variant="ghost"
            type="button"
            onClick={reset}
          >
            {strings.reset}
          </button>
        </EmptyState>
      ) : narrowed ? (
        <ol className="post-cards">
          {shown.map((row) => (
            <Fragment key={row.key}>{row.node}</Fragment>
          ))}
        </ol>
      ) : (
        years.map((year) => (
          <Fragment key={year.key}>
            {year.head}
            <ol className="post-cards">
              {year.rows.map((row) => (
                <Fragment key={row.key}>{row.node}</Fragment>
              ))}
            </ol>
          </Fragment>
        ))
      )}
    </>
  );
}
