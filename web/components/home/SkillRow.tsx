import { NoData } from "@/components/state/NoData";
import type { TrackView } from "@/lib/api/training";
import type { Messages } from "@/lib/i18n/messages/en";
import { trackLabel } from "@/lib/state/words";

/** Four segments, so the bar can be counted rather than compared. */
const SEGMENTS = [0, 1, 2, 3];

/**
 * One track: what it is called, what it is in, and what proves it.
 *
 * THE EVIDENCE LINE IS ALWAYS READABLE, and that is the one decision in this
 * component. The handoff inventory lists this part's states as "rest 28 %" and
 * "hover 100 % + beleg", and the build plan copies that; the sheet this phase
 * is built from says the opposite in as many words — "Nachweis-Zeile ist immer
 * voll lesbar; beim Hover hebt sich die Zeile an" — and lists the hidden
 * variant as an option it did NOT take. The sheet wins, and the build plan's
 * next sentence wins twice: "die Information darf nie nur in der Deckkraft
 * liegen." A row whose evidence only exists on hover has no evidence at all on
 * a phone, which is the device this site is most often read on.
 *
 * SO THE HOVER CARRIES NOTHING. It lifts the row and brightens the system
 * names, which is decoration over information that is already there. That is
 * also why "Skill-Zeilen-Hover auf Touch prüfen" is not on this phase's list:
 * there is nothing behind the hover to check for.
 *
 * NO LINK, AND NO `<button>`. The sheet's "Try next" imagines a row that leads
 * to the systems it names, and SYS.02 does not exist until H5 — a control that
 * goes nowhere is the dead state STATE.05 calls a bug, and it would be
 * twenty-two tab stops leading nowhere in the phase that owes axe a green run.
 *
 * THE BAR IS `aria-hidden`, THE WORD IS NOT. Both say the same thing and a
 * screen reader should hear it once. The bar exists for the eye that skims a
 * column of twenty-two rows, and for the greyscale screenshot in which the
 * tone is gone — `TRACK_MARKS` holds four distinct lengths so that it keeps
 * working there, and words.test.ts refuses a fifth state that shares one.
 */
export function SkillRow({ track, messages }: { track: TrackView; messages: Messages }) {
  return (
    <li className="trn-row" data-track-state={track.state ?? undefined}>
      <p className="trn-head">
        <span className="trn-name">{track.name}</span>
        {/* `— NO DATA` rather than a guess. A state word this build does not
            know arrives from a contract newer than this container (ADR 0035),
            and mapping it onto the nearest one we do know would be an invented
            claim about somebody's skill. lib/api/training.ts made that call;
            this only renders it. */}
        {track.state === null ? (
          <NoData />
        ) : (
          <span className="trn-state">{trackLabel(track.state, messages)}</span>
        )}
      </p>

      <span className="trn-bar" aria-hidden="true">
        {SEGMENTS.map((segment) => (
          // Presence, not a value: `data-on="false"` would match `[data-on]`
          // too, the same trap StatusDot documents for `data-pulse`.
          <span key={segment} className="trn-seg" data-on={segment < track.steps ? "" : undefined} />
        ))}
      </span>

      <p className="trn-evi">
        <span className="trn-pre">{track.evidence.prefix}</span>
        {/* The arrow belongs to the target and not to the prefix, so it cannot
            outlive it: `NO SYSTEM YET` with nothing after it is a whole
            sentence, and an arrow pointing into nothing is not. home.css draws
            it, which keeps it out of the accessibility tree and out of anything
            a visitor copies — the same move `.st-log` makes with its `> `. */}
        {track.evidence.text === null ? null : (
          <span className="trn-sys">{track.evidence.text}</span>
        )}
      </p>
    </li>
  );
}
