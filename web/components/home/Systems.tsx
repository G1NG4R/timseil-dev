import Link from "next/link";

import { SystemRow } from "@/components/home/SystemRow";
import { EmptyState } from "@/components/state/EmptyState";
import { SectionHead } from "@/components/ui/SectionHead";
import { type SystemList, systemsMeta } from "@/lib/api/systems";
import { systemEntries } from "@/lib/home/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { NO_DATA } from "@/lib/state/words";

/**
 * SYS.02 whole: the head with its count, and one row per system.
 *
 * THE HEAD IS INSIDE THE STREAMED REGION for TrainingLog's reason one section
 * up. The sheet puts `02 SYSTEMS` in the head, that is the answer's own count,
 * and a head rendered before the answer would either carry no meta or need a
 * second pass for one line. `systemsMeta(null)` writes `— NO DATA SYSTEMS` and
 * keeps `SOURCE: /api/systems`, so the waiting head names what it waits for.
 *
 * THE LIST IS AN `<ol>` BECAUSE THE NUMBER IS THE ORDER. `01`, `02` are display
 * numbers out of the answer and the rows arrive sorted by them; a `<ul>` would
 * tell a screen reader that the sequence carries no meaning, when the sequence
 * is the first column. The numbers are rendered as text rather than left to the
 * marker for the same reason SkillRow renders its own: `01` is the system's
 * name for itself, not its position in a list, and the two can differ the day a
 * system is removed.
 *
 * THE EMPTY CASE NAMES THE ENDPOINT. An empty list would read as "there are no
 * systems", which is a claim about the work rather than about the api; `EmptyState`
 * with `homeSys02Down` says which read failed. Same shape, same argument, as
 * SYS.01 — and a different sentence, because it is a different endpoint.
 *
 * AND IT KEEPS THE WAY OUT, which is the half H5a nearly dropped. `SysSection`
 * rendered `WORK →` inside the panel while this was a shell, and replacing that
 * component with this one took the link with it — leaving `exit` in
 * lib/home/sections.ts as a field nothing read. A coarse-pointer test caught it
 * by counting: two interactive elements in `main`, one found.
 *
 * The panel is exactly where the exit matters most. STATE.05 asks an empty panel
 * for what is missing, why, and a way back, and a reader who came for the
 * systems while /api/systems is down has one: /work lists them from H6 on. It is
 * NOT rendered under a list that answered — there the rows are the way out, and
 * a second route to the same place is the extra tab stop SystemRow turns down.
 */
export function Systems({
  body,
  exit = null,
  messages,
}: {
  /** The answer, or `null` for both the fallback and a failed read. */
  body: SystemList | null;
  /** The way out of the empty state. `null` in the gallery, where there is a list. */
  exit?: { href: string; label: string } | null;
  messages: Messages;
}) {
  const entries = systemEntries(body);

  return (
    <section className="home-section sys" aria-labelledby="sec-sys-02">
      <SectionHead
        id="SYS.02"
        title="SELECTED WORK"
        titleId="sec-sys-02"
        meta={systemsMeta(body)}
      />

      {entries.length === 0 ? (
        <EmptyState heading={NO_DATA} reason={messages.homeSys02Down}>
          {exit === null ? null : (
            <p className="home-exit">
              <Link href={exit.href}>{exit.label} →</Link>
            </p>
          )}
        </EmptyState>
      ) : (
        <ol className="sys-list">
          {entries.map((entry) => (
            <SystemRow key={entry.slug} entry={entry} messages={messages} />
          ))}
        </ol>
      )}
    </section>
  );
}
