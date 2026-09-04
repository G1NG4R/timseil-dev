// Where a post's prose starts, and which of it is prose.
//
// ONE PLACE, BECAUSE TWO READERS ASK THE SAME QUESTION. lib/content/words.ts
// counts words and lib/content/toc.ts finds headings, and both have to agree on
// two boundaries: the frontmatter is not the body, and a fenced block is not
// prose. Two copies of that judgement would drift the day one of them learns
// about tildes and the other does not — and then the reading time would count
// lines the contents rail refuses to number.
//
// FENCES ARE REMOVED, NOT PARSED. This does not tokenise markdown; it walks the
// lines and tracks whether a fence is open. That is enough for the corpus and
// for the two questions above, and it is deliberately less than a parser: the
// renderer is the parser, and a second one here would be a second opinion about
// what the page says.
//
// TILDE FENCES ARE HANDLED THOUGH NO FILE USES ONE, and that is the one place
// this reader is wider than the corpus. CommonMark gives ``` and ~~~ the same
// meaning, and a file that used the second would otherwise have its whole
// remaining body counted as prose — a silent, plausible-looking wrong number
// rather than a visible failure.

/** The text after the frontmatter block, or the whole file when there is none. */
export function bodyOf(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trimEnd() !== "---") return raw;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trimEnd() === "---") return lines.slice(i + 1).join("\n");
  }
  // An unterminated block. lib/content/posts.ts refuses such a file outright, so
  // nothing that reaches a page gets here — but "the whole file is body" would
  // be the wrong guess to make in the meantime.
  return "";
}

/** Whether a line opens or closes a fenced block. */
function isFence(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}

/** The body's lines with every fenced block, and its fences, taken out. */
export function proseLines(body: string): readonly string[] {
  const out: string[] = [];
  let open = false;

  for (const line of body.split("\n")) {
    if (isFence(line)) {
      open = !open;
      continue;
    }
    if (!open) out.push(line);
  }
  return out;
}

/**
 * A frontmatter string as a reader sees it.
 *
 * THE FINDING THIS EXISTS FOR, AND IT WAS ALREADY IN PRODUCTION. One dek and
 * five summaries in content/posts write inline code with backticks — "a
 * rate-limit line as `retry in 6s · 1/3`" — and the homepage has been drawing
 * that dek with its backticks in since H5c. Nobody noticed because nothing
 * rendered the post beside it; H9a puts the same string under a title where it
 * reads as a typo.
 *
 * FRONTMATTER IS NOT MARKDOWN, WHICH IS THE ACTUAL RULE. `remark` never sees
 * these values: `remark-frontmatter` strips the block before parsing, and
 * lib/content/posts.ts reads it as text. So a mark in there has no renderer and
 * never will unless one is built for it — and until then the honest thing is to
 * show the words rather than the marks.
 *
 * ONLY BACKTICKS, for toc.ts's reason: they are the only inline syntax that
 * occurs. Stripping emphasis or links that nobody writes would be a rule with
 * no test behind it and a surprise for whoever writes the first one.
 *
 * IT RUNS AT READ TIME so that the three surfaces which draw these strings — the
 * homepage row, the post header, and the feed from H9c on — cannot disagree
 * about them. Two spellings of one sentence is the defect, not the marks.
 */
export function plainText(value: string): string {
  return value.replaceAll("`", "");
}
