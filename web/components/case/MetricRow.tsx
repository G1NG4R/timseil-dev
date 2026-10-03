import { EmptyState } from "@/components/state/EmptyState";
import { LoadingLines } from "@/components/state/LoadingLines";
import { MetricTile } from "@/components/ui/MetricTile";
import { metricTiles, type SystemDetail } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import type { Locale } from "@/lib/i18n/routes";
import { readData, type Read } from "@/lib/state/read";
import { NO_DATA } from "@/lib/state/words";

/**
 * The five tiles, and the note that explains them while they are empty.
 *
 * THE NOTE IS SHOWN ONLY WHILE ALL FIVE ARE EMPTY, and that is the one decision
 * this component makes. Case Study 02 draws it under five em dashes and says
 * why: "These five tiles fill from the first day of operation and stay empty
 * until then." A caption that stayed after the tiles filled would be describing
 * a state that had passed — and a reader who saw it beside a number would read
 * it as a warning about that number.
 *
 * AND UNTIL U7 IT WAS THE WRONG SENTENCE TWICE OVER. `EMPTY ON PURPOSE` explains
 * a system that has not run yet; the fallback and a failed read both reached it,
 * so production served "these five tiles fill from the first day of operation"
 * in the same document as `80.05 %` uptime — measured on 28.09.2026, twice per
 * response. The note now belongs to the answer that HAS no numbers, which is the
 * only state it was ever written for.
 *
 * `INCIDENTS 0` COUNTS AS FILLED, which is the right way round: a measured zero
 * is a measurement, and the tile beside it exists to argue exactly that. So a
 * live system with no incidents and no other numbers still shows the note,
 * because four of the five have nothing — and the moment uptime arrives, the
 * note goes.
 */
export function MetricRow({
  read,
  note,
  waitSource,
  messages,
  locale,
}: {
  read: Read<SystemDetail>;
  /** Why the five are empty, when the answer says they are. From the case study. */
  note: { label: string; text: string };
  /** The address the wait names, resolved by the caller. See OpsSection. */
  waitSource: string;
  messages: Messages;
  /** Which language's decimal mark the five numbers carry. U8; ADR 0083. */
  locale: Locale;
}) {
  // DERIVED HERE SINCE U7, not handed in. The two callers used to run
  // `metricTiles` themselves and pass five tiles, which is why this component
  // could not tell a wait from an outage: `value: null` is the same in both, and
  // it has to be. The answer comes in whole now and the derivation happens once.
  const tiles = metricTiles(readData(read), messages, locale);
  const measured = tiles.filter((tile) => tile.value !== null).length;

  return (
    <div>
      <div className="ops-tiles">
        {tiles.map((tile) => (
          <MetricTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} note={tile.note} />
        ))}
      </div>

      {read.kind === "waiting" ? (
        <LoadingLines what="metrics" source={waitSource} />
      ) : read.kind === "down" ? (
        // `EmptyState` AND NOT `.cs-note`, which is the one styling decision in
        // this file. The note is amber and says "empty on purpose"; the four
        // regions on the homepage answer a failed read with the dim panel, and a
        // fifth shape for the fifth instance of one sentence would be a tone
        // nobody could explain. The amber stays with the sentence it was cut for.
        <EmptyState heading={NO_DATA} reason={messages.csMetricsDown} />
      ) : measured > 1 ? null : (
        <aside className="cs-note">
          <p className="cs-note-label">{note.label}</p>
          <p>{note.text}</p>
        </aside>
      )}
    </div>
  );
}
