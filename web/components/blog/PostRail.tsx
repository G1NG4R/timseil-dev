import Link from "next/link";

import type { Messages } from "@/lib/i18n/messages";
import type { TocEntry } from "@/lib/content/toc";
import { showsToc } from "@/lib/content/toc";

/**
 * The left rail: what the entry is made of, and which system it is about.
 *
 * TWO BLOCKS, NOT THREE. The sheet draws CONTENTS, SERIES and RUNS IN. There is
 * no series: no entry in content/posts belongs to one, the frontmatter has no
 * key for it, and a block that renders for nobody is a component with no
 * consumer — the shape #292 is open about one directory over. It comes back the
 * day a multi-part entry does, which is what the sheet's own rule asks for: "nur
 * bei mehrteiligen Einträgen".
 *
 * CONTENTS DISAPPEARS BELOW THREE ENTRIES, and that is the sheet's number:
 * "ab drei Zwischenüberschriften sinnvoll, darunter Ballast". lib/content/toc.ts
 * holds it, so the rule has a test and this component has a boolean.
 *
 * THE RAIL IS A `<nav>` AND THE LIST IS ORDERED, because both are true: it is a
 * set of links into this document, and the numbers `01`–`05` mean the order they
 * are read in. The numbers themselves are `aria-hidden` — a screen reader that
 * announced "zero one, the failure" would be reading the frame.
 *
 * NO ACTIVE ENTRY. The sheet marks the section currently on screen in cyan, and
 * that needs a scroll observer, which needs a client component on a page that
 * otherwise ships none. It belongs with the reading-progress bar in I2, where
 * scroll-coupled behaviour has a stylesheet and a Firefox fallback of its own.
 */
export function PostRail({
  entries,
  systemHref,
  systemLabel,
  messages,
}: {
  entries: readonly TocEntry[];
  systemHref: string | null;
  systemLabel: string | null;
  messages: Messages;
}) {
  const contents = showsToc(entries);
  if (!contents && systemHref === null) return null;

  return (
    <div className="post-rail">
      {!contents ? null : (
        <nav className="post-toc" aria-labelledby="post-toc-label">
          <p className="post-rail-label" id="post-toc-label">
            {messages.blogContents}
          </p>
          <ol>
            {entries.map((entry) => (
              <li key={entry.id}>
                <span aria-hidden="true">{entry.number}</span>
                <a href={`#${entry.id}`}>{entry.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {systemHref === null || systemLabel === null ? null : (
        <div className="post-runs-in">
          <p className="post-rail-label">{messages.blogRunsIn}</p>
          <Link href={systemHref}>{systemLabel} →</Link>
        </div>
      )}
    </div>
  );
}
