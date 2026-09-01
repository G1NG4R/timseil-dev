import type { PostMeta } from "@/lib/content/posts";

/**
 * One entry of SYS.04: when it was written, what it is called, what it is about.
 *
 * NO LINK, AND THAT IS THE DECISION OF THIS PHASE RATHER THAN A GAP. The sheet
 * draws a `→` in a third column, a pointer cursor and a hover fill on the whole
 * row — all three say "this goes somewhere", and until H9 builds the renderer
 * `/blog/<slug>` is a 404. Invariant 5 is that evidence never points into
 * nothing, and this repository has answered the same question the same way
 * twice already: components/case/IncidentLog.tsx prints `post_slug` as text
 * rather than wrapping it in an `<a>`, and lib/seo/feed.ts serves an EMPTY feed
 * rather than one full of links to pages that do not exist.
 *
 * SO THE HOVER GOES WITH IT. A row that lights up under the pointer and does
 * nothing when clicked is worse than a row that does not light up: it is the
 * dead control STATE.05 refuses, with an invitation attached. The section keeps
 * ONE way out — the link in its head — and components/home/Log.tsx says why that
 * one is not the same mistake.
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
export function LogRow({ post }: { post: PostMeta }) {
  return (
    <li className="log-row">
      <time className="log-date" dateTime={post.published}>
        {post.published}
      </time>
      <span className="log-text">
        <span className="log-title">{post.title}</span>
        <span className="log-deck">{post.deck}</span>
      </span>
    </li>
  );
}
