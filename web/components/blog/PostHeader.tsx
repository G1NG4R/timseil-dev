import Link from "next/link";

import type { Messages } from "@/lib/i18n/messages";
import type { PostMeta } from "@/lib/content/posts";
import { entryNumber } from "@/lib/content/posts";
import { minutesLabel, wordsLabel, type ReadingSize } from "@/lib/content/words";

/**
 * The eyebrow, the title, the dek and the meta row — the sheet's mandatory
 * "Kopfzeile", which it summarises as: "Zwei Daten — PUBLISHED und UPDATED,
 * beide ISO. Dazu Lesezeit, Wortzahl, ein bis zwei Themenwörter. Die Zahlen
 * werden gerechnet, nicht geschätzt."
 *
 * THE NUMBERS ARE COMPUTED AND THE ROW SAYS SO. `12 MIN · 2 480 WORDS` comes out
 * of lib/content/words.ts, which counts the prose of this very file — the one
 * measured number on the page and the only one that could be faked without
 * anybody noticing. It is the sheet's own instruction, and it is invariant 1 read
 * forwards for once: not "do not print what nothing measured" but "measure it,
 * then print it."
 *
 * `UPDATED` IS ABSENT FROM EVERY ENTRY TODAY, and the row simply does not draw
 * it. The sheet lists the key as mandatory; lib/content/posts.ts argues why it
 * is optional here, and the short version is #284 — a hand-typed date nothing
 * checks. An entry that has never been revised has no revision date, and an
 * em dash in its place would say a number is missing rather than that a thing
 * did not happen.
 *
 * THE SYSTEM LINK CARRIES NO NUMBER, and the sheet's `SYSTEM 02 · RELAY →` does.
 * That `02` is `systems.no` and it comes from `/api/systems`; this page is prose
 * from the repository and prerenders whole, and one Suspense hole for two digits
 * would make a static page wait on an upstream to print a label. CLAUDE.md is
 * the tiebreak — "Keine Zahl in die UI, die nicht aus der API kommt" — so the
 * number is not drawn rather than invented, and the name that IS in the
 * repository is what the link says.
 */
export function PostHeader({
  post,
  size,
  systemHref,
  sourceHref,
  messages,
}: {
  post: PostMeta;
  size: ReadingSize;
  systemHref: string | null;
  sourceHref: string;
  messages: Messages;
}) {
  return (
    <header className="post-head">
      <p className="post-eyebrow">
        <span className="post-sys">SYS.04</span>
        <span className="post-log">{messages.navLog}</span>
        <span className="post-entry">
          {messages.blogEntry} {entryNumber(post)}
        </span>
        {systemHref === null || post.systemId === null ? null : (
          <Link className="post-system" href={systemHref}>
            {post.systemId} →
          </Link>
        )}
      </p>

      <h1>{post.title}</h1>
      <p className="post-deck">{post.deck}</p>

      <dl className="post-meta">
        <div>
          <dt>{messages.blogPublished}</dt>
          <dd>
            <time dateTime={post.published}>{post.published}</time>
          </dd>
        </div>

        {post.updated === null ? null : (
          <div>
            <dt>{messages.blogUpdated}</dt>
            <dd>
              <time dateTime={post.updated}>{post.updated}</time>
            </dd>
          </div>
        )}

        <div>
          {/* THE SHEET DRAWS THIS PAIR WITHOUT A LABEL and this row has one, which
              is a divergence of one word. Every other cell in the row is a
              term and a value; an unlabelled `<dd>` in the middle of them is a
              definition of nothing, and a reader who arrives at it by keyboard
              hears `12 MIN · 2 480 WORDS` with no idea which of the two numbers
              answers what. The unit is in the value for a sighted reader and
              nowhere for anybody else. */}
          <dt>{messages.blogRead}</dt>
          <dd className="post-size">
            {minutesLabel(size)} · {wordsLabel(size)}
          </dd>
        </div>

        <div>
          <dt>{messages.blogTags}</dt>
          <dd className="post-tags">{post.tags.join(" · ")}</dd>
        </div>
      </dl>

      {/* The sheet's own rule for this link: "Nur sinnvoll, solange der Inhalt im
          öffentlichen Repo liegt." It is, and this is the one place on the site
          where a reader can go and check that a sentence really says what the
          page rendered. */}
      <p className="post-source">
        <a href={sourceHref} rel="noreferrer">
          {messages.blogEditSource} ↗
        </a>
      </p>
    </header>
  );
}
