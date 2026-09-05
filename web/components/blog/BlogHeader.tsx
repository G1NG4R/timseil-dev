import Link from "next/link";

import { NoData } from "@/components/state/NoData";
import { NO_DATA } from "@/lib/state/words";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The head of `/blog`: what the page is, and what the log can say about itself.
 *
 * `<h1>` HERE AND ON EVERY WIDTH, which is `WorkHeader`'s note and the same
 * canvas artefact underneath it: the 1440 artboard writes `<h1>` and the 390
 * artboard writes `<h2>` for the same words on the same page. Shipping that
 * would give the phone a document with no level-one heading. K-08 settles the
 * SIZE at `52 / 34` and layout.css already switches it at 720.
 *
 * FOUR ROWS, AND ONLY TWO OF THEM ARE MEASUREMENTS. `ENTRIES` and `LATEST` are
 * counted off the directory; `FEED` and `SYSTEM` are addresses. They share a
 * rail because the sheet draws them in one, and the two kinds are told apart by
 * the one thing that matters — a number can be `— NO DATA`, an address cannot.
 *
 * THE SHEET WRITES `SYSTEM · 02 CASE STUDY →` AND THE `02` IS DROPPED, which is
 * the second time this exact number has been dropped from this exact head.
 * ADR 0062 §3 took it out of SYS.04's on the homepage: it comes from
 * `/api/systems`, and this page reads no api at all. `systemsMeta` names what
 * typing it would be worth — "the seed happens to hold two, which is exactly
 * the coincidence that makes a typed number survive being wrong."
 *
 * `— NO DATA` STANDS IN ONE ROW, NOT IN FOUR. Repeating it is four statements
 * where there is one fact, and `WorkHeader` measured what that costs at 390:
 * the placeholder is 130px of non-wrapping mono and it pushed the document
 * wider than the viewport. Here the two addresses are still true when the
 * directory cannot be read — the feed exists, the case study exists — so they
 * keep standing and only the counted rows change.
 *
 * AND `LATEST` DISAPPEARS RATHER THAN SAYING `— NO DATA` WHEN THE LOG IS EMPTY.
 * lib/blog/counts.ts carries that argument: a dash there would report a figure
 * as missing when in truth nothing has been written yet, which is ADR 0070 §2's
 * reading of the `updated` key one page over.
 */
export function BlogHeader({
  entries,
  latest,
  feedHref,
  caseStudyHref,
  messages,
}: {
  /** `23`, `00`, or `— NO DATA`. Already decided by `blogEntries`. */
  entries: string;
  /** The newest date, `— NO DATA`, or `null` for "draw no row". */
  latest: string | null;
  feedHref: string;
  /** `null` when there is no case study to point at. */
  caseStudyHref: string | null;
  messages: Messages;
}) {
  return (
    <div className="blog-head">
      <div className="blog-intro">
        <p className="blog-eyebrow">
          <span className="blog-marker">SYS.04</span> — LOG
        </p>
        <h1>{messages.blogIndexTitle}</h1>
        <p className="blog-deck">{messages.blogIndexDeck}</p>
      </div>

      <dl className="blog-stats">
        <div className="blog-stat" data-stat="entries">
          <dt>{messages.blogIndexEntries}</dt>
          <dd>{entries === NO_DATA ? <NoData /> : entries}</dd>
        </div>

        {latest === null ? null : (
          <div className="blog-stat" data-stat="latest">
            <dt>{messages.blogIndexLatest}</dt>
            <dd>{latest === NO_DATA ? <NoData /> : <time dateTime={latest}>{latest}</time>}</dd>
          </div>
        )}

        <div className="blog-stat" data-stat="feed">
          <dt>{messages.blogIndexFeed}</dt>
          <dd>
            {/* Not `next/link`: the feed is a route handler outside `app/[lang]/`
                and it is not a page of this app. `PostHeader`'s source link is a
                plain anchor for the same reason. */}
            <a href={feedHref}>RSS · {feedHref} ↗</a>
          </dd>
        </div>

        {caseStudyHref === null ? null : (
          <div className="blog-stat" data-stat="system">
            <dt>{messages.blogIndexSystem}</dt>
            <dd>
              <Link href={caseStudyHref}>CASE STUDY →</Link>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
