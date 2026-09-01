import { SkillRow } from "@/components/home/SkillRow";
import type { ModuleView } from "@/lib/api/training";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * One module of the log: a number, a name, its own track count, and its rows.
 *
 * THE COUNT IS `tracks.length` AND NOT A FIELD, which is the one place on this
 * page where counting is right rather than wrong. `trackCount` and
 * `evidenceSystems` in the head above are the api's, because ADR 0018 counts
 * them off the rows it serves and a second count could disagree with the list
 * it stands over. Here there is no field to disagree with: the contract gives a
 * module its tracks and no number, so the length of what is drawn IS the
 * number, and the two cannot come apart.
 *
 * A MODULE WITH NO TRACKS KEEPS ITS CARD and says `0 TRACKS`. ADR 0018 kept
 * `ListModules` as a query of its own for exactly this: "das Modul ist leer" is
 * a different statement from "das Modul gibt es nicht", and a card that
 * vanished would make the second one on the reader's behalf.
 *
 * THE HEADING LEVEL IS NOT HERE. `<h3>` would put five headings under a section
 * that has no `<h2>` of its own — `SectionHead` explains why it renders spans
 * and leaves the outline to M2's audit rather than settling it component by
 * component. The card is named by the `aria-labelledby` its list carries.
 */
export function ModuleCard({ module, messages }: { module: ModuleView; messages: Messages }) {
  const titleId = `mod-${module.no}`;
  const count = module.tracks.length;

  return (
    <div className="trn-mod">
      <p className="trn-mod-head">
        <span className="trn-mod-name" id={titleId}>
          <span className="trn-mod-no">{module.no}</span> {module.title.toUpperCase()}
        </span>
        <span className="trn-mod-count">
          {String(count)} {count === 1 ? "TRACK" : "TRACKS"}
        </span>
      </p>

      <ul className="trn-rows" aria-labelledby={titleId}>
        {module.tracks.map((track) => (
          <SkillRow key={track.name} track={track} messages={messages} />
        ))}
      </ul>
    </div>
  );
}
