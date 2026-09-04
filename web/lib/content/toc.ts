// The CONTENTS rail, and the one thing it must not get wrong: the anchor.
//
// THE SLUGS ARE NOT TRANSCRIBED, THEY ARE THE SAME CODE. `rehype-slug` gives
// every heading in the rendered body an id, and this rail links to those ids. A
// second implementation of the same rule here would be a copy that drifts — the
// exact failure lib/chrome.ts's oracle rule exists to prevent — and it would
// drift silently, as a link that lands nowhere rather than as a red test.
//
// So `github-slugger` is imported. It is the package `rehype-slug` itself uses,
// declared in package.json rather than borrowed from the hoisted tree, for the
// reason next.config.ts gives about `outputFileTracingIncludes`: a dependency
// that holds by coincidence is one nobody will connect to the version bump that
// breaks it.
//
// A SLUGGER IS STATEFUL, AND THAT IS WHY ONE IS MADE PER POST. Two headings with
// the same words get `-1` on the second, and the counter has to start again for
// the next file — a shared instance would number the second post's headings as
// if they were the first post's duplicates. No post in the corpus repeats a
// heading today; three repeat one another's, across files.
//
// ONLY `##`. The corpus is 117 headings and every one of them is an h2, and the
// sheet's rail draws one flat numbered list rather than a tree. A deeper level
// would need a rule about indentation that no drawing supplies; #246 settled
// what h4-h6 LOOK like, not what a rail does with them.

import GithubSlugger from "github-slugger";

import { bodyOf, proseLines } from "./body.ts";

export interface TocEntry {
  /** `01`, `02`, … — the sheet numbers the rail, and the heading itself carries
   *  the same number from a CSS counter in styles/blog.css. */
  readonly number: string;
  /** The heading as a reader sees it: inline code marks taken off. */
  readonly text: string;
  /** The id `rehype-slug` put on the heading. */
  readonly id: string;
}

/** `## ` at the start of a line, and nothing deeper or shallower. */
const H2 = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/**
 * The heading text as the renderer will produce it.
 *
 * ONLY BACKTICKS, because they are the only inline syntax three of the 117
 * headings use — `` `4 containers` ``, `` `[SPEC]` ``, `` `The restore has been
 * tested` ``. Emphasis and links appear in none of them, and stripping syntax
 * that nobody writes is a rule with no test behind it.
 */
function plain(text: string): string {
  return text.replaceAll("`", "");
}

/** Every h2 of a post, in document order. Empty when the post has none. */
export function toc(raw: string): readonly TocEntry[] {
  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];

  for (const line of proseLines(bodyOf(raw))) {
    const found = H2.exec(line);
    if (found === null) continue;

    const text = plain(found[1]);
    if (text === "") continue;

    entries.push({
      number: String(entries.length + 1).padStart(2, "0"),
      text,
      id: slugger.slug(text),
    });
  }

  return entries;
}

/**
 * Whether the rail is worth drawing.
 *
 * THREE, AND THE NUMBER IS THE SHEET'S: "ab drei Zwischenüberschriften sinnvoll,
 * darunter Ballast". A contents list of two entries is a list of the two things
 * already visible on the screen.
 */
export const TOC_MINIMUM = 3;

export function showsToc(entries: readonly TocEntry[]): boolean {
  return entries.length >= TOC_MINIMUM;
}
