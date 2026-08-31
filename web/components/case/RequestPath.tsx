import type { Hop, Lane } from "@/content/case-studies/types";

/**
 * The request path, and the lanes that are not a request.
 *
 * WHY THE ARROWS ARE `aria-hidden` AND THE ORDER IS AN `<ol>`. The sheet draws
 * five boxes with a `→` between each pair, and the arrow is the whole claim of
 * the section: these things happen in this order. A screen reader that read
 * "right arrow" four times would get the decoration and lose the claim, so the
 * order lives in the list element, where it is announced as "list, 5 items", and
 * the glyphs are hidden.
 *
 * WHAT IS NOT DRAWN, AND WHY IT IS NOT `— NO DATA`. The Template puts `[—ms]`
 * under every arrow — a hop latency. Nothing measures per-hop latency here and
 * no phase plans to, so an em dash would not be an honest absence but a promise:
 * `— NO DATA` says "this arrives later", and it does not. H1 made the same call
 * on the uptime tile, which carries no second line at all rather than a second
 * dash when the window is unknown. The arrow keeps its column and stands alone.
 *
 * `own` COMES FROM THE CONTENT, NOT FROM A CLASS LIST. Two of the five stations
 * are code in this repository and the sheet gives them a signal border; the
 * distinction is the section's argument, so it is a field on the hop and this
 * component only spends it.
 */
export function RequestPath({ hops, lanes, lanesLabel }: {
  hops: readonly Hop[];
  lanes: readonly Lane[];
  lanesLabel: string;
}) {
  return (
    <div className="arch">
      <ol className="arch-path">
        {hops.map((hop, index) => (
          <li className="arch-hop" data-own={hop.own ? "yes" : "no"} key={hop.key}>
            {index === 0 ? null : (
              <span className="arch-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className="arch-box">
              <span className="arch-key">{hop.key}</span>
              <span className="arch-name">{hop.name}</span>
              <span className="arch-detail">{hop.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="arch-lanes-label">{lanesLabel}</p>

      <dl className="arch-lanes">
        {lanes.map((lane) => (
          <div className="arch-lane" key={lane.key}>
            <dt>{lane.key}</dt>
            <dd>{lane.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
