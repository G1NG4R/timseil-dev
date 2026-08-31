import Link from "next/link";

import { EmptyState } from "@/components/state/EmptyState";
import { SectionHead } from "@/components/ui/SectionHead";
import { SOON } from "@/lib/state/words";

/**
 * One marker of HOME.01, and what it says while it is empty.
 *
 * THE EMPTY STATE IS THE PHASE, not what is left of it. Stage H's own preamble
 * puts it first — "bauen, Leerzustand zuerst" — and this page ships four of
 * them at once, which is more empty states than any page on this site.
 *
 * SO IT IS `EmptyState` AND NOT A BARE `[SOON]`. The state sheet asks a panel
 * for three things: what is missing, why, and a way back. EmptyState makes the
 * first two required in its signature — "DISABLED SAGT WARUM: ein toter Zustand
 * ohne Begründung ist ein Bug" — and the third is optional here because two of
 * the four sections genuinely have nowhere to send a reader.
 *
 * `NoData` WOULD BE THE WRONG COMPONENT and the difference is the whole state
 * language: there a number is missing, here a component is. `— NO DATA` on a
 * section that has never been built would claim the api was asked and said
 * nothing.
 *
 * THE HEADING CARRIES NO NUMBER, and the sheet's metas do: `22 TRACKS`,
 * `02 SYSTEMS`, `LATEST 03`. Those are figures this phase has not been given,
 * so `SectionHead` is rendered without its `meta` — the same omission H2a made
 * on the case study, for the same reason.
 */
export function SysSection({
  id,
  title,
  titleId,
  reason,
  exit,
}: {
  id: string;
  title: string;
  titleId: string;
  reason: string;
  exit: { href: string; label: string } | null;
}) {
  return (
    <section className="home-section" aria-labelledby={titleId}>
      <SectionHead id={id} title={title} titleId={titleId} />

      <EmptyState heading={SOON} reason={reason}>
        {exit === null ? null : (
          <p className="home-exit">
            <Link href={exit.href}>{exit.label} →</Link>
          </p>
        )}
      </EmptyState>
    </section>
  );
}
