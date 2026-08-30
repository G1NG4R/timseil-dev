import { MetricTile } from "@/components/ui/MetricTile";
import type { MetricValue } from "@/lib/api/systems";

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
 * `INCIDENTS 0` COUNTS AS FILLED, which is the right way round: a measured zero
 * is a measurement, and the tile beside it exists to argue exactly that. So a
 * live system with no incidents and no other numbers still shows the note,
 * because four of the five have nothing — and the moment uptime arrives, the
 * note goes.
 */
export function MetricRow({
  tiles,
  note,
}: {
  tiles: readonly MetricValue[];
  note: { label: string; text: string };
}) {
  const measured = tiles.filter((tile) => tile.value !== null).length;

  return (
    <div>
      <div className="ops-tiles">
        {tiles.map((tile) => (
          <MetricTile key={tile.label} label={tile.label} value={tile.value} unit={tile.unit} note={tile.note} />
        ))}
      </div>

      {measured > 1 ? null : (
        <aside className="cs-note">
          <p className="cs-note-label">{note.label}</p>
          <p>{note.text}</p>
        </aside>
      )}
    </div>
  );
}
