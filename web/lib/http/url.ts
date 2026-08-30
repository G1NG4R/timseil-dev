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

/** What a path segment may be made of. See `resolvePath` for why it is this narrow. */
const SAFE_PARAM = /^[A-Za-z0-9_~-]+$/;

/**
 * Fills the `{name}` placeholders of a contract path, or refuses the value.
 *
 * `/api/systems/{slug}` is the first templated path this site reads, and it is
 * the first time a value that is not a source literal reaches an outgoing URL.
 * CLAUDE.md: "Keine URL aus Nutzereingabe in ausgehende Requests."
 *
 * IT REFUSES RATHER THAN ENCODES, and that is the decision in this function.
 * `encodeURIComponent` would turn every bad value into a working request
 * against a path nobody meant — `..` stays `..`, and `/api/systems/..` resolves
 * to `/api/`, a different endpoint answering with a different shape. A value
 * outside the allow-list is a bug at the call site, so it leaves by the same
 * door `assertPath` uses: a throw, which lib/api/client.ts turns into the one
 * "no answer" result a page already handles.
 *
 * THE ALLOW-LIST HAS NO DOT, on purpose and not by oversight. Unreserved
 * characters in RFC 3986 include it, and `.` and `..` are the two path segments
 * that mean something other than themselves. No parameter this contract
 * declares needs one; the day one does, it gets its own rule and its own test
 * rather than a loosened default.
 *
 * IT IS NOT THE CONTRACT'S PATTERN, and it deliberately does not restate it.
 * `Slug` is `^[a-z0-9]+(-[a-z0-9]+)*$` (contract/openapi.yaml), and the same
 * shape is a CHECK constraint in migration 00002. A third copy here would drift
 * from both. What this guard owes is narrower and its own: nothing may leave
 * this segment. A value that passes here and fails the contract is answered
 * with a 404 by the api, which is the correct answer to it.
 */
export function resolvePath(template: string, params: Record<string, string>): string {
  const used = new Set<string>();

  const path = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
    if (!Object.hasOwn(params, name)) {
      throw new Error(`no value for the path parameter: ${name}`);
    }

    // Read as `unknown`, and the `typeof` below is not ceremony. This file's own
    // header says why: the type is erased at runtime, and a value that arrived
    // through a cast or from JSON reaches here unchecked. Without it,
    // `SAFE_PARAM.test(undefined)` coerces to the string "undefined", which
    // passes the allow-list and asks the api for `/api/systems/undefined`.
    const value: unknown = params[name];
    if (typeof value !== "string" || !SAFE_PARAM.test(value)) {
      throw new Error(`a path parameter may not carry this value: ${name}`);
    }
    used.add(name);
    return value;
  });

  // A parameter nobody asked for means the caller and the template disagree
  // about which path this is. Silently dropping it would hide the mismatch
  // until someone renamed a placeholder and every call kept working.
  for (const name of Object.keys(params)) {
    if (!used.has(name)) {
      throw new Error(`the path has no such parameter: ${name}`);
    }
  }

  return path;
}
