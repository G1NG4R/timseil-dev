// Where an upstream call is allowed to go.
//
// Its own file, and small on purpose: this is the SSRF guard, and it is the one
// part of the api client that can be tested without a request. `node --test`
// cannot load a module that imports `next/headers`, so a rule that lives next to
// the fetch is a rule with no test.
//
// CLAUDE.md: "Keine URL aus Nutzereingabe in ausgehende Requests." The type
// carries half of that — a caller has to pass a literal beginning with a slash —
// and this function carries the half a type cannot: a template literal type is
// erased at runtime, and a value that arrived through a cast or from JSON would
// walk straight past it.

/** The api, as the web container reaches it. The browser never uses this. */
const DEFAULT_BASE = "http://api:8080";

/**
 * Rejects a path that is not one slash followed by a route.
 *
 * Throws rather than returning false. A caller cannot do anything sensible with
 * a rejected path — it is a literal in the source, so a bad one is a bug rather
 * than a condition — and the client turns the throw into the same "no answer"
 * result as any other failure, which is the only shape the page has to handle.
 */
function assertPath(path: string): void {
  // A protocol-relative path is the whole attack: `new URL("//example.com/x",
  // "http://api:8080")` resolves to example.com, not to the api. Everything else
  // starting with a single slash stays on the base's host by construction.
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("an upstream path must be one slash followed by a route");
  }

  // A backslash is not a path separator to `new URL`, but it is to enough other
  // parsers that "//" and "/\" have been the same bug in several of them. This
  // service mounts no route containing one.
  if (path.includes("\\")) {
    throw new Error("an upstream path may not contain a backslash");
  }
}

/** Resolves a path against the api's internal base. */
export function upstreamUrl(path: string, base = process.env.API_INTERNAL_URL): URL {
  assertPath(path);
  return new URL(path, base === undefined || base === "" ? DEFAULT_BASE : base);
}

/**
 * Where a GET goes, from wherever it is running.
 *
 * The build plan asks for both halves in one sentence: "Serverseitig
 * `http://api:8080`, clientseitig `/api`." They are not two configurations of
 * one address, they are two different routes to the same process:
 *
 *   - On the server the call stays inside the compose network and never meets
 *     Traefik, so it needs the container name and cannot be relative.
 *   - In the browser the call must NOT use that name, and must not be given a
 *     public one either. It is relative, so it inherits the page's origin, and
 *     Traefik's `PathPrefix(/api)` router (priority 100, ahead of web's 10)
 *     hands it to the api container. Same origin, no CORS, nothing to configure
 *     and nothing that can point at the wrong host in an environment file.
 *
 * The browser branch has no caller in G4 — the first one is the contact form in
 * H8. It exists here rather than in H8 because the decision is this phase's and
 * the test below it is cheap; a second answer invented later would be the
 * expensive version.
 */
export function apiTarget(path: string): string {
  assertPath(path);
  return typeof window === "undefined" ? upstreamUrl(path).toString() : path;
}
