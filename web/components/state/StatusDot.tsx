// Server Components, all of them. Nothing in this directory has state, an
// event handler or a browser API, so nothing here carries 'use client' — and
// the state language costs the bundle zero bytes.

import { MARKS, type StateKey } from "@/lib/state/words";

/**
 * A state, said twice: once as a shape and once as a word.
 *
 * `label` IS NOT OPTIONAL, and that is the acceptance criterion of G6
 * expressed as a type. The handoff's own version has `label?: string` with the
 * comment "Zustand nie nur über Farbe: das Wort steht immer daneben" — a rule
 * in a comment that the signature lets you break. Here a dot without a word
 * does not compile.
 *
 * The dot is `aria-hidden`: it is the same fact drawn a second way, and a
 * screen reader announcing "bullet DEGRADED" would be reading the decoration.
 *
 * A state whose mark carries no dot (EMPTY is a panel, AVAILABLE is a sentence
 * about a person) renders as the word alone rather than as a word with a blank
 * beside it.
 */
export function StatusDot({ state, label }: { state: StateKey; label: string }) {
  const mark = MARKS[state];

  return (
    <span className="st" data-tone={mark.tone}>
      {mark.dot === null ? null : (
        <span
          className="st-dot"
          data-dot={mark.dot}
          // Presence, not a value: state.css matches `[data-pulse]`. `false`
          // would render `data-pulse="false"` and match it too.
          data-pulse={mark.pulse ? "" : undefined}
          aria-hidden="true"
        />
      )}
      <span className="st-word">{label}</span>
    </span>
  );
}

/**
 * The word on its own, for a place that already has a column for it.
 *
 * A table row does not need a dot in every cell — the fill would repeat down
 * the column and stop distinguishing anything. The word still carries the tone,
 * so the state is readable in one glance and in greyscale.
 */
export function StateWord({ state, label }: { state: StateKey; label: string }) {
  return (
    <span className="st" data-tone={MARKS[state].tone}>
      <span className="st-word">{label}</span>
    </span>
  );
}
