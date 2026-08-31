// How a line of the compose excerpt is split into the two tones the sheet draws.
//
// IN lib/ AND NOT IN THE COMPONENT, for the reason lib/api/systems.ts gives:
// `npm test` reads lib/** and styles/** only, and Node strips types but does not
// transform JSX, so nothing asserted about a .tsx can be asserted at all. The
// split is a judgement about text — where a key ends and a value begins — and a
// judgement with no test is the shape of every finding this repository has had.
//
// WHY THERE IS NO COMMENT TONE. The Case Study Template captions the block
// "keys in Signal, values in Amber, comments in Steel", and the third of those
// describes a block that cannot occur: tools/gen-compose-excerpt.mjs drops every
// comment line before writing the excerpt, because "the excerpt is a picture of
// the startup order, not the file's reasoning". A branch here for comments would
// be code no input can reach.

/** One line of the excerpt, split where the key ends. */
export interface ComposeLine {
  /** The leading spaces, kept verbatim — the indentation is the structure. */
  readonly indent: string;
  /** The key including its colon, or `null` for a line that has none. */
  readonly key: string | null;
  /** Everything after the key. Empty when the key opens a block. */
  readonly value: string;
}

/**
 * The key of a compose line, and the rest of it.
 *
 * ANCHORED AT THE START OF THE LINE, which is what makes it safe on a value that
 * contains a colon of its own. `image: ghcr.io/…/timseil-api:${IMAGE_TAG:?…}`
 * has three colons and exactly one key; splitting on the first colon *found*
 * would be the same function and wrong on nothing until that value appeared.
 *
 * A line that does not begin with a key is returned whole as a value. Nothing in
 * today's excerpt takes that path — every line the generator writes is a mapping
 * key — and it exists so that a future key list cannot produce an empty line.
 */
export function composeLine(raw: string): ComposeLine {
  const match = /^(\s*)([A-Za-z_][\w.-]*:)(.*)$/.exec(raw);
  if (match === null) {
    const indent = /^\s*/.exec(raw)?.[0] ?? "";
    return { indent, key: null, value: raw.slice(indent.length) };
  }
  return { indent: match[1], key: match[2], value: match[3] };
}

/** The whole excerpt, line by line. */
export function composeLines(lines: readonly string[]): ComposeLine[] {
  return lines.map(composeLine);
}
