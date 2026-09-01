import Link from "next/link";

import { LogRow } from "@/components/home/LogRow";
import { EmptyState } from "@/components/state/EmptyState";
import { SectionHead } from "@/components/ui/SectionHead";
import type { PostRead } from "@/lib/content/posts";
import { logEntries, logMeta } from "@/lib/home/posts";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA } from "@/lib/state/words";

/**
 * SYS.04 whole: the head with its count and its way out, and the newest entries.
 *
 * NO SUSPENSE BOUNDARY AND NO `*Live` TWIN, which makes this the first section
 * of this page since the hero to arrive in one piece. The three above it ask the
 * api and therefore cannot be drawn before it answers; this one reads files that
 * are in the image, so it is prerendered whole and lib/home/posts.ts explains
 * why no `use cache` profile is derived for it.
 *
 * AND THAT IS WORTH MORE THAN ONE LESS FILE. H4, H5a and H5b each paid for the
 * same limit and wrote it down three times: the end-to-end rig runs a production
 * build with NO api, so on `/` every built section stands in its outage panel
 * and no row, cell or column of it is in the document. Every measurement had to
 * move to /dev/components. SYS.04 is the first section since H3 the rig can
 * measure ON THE PAGE, with the real fourteen posts behind it — so its oracle
 * entries carry no `on` field, and its row geometry is asserted where it ships.
 *
 * THE HEAD IS OUTSIDE NOTHING, because there is nothing to be outside of. Its
 * meta carries the count like SYS.01's and SYS.02's do, and the count is
 * `logEntries().length` rather than the sheet's `LATEST 03`.
 *
 * ONE WAY OUT AND IT IS IN THE HEAD, WHICH IS NOT THE TRAP SystemRow REFUSED.
 * That one was two links in ONE ROW to ONE page — a keyboard trap dressed as
 * thoroughness. This is the section's only interactive element, because
 * LogRow.tsx gives up the row link until H9 exists; without it the whole of
 * SYS.04 would be inert, and the sheet draws it at both widths.
 *
 * THE SHEET WRITES `SYSTEM 02 · CASE STUDY →` AND THE `02` IS DROPPED. That
 * number comes from /api/systems, which this section does not read — and
 * `systemsMeta` one file over says exactly what typing it here would be worth:
 * "the seed happens to hold two, which is exactly the coincidence that makes a
 * typed number survive being wrong". Recorded as a divergence, with that reason.
 *
 * TWO EMPTINESSES, ONE PANEL, WHICH IS `Systems.tsx`'s ARRANGEMENT. `00 ENTRIES`
 * says the directory was read and holds nothing — the statement `00 SYSTEMS`
 * makes one section up. `— NO DATA` says the directory could not be read at all,
 * which on this site means an image that shipped without its content. They are
 * different claims and they get different sentences.
 */
export function Log({
  read,
  caseStudyHref = null,
  exit = null,
  messages,
}: {
  /** The directory read, or `null` when it could not be read. */
  read: PostRead | null;
  /** Where the head's link goes, resolved for the locale by the caller. */
  caseStudyHref?: string | null;
  /** The way out of the empty state. `null` in the gallery. */
  exit?: { href: string; label: string } | null;
  messages: Messages;
}) {
  const entries = logEntries(read);

  return (
    <section className="home-section log" aria-labelledby="sec-sys-04">
      <SectionHead
        id="SYS.04"
        title="LOG"
        titleId="sec-sys-04"
        action={
          caseStudyHref === null ? undefined : <Link href={caseStudyHref}>CASE STUDY →</Link>
        }
        meta={logMeta(read)}
      />

      {entries.length === 0 ? (
        <EmptyState
          heading={read === null ? NO_DATA : "00 ENTRIES"}
          reason={read === null ? messages.homeSys04Down : messages.homeSys04Empty}
        >
          {exit === null ? null : (
            <p className="home-exit">
              <Link href={exit.href}>{exit.label} →</Link>
            </p>
          )}
        </EmptyState>
      ) : (
        <ol className="log-list">
          {entries.map((post) => (
            <LogRow key={post.slug} post={post} />
          ))}
        </ol>
      )}
    </section>
  );
}
