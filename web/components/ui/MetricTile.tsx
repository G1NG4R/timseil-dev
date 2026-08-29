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
 */
export function MetricTile({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value?: number | string | null;
  unit?: string;
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
    </div>
  );
}
