// 'use client' for one branch: which of the two footers this page gets. The
// answer is a function of the path, and the path is a client hook.
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { footerVariant } from "@/lib/chrome";

/**
 * Renders its children on the pages CHR.01 marks `lang`, and nothing on the
 * rest.
 *
 * THE CHILDREN ARE A SERVER COMPONENT AND STAY ONE. `<FooterLeadGate>` receives
 * `<FooterLead/>` as `children`, which means React renders it on the server and
 * hands this component the finished output — the contact block never enters the
 * client bundle. Only this branch does, and it is the twelve lines you see.
 *
 * The cost, stated because it is real: on a short-footer page the RSC payload
 * still carries FooterLead's output and then drops it. A few hundred bytes,
 * against a version where every long page has to remember to render the block
 * itself — and a forgotten one is a silently wrong page no test can see.
 */
export function FooterLeadGate({ children }: { children: ReactNode }) {
  return footerVariant(usePathname()) === "long" ? children : null;
}
