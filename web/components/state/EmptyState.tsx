import type { ReactNode } from "react";

/**
 * Nothing matched, and here is why, and here is the way back.
 *
 * STATE.05 asks for all three: "Leer heißt: erklären, warum leer, und einen Weg
 * zurück anbieten" and, sharper, "DISABLED SAGT WARUM: 'queued' oder '0
 * treffer' statt einfach ausgegraut. Ein toter Zustand ohne Begründung ist ein
 * Bug."
 *
 * SO `reason` IS REQUIRED. The sheet's own example is not "no results" but "rust
 * ist LEARNING, nicht APPLIED — noch kein system damit im betrieb": the reason
 * is what turns an empty list from a dead end into an answer. A panel that
 * could be rendered without one would eventually be.
 *
 * `filters` and `children` are optional because not every empty list came from
 * a filter — a blog with no posts has nothing to reset.
 */
export function EmptyState({
  heading,
  reason,
  filters,
  children,
}: {
  heading: string;
  reason: string;
  /** What is currently narrowing the list, shown so the reader can see the
   *  cause of the emptiness rather than infer it. */
  filters?: readonly string[];
  /** The way back — a reset link or button. The caller owns it, because only
   *  the caller knows what "back" means on its page. */
  children?: ReactNode;
}) {
  return (
    <div className="st-empty-panel" data-tone="dim">
      <p className="st-empty-head">{heading}</p>
      <p className="st-empty-reason">{reason}</p>
      {filters === undefined || filters.length === 0 ? null : (
        <p className="st-empty-filters">
          {filters.map((filter) => (
            <span key={filter}>{filter}</span>
          ))}
        </p>
      )}
      {children}
    </div>
  );
}
