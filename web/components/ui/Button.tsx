// Server Components. None of the four parts in this directory has state, an
// event handler or a browser API of its own — a caller that needs one passes it
// in, and only that caller becomes a client component.

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The three buttons of the Foundations sheet.
 *
 * `primary` is the cyan fill, `secondary` the outline, `ghost` a text button
 * with no border. There is no fourth: the sheet draws three and a fourth would
 * be a decision about hierarchy that no page has asked for yet.
 *
 * THE HOVER IS NOT HERE, and that is the handoff's own instruction rather than
 * a preference — "Hover gehört in CSS, nicht in JS". styles/ui.css carries one
 * rule per variant, behind `hover: hover` so that a touch screen gets the rest
 * state as the State Language sheet requires.
 */
export function Button({
  children,
  variant = "primary",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="btn" data-variant={variant}>
      {children}
    </button>
  );
}
