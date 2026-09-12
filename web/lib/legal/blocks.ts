// The shapes a legal section is made of, and the one function that says what
// "everything a reader can see on this page" means.
//
// LIFTED OUT OF content.ts IN H12c, AND THE MOVE IS THE POINT. There are two
// legal pages now — `/privacy` in content.ts and `/imprint` in imprint.ts — and
// they are rendered by one component, checked by two test files and ordered by
// one sections.ts. A type that lived in one page's data file would have made
// the other page import FROM it, which is the direction that turns a pair of
// siblings into a parent and a child for no reason anybody chose.
//
// FOUR SHAPES, AND A FIFTH WOULD BE A DESIGN DECISION TAKEN IN A DATA FILE.
// That sentence stood in content.ts before this file existed and it still holds:
// components/legal/Blocks.tsx renders exactly these four and nothing else, so a
// new kind is a new case in a switch that a compiler will demand rather than a
// string somebody styles in place.

/** A block of a section. */
export type Block =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "table"; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: "numbered"; readonly items: readonly string[] }
  | { readonly kind: "note"; readonly text: string };

/**
 * Every string in one block, flattened.
 *
 * HERE RATHER THAN IN EACH TEST FILE, and the reason is the switch below having
 * no `default`. TypeScript makes this function exhaustive over `Block`: adding a
 * fifth kind stops the build here, once, instead of leaving two test files each
 * sweeping three quarters of a page and reporting green. content.test.ts and
 * imprint.test.ts both ask "does any string on this page carry a bracket, a
 * duration nobody enforces, a sentence the code outgrew" — and a sweep that
 * silently skips a block kind is a sweep that answers no to all three.
 */
export function blockText(block: Block): string[] {
  switch (block.kind) {
    case "p":
    case "note":
      return [block.text];
    case "numbered":
      return [...block.items];
    case "table":
      return [...block.head, ...block.rows.flat()];
  }
}
