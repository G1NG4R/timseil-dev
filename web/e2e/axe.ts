// The one axe policy, in one place.
//
// IT WAS INSIDE a11y.spec.ts UNTIL H13, and it moved for a reason rather than
// for tidiness: the 500 renders inside the real chrome, so `error.spec.ts` now
// looks at the same footer a11y.spec.ts looks at — and a second copy of the
// carried list would be a second copy of a DATE. One of the two would outlive
// its own reminder without anybody noticing, which is the exact failure the
// date exists to prevent.

/**
 * WCAG 2.2 AA, which is the standard the build plan names for M2.
 *
 * `best-practice` is deliberately absent. It is advice rather than the
 * standard, and a gate that fails on advice is a gate people learn to ignore.
 */
export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Rules carried with a reason and a date, in the shape tools/check-vuln.sh
 * already uses for a CVE that cannot be fixed today.
 *
 * A carried rule is not a disabled one: it is named, it points at the issue
 * that will remove it, and it has a date after which somebody has to look
 * again. The alternative — a gate that is permanently red — is a gate people
 * learn to run with `|| true`.
 */
export const CARRIED = [
  {
    rule: "target-size",
    issue: 257,
    until: "2026-11-30",
    why:
      "The seven theme swatches are 44 x 44 under `pointer: coarse` and 11 x 11 " +
      "under a fine one. WCAG 2.2 has no pointer exemption, so a mouse sees a " +
      "violation; the fix is a design decision about a row the Chrome sheet draws " +
      "at 11 px, not a CSS edit, and M6 is where it lands.",
  },
] as const;

export const carriedRules = new Set<string>(CARRIED.map((c) => c.rule));
