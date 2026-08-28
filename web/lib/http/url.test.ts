import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apiTarget, upstreamUrl } from "./url.ts";

const BASE = "http://api:8080";

describe("upstreamUrl stays on the api", () => {
  it("resolves a route against the base", () => {
    assert.equal(upstreamUrl("/api/health", BASE).href, "http://api:8080/api/health");
  });

  it("keeps a query string", () => {
    assert.equal(upstreamUrl("/api/systems?limit=2", BASE).href, "http://api:8080/api/systems?limit=2");
  });

  it("falls back to the compose default when the variable is unset", () => {
    assert.equal(upstreamUrl("/api/health", undefined).hostname, "api");
    assert.equal(upstreamUrl("/api/health", "").hostname, "api");
  });
});

describe("upstreamUrl refuses to leave the api", () => {
  // The whole reason this function exists rather than a `new URL` at the call
  // site: a protocol-relative path resolves to somebody else's host, and it
  // still starts with a slash, so the type says nothing about it.
  it("refuses a protocol-relative path", () => {
    assert.equal(new URL("//example.com/x", BASE).hostname, "example.com");
    assert.throws(() => upstreamUrl("//example.com/x", BASE));
  });

  it("refuses an absolute URL", () => {
    assert.throws(() => upstreamUrl("http://example.com/x", BASE));
    assert.throws(() => upstreamUrl("https://example.com/x", BASE));
  });

  it("refuses a path that does not start with a slash", () => {
    assert.throws(() => upstreamUrl("api/health", BASE));
    assert.throws(() => upstreamUrl("", BASE));
  });

  it("refuses a backslash", () => {
    assert.throws(() => upstreamUrl("/\\example.com/x", BASE));
  });

  // The type is erased at runtime, so a value that arrived through a cast or
  // from JSON reaches this function unchecked. That is the case the guard is
  // for; every one above is written the way it would actually arrive.
  it("still refuses when the type has been cast away", () => {
    const smuggled = "//example.com/x" as `/${string}`;
    assert.throws(() => upstreamUrl(smuggled, BASE));
  });
});

describe("apiTarget picks the route by where it is running", () => {
  // `typeof window === "undefined"` is the branch, so the test has to be the
  // globals and not a flag. Deleting it afterwards matters: node --test runs
  // every file in one process by default, and a leaked `window` would make the
  // next file's server-side assumption quietly false.
  function withWindow<T>(fn: () => T): T {
    (globalThis as Record<string, unknown>).window = {};
    try {
      return fn();
    } finally {
      delete (globalThis as Record<string, unknown>).window;
    }
  }

  it("goes to the container by name on the server", () => {
    assert.equal(apiTarget("/api/health"), "http://api:8080/api/health");
  });

  it("stays relative in the browser, so the page's own origin carries it", () => {
    assert.equal(
      withWindow(() => apiTarget("/api/health")),
      "/api/health",
    );
  });

  // The half that would be easy to get wrong and impossible to see: an absolute
  // upstream URL shipped to the browser would name a host no visitor can reach,
  // and would do it only in production.
  it("never hands the browser the internal name", () => {
    assert.ok(!withWindow(() => apiTarget("/api/health")).includes("api:8080"));
  });

  it("keeps the SSRF guard on both branches", () => {
    assert.throws(() => apiTarget("//example.com/x"));
    assert.throws(() => withWindow(() => apiTarget("//example.com/x")));
    assert.throws(() => withWindow(() => apiTarget("/\\example.com/x")));
  });
});
