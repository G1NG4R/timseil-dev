import { StateWord } from "@/components/state/StatusDot";
import { NoData } from "@/components/state/NoData";
import type { SourceView } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { type StateKey, stateLabel } from "@/lib/state/words";

/**
 * ROLE · STACK · YEAR · STATUS · SOURCE, in the plate with the corner brackets.
 *
 * THE ONLY THING THIS COMPONENT DECIDES IS THE ORDER. Every value arrives
 * resolved: the stack comes from `systems.stack`, which `make gen` fills out of
 * go.mod, package.json and compose.yaml, and the source axis comes from
 * lib/api/systems.ts. That is what makes design corrections #1 and #2 — the
 * sheet's `React Router 7` and `PostgreSQL 16` — unreachable rather than fixed:
 * there is no place in this file where a version could be typed.
 *
 * IT IS A `<dl>` AND NOT A GRID OF `<span>`s. Five key/value pairs are a
 * description list, and a screen reader then reads "ROLE, design, backend,
 * infrastructure" instead of ten unrelated fragments. The two-column grid is
 * `.spec-body`'s, so the markup and the picture agree without a wrapper per row.
 *
 * SOURCE IS ITS OWN AXIS, NOT PART OF THE STATE — K-21, and the schema enforces
 * it: a public system carries an address, a closed one carries a reason and no
 * link. "`<> PRIVATE` with no reason would be an excuse", so the rail prints the
 * reason underneath rather than the bare word.
 */
export function SpecRail({
  role,
  stack,
  year,
  state,
  hosting,
  source,
  messages,
}: {
  role: string;
  stack: string | null;
  year: string;
  state: StateKey | null;
  hosting: string;
  source: SourceView;
  messages: Messages;
}) {
  return (
    <aside className="rail spec" aria-label="SPEC">
      <p className="spec-label">SPEC</p>

      <dl className="spec-body">
        <dt className="spec-key">{messages.csRole}</dt>
        <dd className="spec-val">{role}</dd>

        <dt className="spec-key">STACK</dt>
        <dd className="spec-val">{stack ?? <NoData />}</dd>

        <dt className="spec-key">{messages.csYear}</dt>
        <dd className="spec-val">{year}</dd>

        <dt className="spec-key">{messages.csStatus}</dt>
        <dd className="spec-val">
          {state === null ? <NoData /> : <StateWord state={state} label={stateLabel(state, messages)} />}
          {" · "}
          {hosting}
        </dd>

        <dt className="spec-key">{messages.csSource}</dt>
        <dd className="spec-val">
          <SourceValue source={source} />
        </dd>
      </dl>
    </aside>
  );
}

function SourceValue({ source }: { source: SourceView }) {
  if (source === null) return <NoData />;

  if (source.access === "public") {
    return (
      <>
        {"<> PUBLIC · "}
        {/* `rel` rather than a target: the sheet draws no new-window marker, and
            a link that opens a tab without saying so is the thing a keyboard
            user finds out about last. */}
        <a href={source.url} rel="noreferrer">
          {source.url.replace(/^https:\/\//, "")}
        </a>
      </>
    );
  }

  return (
    <>
      {`<> PRIVATE · ${source.reason.toUpperCase()}`}
      <span className="spec-why">no link, and a reason instead</span>
    </>
  );
}
