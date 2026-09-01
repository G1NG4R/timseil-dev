import type { Messages } from "@/lib/i18n/messages/en";
import { TRACK_STATES, trackLabel, type TrackState } from "@/lib/state/words";

/**
 * The four words, and what each of them is a claim about.
 *
 * IT IS THE DERIVATION IN WORDS. `v_track_states` counts live systems; this
 * says what those counts mean, in the order the counting goes. Without it the
 * page shows four labels and asks the reader to guess whether CORE is better
 * than APPLIED or merely different — and the answer is the whole argument of
 * SYS.01: it is not a self-assessment scale, it is a count of systems.
 *
 * IT RENDERS EVERY STATE, INCLUDING THE TWO NOTHING REACHES TODAY. The seed
 * produces 13 x applied and 9 x queued; CORE and LEARNING are drawn anyway,
 * because the legend explains the rule rather than the current data, and a
 * legend that grew a row on the day the log first earned one would be a legend
 * nobody could have read in advance.
 *
 * `TRACK_STATES` IS THE LOOP, not four literals: the record below is typed
 * against `TrackState`, so a fifth state cannot be added to the vocabulary
 * without the compiler asking what it means here.
 */
const GLOSS: Record<TrackState, keyof Messages> = {
  core: "scaleCore",
  applied: "scaleApplied",
  learning: "scaleLearning",
  queued: "scaleQueued",
};

export function ScaleLegend({ messages }: { messages: Messages }) {
  return (
    <div className="trn-scale">
      <p className="trn-scale-head">SCALE</p>
      <ul className="trn-scale-list">
        {TRACK_STATES.map((state) => (
          <li key={state} className="trn-scale-row" data-track-state={state}>
            <span className="trn-state">{trackLabel(state, messages)}</span>
            {/* The em dash is the sheet's and it is text rather than CSS: here
                it separates two halves of one sentence a screen reader should
                read together, which is the opposite of the arrow in SkillRow. */}
            <span className="trn-scale-why">— {messages[GLOSS[state]]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
