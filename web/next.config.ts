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

  // THE ADDRESSES `next dev` MAY SERVE ITS OWN RESOURCES TO, and this line is
  // the answer to a finding that cost four phases.
  //
  // Next blocks cross-origin access to `/_next/*` in development, and its
  // default allow-list is `['**.localhost', 'localhost', <the -H hostname>]`.
  // `127.0.0.1` is in none of them: it is not `localhost` as far as a string
  // comparison is concerned, and `Dockerfile.dev` starts the server with
  // `-H 0.0.0.0`. But `compose.dev.yaml` publishes the port on `127.0.0.1`,
  // which is therefore the address a developer actually types.
  //
  // WHAT WAS BLOCKED WAS NOT ONLY HOT RELOAD. The static chunks under
  // `/_next/static/chunks/` are `/_next/*` too, so they were refused with 403 —
  // the client bundle never ran, nothing hydrated, the clock sat at `--:--:--`
  // and the theme switch did nothing. Measured on one server in one minute:
  // over `localhost` the clock ticks and the switch flips `data-theme`; over
  // `127.0.0.1` neither does.
  //
  // AND IT LOGGED WHERE NOBODY LOOKED. The refusal prints
  // "Blocked cross-origin request to Next.js dev resource … from 127.0.0.1"
  // in the SERVER terminal, not in the browser console — which is why four
  // acceptances recorded "the console is empty" and drew the wrong conclusion.
  //
  // Loopback only, deliberately. A LAN address here would hand this server's
  // dev resources to the whole network; whoever needs to test on a phone adds
  // theirs on purpose and knows why. Issue #235.
  allowedDevOrigins: ["127.0.0.1"],

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
  // H1 adds the second, by the same reading of the same file. ADR 0009 gives
  // GET /api/systems/{slug} `public, s-maxage=300, stale-while-revalidate=1800`
  // (api/internal/httpx/cache.go, `CacheControlMedium`), so the profile is that
  // header read twice: 300 s before a refresh is due, 1800 s before a stale
  // answer stops being servable.
  //
  // TWO PROFILES AND NOT ONE, because the api declares two freshnesses and the
  // difference is deliberate: the deploy gate polls /api/health, and a case
  // study is a page that changes when a deploy or a probe writes a row. A
  // single profile here would quietly re-declare one of them.
  //
  // H4 ADDS A THIRD THAT CARRIES THE SAME NUMBERS AS THE SECOND, and that is
  // the point rather than an oversight. The contract gives GET /api/training
  // `CacheControlMedium` too, so both readings land on 300/1800 — but they are
  // two readings of two paths, not one profile shared by two callers. Folding
  // them together would mean the day the contract moves one of the headers,
  // the other one silently moves with it. Each entry here is derived from its
  // own path.
  //
  // NOTHING CHECKS THAT DERIVATION, and this is the third entry to say so. The
  // api holds its own constants against the served document
  // (TestCacheDirectivesMatchTheContract, ADR 0018), and these three numbers
  // are read off the same document by hand. Written down rather than assumed
  // away; the backlog carries the task.
  cacheLife: {
    health: { stale: 60, revalidate: 60, expire: 600 },
    systems: { stale: 300, revalidate: 300, expire: 1800 },
    training: { stale: 300, revalidate: 300, expire: 1800 },
    // H5a adds a fourth, and it is the third to carry the same numbers as the
    // second. The paragraph above is the whole argument: GET /api/systems and
    // GET /api/systems/{slug} are two paths with two `CacheControlMedium`
    // headers, and folding them into one profile would mean the day the
    // contract moves one, the other moves with it in silence.
    systemList: { stale: 300, revalidate: 300, expire: 1800 },
    // H5b adds a fifth, and it is the FIRST whose numbers are not 300/1800. The
    // contract gives GET /api/contributions `CacheControlHour` — `s-maxage=3600,
    // stale-while-revalidate=7200` — so the reading is an hour before a refresh
    // is due and two before a stale answer stops being servable. Longer than
    // anything else here because the upstream is GitHub rather than our own
    // database, and api/internal/contributions holds an hour as the staleness
    // line on its side of the wire too.
    contributions: { stale: 3600, revalidate: 3600, expire: 7200 },
  },

  // ONE FILE THE TRACER CANNOT SEE AS A DEPENDENCY, even though it currently
  // arrives anyway.
  //
  // `app/og.png/route.tsx` reads `styles/tokens.css` with `readFileSync` at
  // build time: Satori knows no cascade and no custom properties, and invariant
  // 8 forbids the colour literals anywhere but that stylesheet, so the image
  // parses the stylesheet rather than keeping a copy of it (lib/og/tokens.ts).
  // `output: "standalone"` copies what the module graph reaches, and a
  // `readFileSync` is not an import.
  //
  // MEASURED BOTH WAYS, AND THE HONEST ANSWER IS THAT THIS LINE CHANGES
  // NOTHING TODAY. Built without it, `.next/standalone/styles/tokens.css` is
  // there regardless — `app/[lang]/layout.tsx` imports the same file as a
  // stylesheet, and the tracer follows that import and copies the source. So
  // this is not the fix for a broken build; it is the difference between a
  // dependency that is declared and one that holds by coincidence. The day
  // that import moves, is bundled differently, or the layout stops loading
  // tokens.css directly, the OG route would start throwing in production and
  // only in production — `next dev` has the whole project on disk. Three lines
  // to make the coupling say its own name.
  //
  // H5c ADDS A SECOND, AND IT IS THE SAME KIND OF LINE AS THE FIRST — INCLUDING
  // THE PART WHERE IT CHANGES NOTHING TODAY.
  //
  // SYS.04 reads content/posts/*.mdx with `readdirSync` and `readFileSync`
  // (lib/content/posts.ts), and NOTHING imports those files: no `import`, no
  // stylesheet, no loader, no generated JSON. By the paragraph above that should
  // make this the line that puts them in the image rather than a declaration of
  // a coupling that already holds.
  //
  // MEASURED BOTH WAYS, AND IT IS NOT. Built without this entry,
  // `.next/standalone/content/posts` holds all fourteen files anyway — and only
  // that directory: `content/case-studies` and `content/generated` are absent
  // from the tree because they are imported, and imports are bundled rather than
  // copied. So the tracer is following the READ itself, which is a thing this
  // bundler does and not a thing this repository is promised.
  //
  // WHICH IS EXACTLY WHY THE LINE STAYS. The dependency is real either way; what
  // differs is whether it is written down or inferred by a tool across a version
  // bump nobody will connect to it. The failure it would prevent is invisible
  // everywhere but the container — `next build`, `next start`, `make e2e` and
  // the oracle all run with the whole project on disk, so a homepage that had
  // lost its source would say `— NO DATA` in production and nowhere else. The
  // phase's acceptance therefore looks at the built IMAGE and not only at the
  // built page.
  //
  // THE KEY IS ESCAPED BECAUSE IT IS A GLOB, NOT A PATH. Keys are matched with
  // picomatch against the route, and `/[lang]` unescaped is a character class
  // that matches `/a`, `/l`, `/n` and `/g` — four routes that do not exist, and
  // not the one that does.
  outputFileTracingIncludes: {
    "/og.png": ["./styles/tokens.css"],
    "/\\[lang\\]": ["./content/posts/*.mdx"],
  },
};

export default nextConfig;
