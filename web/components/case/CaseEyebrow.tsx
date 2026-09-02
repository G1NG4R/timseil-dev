import { NoData } from "@/components/state/NoData";
import { StatusDot } from "@/components/state/StatusDot";
import type { Messages } from "@/lib/i18n/messages/en";
import { type StateKey, stateLabel } from "@/lib/state/words";

/**
 * `02 · TIMSEIL.DEV · ● LIVE`, on one baseline.
 *
 * THE STATE DOT IS THE SMALL ONE. K-14 keeps the large hero dot to the
 * homepage: "Statuspunkt in der Meta-Leiste jeder Seite; groß im Hero nur auf
 * der Startseite." So this is StatusDot at the size every other row uses, and
 * the case study does not introduce a third measurement of the same mark.
 *
 * EVERY PROP MAY BE ABSENT, and the same component draws the resting state and
 * the answer — the seam ADR 0044 described, unchanged. A system whose state has
 * no word renders `— NO DATA` rather than a guess. Since H6 closed #289 all
 * three of the contract's values have a word, so nothing the api answers today
 * reaches that branch; it is kept for the value a newer build might send, which
 * is ADR 0035's overlapping start rather than a hypothetical.
 */
export function CaseEyebrow({
  systemNo,
  name,
  state,
  messages,
}: {
  systemNo: string | null;
  name: string;
  state: StateKey | null;
  messages: Messages;
}) {
  return (
    <p className="cs-eyebrow">
      <span className="cs-no">{systemNo ?? "—"}</span>
      <span className="cs-name">{name}</span>
      {state === null ? <NoData /> : <StatusDot state={state} label={stateLabel(state, messages)} />}
    </p>
  );
}
