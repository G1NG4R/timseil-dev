// Markup only, and deliberately so — see the header of components/ui/Button.tsx
// for the rule this follows: "a caller that needs one passes it in, and only
// that caller becomes a client component." WorkFilters is that caller.
//
// IT CARRIES NO `'use client'` OF ITS OWN AND IT IS STILL IN THE BUNDLE. A
// module imported by a client module is compiled for the client whether or not
// it repeats the directive; the directive marks a BOUNDARY, and there is one
// boundary here, not two. What keeps this cheap is that there is nothing in it
// but an element — no hook, no import from lib/, no `next/link`.

import type { ReactNode } from "react";

/**
 * One chip of one filter row.
 *
 * A `<button>`, AND THE SHEET DRAWS A `<span onClick>`. Neither the Work Index
 * sheet's chips nor its `reset filters` carry a `role`, a `tabindex` or a key
 * handler; the whole sheet has no keyboard note. State Language settles it in
 * the other direction and without an exception — "gleiche form für alle
 * elemente, keine ausnahmen", "tab-reihenfolge = leserichtung" — and a canvas
 * artefact has been overruled twice before on this page alone (the `<h2>` that
 * should have been an `<h1>`, and the three controls the row drew to one
 * destination). A button is also the element that answers Space and Enter
 * without this file owning a key handler.
 *
 * `aria-pressed` RATHER THAN `role="radio"`, though the row behaves like a
 * radio group. The two axes each have a sentinel that is itself a chip, so
 * "nothing selected" is not a state this control can be in — and a radio group
 * would put the whole row on one tab stop with arrow keys, which is the
 * interaction ThemeSwitch needs for three swatches and the wrong one for a row
 * whose length is whatever the api answered with.
 *
 * THE COUNT IS A CHILD ELEMENT, NOT PART OF THE LABEL. The sheet nests it in a
 * span so it can be tabular while the word is not, and a screen reader reads
 * "LIVE 01" either way.
 */
export function FilterChip({
  label,
  count,
  pressed,
  sentinel = false,
  onPress,
}: {
  label: string;
  /** The number on the chip, or nothing at all. The stack row draws none. */
  count?: ReactNode;
  pressed: boolean;
  /** `ALL` / `ANY` — the chip that turns its axis off. */
  sentinel?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      className="chip"
      type="button"
      aria-pressed={pressed}
      // Presence, not a value: work.css matches [data-sentinel], and `false`
      // would render data-sentinel="false" and match it too. StateFlip's
      // data-burst and WorkRow's data-here are the same idiom.
      data-sentinel={sentinel ? "" : undefined}
      onClick={onPress}
    >
      {label}
      {count === undefined ? null : <span className="chip-n">{count}</span>}
    </button>
  );
}
