import { NoData } from "@/components/state/NoData";

/**
 * One measured number, or the honest absence of one.
 *
 * `value` IS OPTIONAL AND `0` IS A VALUE. The check is `undefined` and `null`,
 * never falsiness: an error rate of zero is the best number this site can
 * print, and `!value` would hide it behind `— NO DATA`. That is invariant 1
 * read backwards, and it is a one-character mistake.
 *
 * The empty tile draws a DASHED border where a filled one draws a solid. The
 * sheet asks for the second feature beside colour on every state, and here it
 * is the border-style — the same distinction StatusDot draws with a disc and a
 * short rule. `NoData` supplies the string, so `— NO DATA` still exists exactly
 * once in the tree.
 *
 * `warn` is for a number that is real and bad. It stays amber rather than
 * alert: the sheet reserves red for one moment per page.
 *
 * `note` IS ISSUE #208, AND IT QUALIFIES THE VALUE RATHER THAN ADDING ONE. The
 * uptime tile is the case it was added for: "100.00 %" reads the same whether
 * five of ninety-one days were measured or all of them, and on a case study the
 * grid that would show the gaps is a screen further down — on the badge and in
 * the footer it does not exist at all. So the tile carries the coverage under
 * the figure. It is deliberately not a second `value`: a tile with two numbers
 * is two tiles.
 */
export function MetricTile({
  label,
  value,
  unit,
  note,
  warn,
}: {
  label: string;
  value?: number | string | null;
  unit?: string;
  note?: string;
  warn?: boolean;
}) {
  const has = value !== undefined && value !== null;

  return (
    <div className="tile" data-has={has ? "yes" : "no"} data-warn={has && warn === true ? "" : undefined}>
      <p className="tile-label">{label}</p>
      <p className="tile-value">
        {has ? (
          <>
            {value}
            {unit === undefined ? null : <span className="tile-unit">{unit}</span>}
          </>
        ) : (
          <NoData />
        )}
      </p>
      {note === undefined ? null : <p className="tile-note">{note}</p>}
    </div>
  );
}
