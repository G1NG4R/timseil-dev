import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The production image runs `node server.js`, not `next start`. Standalone is
  // what makes that possible: `next build` traces what each route actually
  // imports and writes a self-contained tree under `.next/standalone`, so the
  // runtime stage needs no `npm ci` and carries no devDependencies at all.
  //
  // The trap it comes with is in web/Dockerfile, where it happens: the tree
  // contains neither `public/` nor `.next/static`, and both have to be copied
  // by hand. Build plan D1 calls it the most common Next.js self-hosting error,
  // and it shows up as "works locally, no styles in the container".
  //
  // `next dev` ignores this, so `make dev` is unaffected.
  output: "standalone",

  reactCompiler: true,

  // G4. Data is dynamic by default and `use cache` decides what is not, which is
  // the round the site wants: a number is absent until something produces it.
  //
  // It also turns on two things nobody asked for, and both cost this codebase
  // work rather than nothing:
  //
  //   1. Route segment configs (`dynamic`, `revalidate`, `fetchCache`) become
  //      errors. app/page.tsx and app/healthz/route.ts both carried
  //      `force-dynamic`; see each file for what replaced it.
  //   2. Navigation keeps up to three routes mounted and merely hidden, through
  //      React's <Activity>. A route that leaves state behind now leaves it in
  //      the document. components/MobileMenu.tsx is the one that did.
  cacheComponents: true,

  // Derived, not chosen. ADR 0009 gives GET /api/health the header
  // `public, s-maxage=60, stale-while-revalidate=600`, and says in as many
  // words that without a CDN `s-maxage` is mainly an instruction to these cache
  // components. So the profile is that header, read twice: 60 s before a
  // refresh is due, 600 s before a stale answer stops being servable.
  //
  // If the contract moves, this moves with it. A number invented here would be
  // a second source of truth for a freshness the api already declares.
  cacheLife: {
    health: { stale: 60, revalidate: 60, expire: 600 },
  },
};

export default nextConfig;
