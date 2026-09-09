import Link from "next/link";

/**
 * Every address that does resolve, with what it is for.
 *
 * "KEIN SACKGASSEN-404", and the Routes and Paths sheet says why the list has
 * to be complete rather than tasteful: "Die 404 listet alle Routen, sonst ist
 * sie eine Sackgasse mit Dekoration." A visitor who mistyped one address is
 * shown the whole map, not a link home.
 *
 * THE DESCRIPTIONS ARE NOT DECORATION EITHER. STATE.05's rule for a dead state
 * is that it says why — "Ein toter Zustand ohne Begründung ist ein Bug" — and
 * the same logic applies to a way out: `/work` next to "Selected work" is a
 * choice a stranger can make, `/work` alone is a guess.
 *
 * THE CV LINE IS THE ONE THING THAT IS NOT A ROUTE, and the sheet keeps it here
 * for exactly that reason: it is the likeliest thing a visitor is hunting when
 * they land on a 404, and the honest answer is that it is a terminal command
 * rather than an address. It is prose, not a link, because there is nowhere to
 * send them but the homepage they already have above.
 */
export function MountedRoutes({
  routes,
  cvHint,
}: {
  routes: readonly { href: string; path: string; description: string }[];
  cvHint: string;
}) {
  return (
    <nav className="nf-routes" aria-label="Mounted routes">
      <p className="nf-routes-head">MOUNTED ROUTES</p>

      <ul className="nf-routes-list">
        {routes.map((route) => (
          <li key={route.path}>
            <Link className="nf-route" href={route.href}>
              <span className="nf-route-path">{route.path}</span>
              <span className="nf-route-desc">{route.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="nf-cv">{cvHint}</p>
    </nav>
  );
}
