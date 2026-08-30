import Link from "next/link";

/**
 * `WORK / 02 TIMSEIL.DEV`.
 *
 * K-16: every page carries a way back, and this one points at `/work` — still
 * the `[SOON]` stub H6 replaces. A stub is a place; a breadcrumb with no link
 * is a crumb nobody can follow.
 *
 * `label` IS THE SLUG WHEN THE API HAS NOT ANSWERED, and deliberately not
 * `— NO DATA`. The crumb names the address the visitor is at, and that address
 * is known whatever the api says — an em dash here would claim not to know
 * where the reader is standing. The number and the display name are the parts
 * that come from the answer, so they are the parts that wait.
 */
export function CaseCrumb({ href, back, label }: { href: string; back: string; label: string }) {
  return (
    <p className="cs-crumb">
      <Link href={href}>{back}</Link>
      {" / "}
      <span className="here">{label}</span>
    </p>
  );
}
