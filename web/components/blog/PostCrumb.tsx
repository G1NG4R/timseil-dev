import Link from "next/link";

/**
 * `LOG / 2026-09-04 / THE COUNTER I COULD NOT PROVE`.
 *
 * K-16 AGAIN: every page carries a way back, and on this page the crumb is one
 * of only two — the other is the chrome's own `LOG` entry. The Blog Post sheet
 * draws no "back to index" button, which is why this one is load-bearing rather
 * than decorative.
 *
 * THE TITLE IS NOT A LINK, because it is where the reader already is. The date
 * is not one either: there is no archive by day on this site, and a crumb
 * segment that looks clickable and is not is the dead control STATE.05 refuses.
 */
export function PostCrumb({
  href,
  back,
  published,
  title,
}: {
  href: string;
  back: string;
  published: string;
  title: string;
}) {
  return (
    <p className="post-crumb">
      <Link href={href}>{back}</Link>
      {" / "}
      <time dateTime={published}>{published}</time>
      {" / "}
      <span className="here">{title}</span>
    </p>
  );
}
