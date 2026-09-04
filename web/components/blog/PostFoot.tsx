import Link from "next/link";

import type { Messages } from "@/lib/i18n/messages";
import type { Neighbours } from "@/lib/content/neighbours";
import type { PostMeta } from "@/lib/content/posts";
import { minutesLabel, readingSize } from "@/lib/content/words";

/**
 * The previous and the next entry — and the row that stays when one of them does
 * not exist.
 *
 * THIS IS THE ONE EMPTY STATE OF A POST, and the sheet is unusually direct about
 * why it is built this way: "ZEILE VERSCHWINDET NIE — ein fehlendes Element
 * liest sich als Fehler, ein benanntes nicht." The newest entry has no next one,
 * and a foot that silently loses half its width reads as a rendering fault. So
 * the cell renders, says `— none yet`, gives the reason, and offers the way the
 * sheet names: "DER AUSWEG ist der Index, nicht die Startseite."
 *
 * WHY THE MINUTES AND NOT THE WORDS. The sheet's cards print `2026-06-09 · 09
 * MIN`, which is what a reader needs to decide whether to click. The word count
 * belongs to the entry you are already reading.
 *
 * THE SIZE IS RECOMPUTED FOR EACH NEIGHBOUR, and it costs two file reads per
 * page at build time. The alternative is putting the count in `PostMeta`, which
 * would make every caller of the reader — the homepage, the Work Index — pay for
 * a number only this foot uses.
 */
function neighbourCard({
  post,
  href,
  label,
  reason,
  none,
  raw,
  align,
}: {
  post: PostMeta | null;
  href: string | null;
  label: string;
  reason: string;
  none: string;
  raw: string | null;
  align: "start" | "end";
}) {
  return (
    <div className="post-neighbour" data-align={align}>
      <p className="post-neighbour-label">{label}</p>
      {post === null || href === null ? (
        <>
          <p className="post-neighbour-none">{none}</p>
          <p className="post-neighbour-why">{reason}</p>
        </>
      ) : (
        <Link href={href}>
          <span className="post-neighbour-title">{post.title}</span>
          <span className="post-neighbour-meta">
            {post.published} · {raw === null ? "" : minutesLabel(readingSize(raw))}
          </span>
        </Link>
      )}
    </div>
  );
}

export interface NeighbourSource {
  readonly href: string;
  readonly raw: string;
}

export function PostFoot({
  neighbours,
  previousSource,
  nextSource,
  indexHref,
  messages,
}: {
  neighbours: Neighbours;
  previousSource: NeighbourSource | null;
  nextSource: NeighbourSource | null;
  indexHref: string;
  messages: Messages;
}) {
  return (
    <nav className="post-foot" aria-label={messages.navLog}>
      {neighbourCard({
        post: neighbours.previous,
        href: previousSource?.href ?? null,
        raw: previousSource?.raw ?? null,
        label: `← ${messages.blogPrevious}`,
        reason: messages.blogNoPreviousWhy,
        none: messages.blogNoNeighbour,
        align: "start",
      })}

      {neighbourCard({
        post: neighbours.next,
        href: nextSource?.href ?? null,
        raw: nextSource?.raw ?? null,
        label: `${messages.blogNext} →`,
        reason: messages.blogNoNextWhy,
        none: messages.blogNoNeighbour,
        align: "end",
      })}

      {/* The way out that both empty halves point at, and it is drawn always —
          not only when a neighbour is missing. A reader at either end of the log
          needs it, and a reader in the middle loses nothing by having it. */}
      <p className="post-all">
        <Link href={indexHref}>{messages.blogAllEntries} →</Link>
      </p>
    </nav>
  );
}
