import Link from "next/link";

import type { NextSystem as Next } from "@/content/case-studies/types";

/**
 * The card that closes the page: what is being built next.
 *
 * NO NUMBER AND NO STATE WORD, and types.ts carries the argument. The sheet
 * draws `05 FOUNDRY ◇ QUEUED`; both halves of that live in `systems`, and
 * reading them would mean a fifth `<Suspense>` boundary and a second endpoint on
 * a page that makes one upstream call — for a card. Writing them here instead
 * would put a measured value in a file whose first line says it holds none.
 *
 * IT LINKS TO THE WORK INDEX, NOT TO THE SYSTEM. `vat-check` is `queued`, has no
 * repository and nothing written about it, so `content/case-studies/index.ts`
 * gives it no page and `/work/vat-check` is a 404 by design. A card that linked
 * there would be evidence pointing into nothing — invariant 5, in a place the
 * database cannot enforce it. The index is the page whose job this is, and H6 is
 * where the card can be given a real source.
 */
export function NextSystem({
  next,
  label,
  href,
  more,
}: {
  next: Next;
  label: string;
  /** The Work Index, language-prefixed by the caller. */
  href: string;
  /** The link's own accessible name — "Work" reads as nothing out of context. */
  more: string;
}) {
  return (
    <Link className="cs-next cs-panel" href={href} aria-label={`${label}: ${next.name}`}>
      <span className="spec-label">{label}</span>
      <span className="cs-next-name">{next.name}</span>
      <span className="cs-next-detail">{next.detail}</span>
      <span className="cs-next-more" aria-hidden="true">
        {more} →
      </span>
    </Link>
  );
}
