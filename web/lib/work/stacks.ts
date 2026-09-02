// The stack filter's vocabulary, derived from the answer rather than written
// down.
//
// THE SHEET WROTE IT DOWN AND THE SHEET IS WRONG ABOUT THE DATA. It draws five
// fixed chips — `ANY · GO · TYPESCRIPT · PYTHON · POSTGRES · DOCKER` — against
// two systems whose stacks are `["Next.js 16.3", "React 19.2", "Go 1.26", …]`
// and `["Python", "FastAPI", "Docker", "SQLite"]`. `TypeScript` is in neither,
// and `POSTGRES` is spelled `PostgreSQL 18.6`. Three of the five chips would
// have filtered every row away every time they were pressed.
//
// SO THE VOCABULARY IS DERIVED, AND THAT IS A DIFFERENT KIND OF LIST FROM THE
// STATUS ROW. The three status chips come from the contract's `SystemState`
// enum: a fixed set, three of them for ever, and `BUILD 00` is a legitimate
// chip because the vocabulary exists whether or not a row is in that state
// today. A stack name has no enum behind it — it is whatever `stack.yaml`
// happens to hold — so a chip nobody can press to any effect is not a stated
// possibility, it is a dead control, and STATE.05 refuses those.
//
// THE VERSION IS DROPPED AND THE NAME IS NOT. `stack.yaml`'s whole point is
// that nobody types a version into a page; `make gen` reads them out of
// `go.mod`, `package.json`, `compose.yaml` and `.nvmrc`. A filter keyed on
// `go-1-26` would therefore go stale the next time Go ships, and it would take
// the visitor's selection with it. The row still PRINTS the version — that is
// `stackLine` in lib/api/systems.ts and it has not changed.

import { nonEmpty } from "../api/values.ts";

/** One chip of the stack row. */
export interface StackTag {
  /**
   * The filter token. Lower case, no spaces.
   *
   * The sheet's rows carry `data-sk="go typescript postgres docker"` and match
   * with a whole-token `includes`, so a key may not contain the separator. Two
   * names that differ only in case or spacing collapse into one key on purpose:
   * they are one technology, and two chips for it would each show half its
   * systems.
   */
  readonly key: string;
  /** What the chip says. Upper-cased by the stylesheet, never in the string. */
  readonly label: string;
}

/**
 * The version suffix, as `stack.gen.json` writes it.
 *
 * Everything from the last space before a run that starts with a digit:
 * `Next.js 16.3` → `Next.js`, `Go 1.26` → `Go`, `Node 24` → `Node`. A bare name
 * has no such run and survives whole, which is every entry of the `vat-check`
 * stack — none of its sources live in this repository, so none of them has a
 * version to read.
 */
const VERSION = /\s+v?\d[\w.+-]*$/;

/**
 * An entry that is a version and nothing else.
 *
 * A SEPARATE TEST AND NOT A WIDER `VERSION`, because the two rules disagree on
 * purpose. `VERSION` needs the space in front of it so that `S3` and `OAuth2`
 * keep their digits — a name may end in one, it may not BE one. That leaves
 * `"1.26"` with nothing in front to match, so it is caught here instead.
 */
const ALL_VERSION = /^v?\d[\w.+-]*$/;

/**
 * The chip key for one stack entry, or nothing.
 *
 * `null` FOR AN ENTRY THAT IS ALL VERSION. A string like `"1.26"` has a name of
 * zero length once the suffix goes, and a chip with no word is the one thing
 * the state language refuses everywhere else. It is dropped rather than shown
 * under its own version number.
 */
export function stackKey(entry: unknown): StackTag | null {
  const raw = nonEmpty(entry);
  if (raw === null) return null;

  const label = raw.replace(VERSION, "").trim();
  if (label === "" || ALL_VERSION.test(label)) return null;

  return { key: label.toLowerCase().replace(/\s+/g, "-"), label };
}

/**
 * Every stack tag one system carries, deduplicated, in the answer's order.
 *
 * This is the row's side of the filter — what `data-sk` would hold on the
 * sheet. Order does not matter to a membership test and is kept anyway, so that
 * a reader comparing this with the printed stack line sees the same sequence.
 */
export function tagsOf(stack: unknown): readonly StackTag[] {
  if (!Array.isArray(stack)) return [];

  const seen = new Set<string>();
  const tags: StackTag[] = [];

  for (const entry of stack) {
    const tag = stackKey(entry);
    if (tag === null || seen.has(tag.key)) continue;
    seen.add(tag.key);
    tags.push(tag);
  }

  return tags;
}

/**
 * The chips, over every system in the list.
 *
 * SORTED BY KEY, AND THE ROWS ARE NOT. `systemRows` keeps the api's order
 * because the number a reader sees is the position they read it in — the order
 * carries meaning. A chip row has no numbers and no meaning to carry, so it
 * needs an order a reader can predict instead, and that is the alphabet.
 *
 * Sorted on the KEY rather than the label, and with a plain code-unit compare
 * rather than `localeCompare`: the key is the value the filter matches on, and
 * a comparison whose answer depends on the ICU data in the running Node would
 * make this list a different list on a different machine.
 *
 * THE FIRST CHIP IS NOT HERE. `ANY` is the sentinel that turns the axis off; it
 * belongs to the control, not to the data, and a system cannot be built out of
 * it. components/work/WorkFilters.tsx renders it in front of this list.
 */
export function stackTags(stacks: readonly unknown[]): readonly StackTag[] {
  const byKey = new Map<string, StackTag>();

  for (const stack of stacks) {
    for (const tag of tagsOf(stack)) {
      if (!byKey.has(tag.key)) byKey.set(tag.key, tag);
    }
  }

  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
