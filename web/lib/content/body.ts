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
