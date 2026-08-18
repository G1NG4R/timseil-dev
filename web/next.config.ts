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
};

export default nextConfig;
