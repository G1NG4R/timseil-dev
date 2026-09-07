import Link from "next/link";

import type { PostMeta } from "@/lib/content/posts";

/**
 * One entry of SYS.04: when it was written, what it is called, what it is about.
 *
 * THE ROW IS A LINK, AND UNTIL H9c IT WAS NOT. The sheet draws a `→` in a third
 * column, a pointer cursor and a hover fill on the whole row — three promises
 * about a click — and H5c gave up all three together because `/blog/<slug>`
 * answered 404 and invariant 5 is that evidence never points into nothing. The
 * renderer exists since H9a and the index since H9b. The promise can be kept, so
 * it is, and the hover comes back WITH the destination rather than before it.
 *
 * ONE LINK AROUND THE GRID, WHICH IS `PostCard`'s SHAPE AND NOT `WorkRow`'s
 * REFUSAL. What that row turned down was THREE controls to one destination — "a
 * keyboard trap dressed as thoroughness". A log entry has exactly one place to
 * go and nothing else on the line to click, so one `<Link>` is ONE tab stop, the
 * same number `WorkRow` arrives at, and there is no nested control to make the
 * markup invalid. components/blog/PostCard.tsx draws the same corpus the same
 * way one page over; the two rows agreeing was the point of doing this second.
 *
 * THE LINK'S NAME IS THE ROW'S OWN WORDS, which is why it is wrapped this way
 * round. `WorkRow` has to invent an `aria-label` for a bare `→` because a
 * system's NAME is not a phrase anyone clicks; an entry's title IS that phrase,
 * so wrapping the row means no name has to be written beside the page.
 *
 * Measured rather than assumed, because the wrapping decides it: the name is
 * the date, then the title, then the dek — not the title alone. `PostCard`
 * announces the same shape one page over, which is the answer to whether a
 * leading date is worth avoiding: not at the price of two rows of one corpus
 * reading differently. The arrow is outside that and says so — read aloud it
 * would add a glyph to a sentence.
 *
 * THE HREF IS RESOLVED BY THE CALLER, like `Log`'s `caseStudyHref` and
 * `BlogList`'s. `localeHref` needs a locale, this component has no business
 * knowing one, and a leaf that reached for `postPath` itself would be the second
 * place on this site that decides what a post's address is.
 *
 * `<time>` AND NOT A SPAN, because the string is a date and the machine may as
 * well be told. `dateTime` takes the value verbatim: lib/content/posts.ts keeps
 * `published` as text precisely so that nothing between the file and this
 * attribute can re-interpret a day.
 *
 * NO FORMATTING EITHER. `2026-09-01` is what the sheet draws and what the file
 * writes, and a locale-formatted date here would be the one string on this page
 * that reads differently in three routes serving identical English — lib/i18n
 * resolves `/de` and `/fr` to English until P6, and a date that localised itself
 * anyway would claim a translation the page does not have.
 */
export function LogRow({ post, href }: { post: PostMeta; href: string }) {
  return (
    <li className="log-row">
      <Link className="log-row-link" href={href}>
        <time className="log-date" dateTime={post.published}>
          {post.published}
        </time>
        <span className="log-text">
          <span className="log-title">{post.title}</span>
          <span className="log-deck">{post.deck}</span>
        </span>
        <span aria-hidden="true" className="log-exit">
          →
        </span>
      </Link>
    </li>
  );
}
