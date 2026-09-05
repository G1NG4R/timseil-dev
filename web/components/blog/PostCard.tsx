import Link from "next/link";

import { tagLabel } from "@/lib/blog/tags";
import type { PostMeta } from "@/lib/content/posts";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * One entry on `/blog`: date, title, subjects, reading time.
 *
 * THE NAME IS THE HANDOFF INVENTORY'S AND THE THING IS A ROW. `lib/gallery/
 * registry.ts` transcribes sixteen component names and one of them is
 * `PostCard`; the sheet's own design note is "Mono-Liste, keine Karten — Zeilen
 * scannen sich schneller als Kacheln". ADR 0066 met this exact mismatch on
 * `TrajectoryRail` and left the transcription alone, because "the inventory is a
 * second reading of the handoff and not a description of what shipped". So the
 * file keeps the inventory's name and draws what the artboard draws.
 *
 * NO `'use client'`. The hover is two declarations in styles/blog.css, the rule
 * `SystemRow` set in H3 and `WorkRow` kept in H6.
 *
 * THE CLASSES ARE `post-card-*` AND NOT `log-*`, WHICH WAS THE FIRST DRAFT.
 * `components/home/LogRow.tsx` already owns `.log-row`, `.log-date`,
 * `.log-title` and `.log-deck` in styles/home.css, and SYS.04 draws three
 * entries of this same corpus. Two components rendering the same posts under
 * one set of selectors would have made every rule and every test assertion
 * ambiguous about which page it meant.
 *
 * THE WHOLE ROW IS THE LINK, AND `WorkRow` REFUSES EXACTLY THAT — so the
 * divergence is argued rather than drifted into. What that row turned down was
 * THREE controls to one destination: a hover fill, a `CASE STUDY →` in the
 * identity block and a `→` in the last column, which is "a keyboard trap
 * dressed as thoroughness". The count is what mattered, not the wrapping. This
 * row has exactly one destination and nothing else to click — no repo address,
 * no second arrow — so one `<Link>` around the grid is ONE tab stop, the same
 * number `WorkRow` arrives at, and no nested interactive element exists to make
 * the markup invalid.
 *
 * AND THE LINK TEXT IS THE TITLE, WHICH IS WHY IT IS WRAPPED THIS WAY ROUND.
 * `WorkRow` has to invent an accessible name for a bare `→` because a system's
 * NAME is not a phrase anyone clicks. A log entry's title is exactly that
 * phrase, so wrapping the row makes the link announce itself out of the page's
 * own words instead of an `aria-label` written beside them. `PostFoot` already
 * builds its neighbour cards this way.
 *
 * SO THE ARROW IS DECORATION AND SAYS SO. It is inside the only link on the
 * row; read aloud it would add a glyph to a name that is already a sentence.
 *
 * THE DATE IS A `<time>`. It is the one machine-readable value in the row, it
 * is already `YYYY-MM-DD`, and `PostCrumb` marks the same value up the same way.
 */
export function PostCard({
  post,
  href,
  minutes,
  latest,
  messages,
}: {
  post: PostMeta;
  href: string;
  /** `12 MIN`, or nothing when the file behind the entry could not be read. */
  minutes: string | null;
  /** The newest entry carries a badge. The sheet: "größer, nicht anders". */
  latest: boolean;
  messages: Messages;
}) {
  return (
    <li
      className="post-card"
      // WHAT THE TWO AXES READ, ON THE ELEMENT THAT CARRIES THEM. H9b filters in
      // React rather than by walking the DOM as the sheet's script does, so
      // nothing in this site's own code needs this attribute — it is here so a
      // test can hold a rendered row against the chip that claims it, which is
      // the one assertion neither the filter's unit test nor a screenshot can
      // make. `WorkRow` carries `data-sk` for the same reason.
      data-tags={post.tags.join(" ")}
    >
      <Link className="post-card-link" href={href}>
        <time className="post-card-date" dateTime={post.published}>
          {post.published}
        </time>

        <span className="post-card-id">
          <span className="post-card-titlebar">
            <span className="post-card-title">{post.title}</span>
            {latest ? <span className="post-card-latest">{messages.blogIndexLatest}</span> : null}
          </span>
          {/* Drawn at both widths, and the 390 artboard is the reason it is
              here at all: it puts the dek under the title where the desktop row
              has room beside it. One element, one string, and layout.css moves
              it — a second, shorter set of words for the phone is #293. */}
          <span className="post-card-deck">{post.deck}</span>
        </span>

        <span className="post-card-tags">
          {post.tags.map((tag) => tagLabel(tag)).join(" · ")}
        </span>

        {/* Empty rather than absent: the grid has a column here and a row that
            skipped it would pull the cell after it one place left. `WorkRow`
            states the same rule for its figure cell. A file the reader listed
            and could not re-read is the only way this is null, and it is not
            `— NO DATA` — nobody asked for a measurement of a missing file. */}
        <span className="post-card-min">{minutes}</span>

        <span className="post-card-exit" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}
