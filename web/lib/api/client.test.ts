import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { apiGet } from "./client.ts";

// The client logs one line per call. Swallowing it keeps the test output
// readable and, more usefully, lets a test assert on what was written.
let written: string[] = [];
const realLog = console.log;
const realFetch = globalThis.fetch;

interface Call {
  url: string;
  init: RequestInit;
}
let calls: Call[] = [];

function answer(handler: () => Response | Promise<Response>): void {
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(handler());
  }) as unknown as typeof fetch;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

beforeEach(() => {
  written = [];
  calls = [];
  console.log = (line: string) => written.push(line);
});

afterEach(() => {
  console.log = realLog;
  globalThis.fetch = realFetch;
});

const HEALTH = {
  status: "ok",
  version: "0.10.0",
  sha: "1656fd4",
  startedAt: "2026-08-28T18:26:15Z",
  generatedAt: "2026-08-28T18:57:09Z",
  ops: { uptime90d: 100, p95Ms: 24.25, errorRate: 0, measuredAt: null, systemsLive: 1, systemsTotal: 2, lastDeploy: null },
};

describe("apiGet reads an answer", () => {
  it("returns the body, the validator and the id the api filed it under", async () => {
    answer(() => json(HEALTH, { headers: { etag: '"abc"', "X-Request-Id": "r".repeat(32) } }));

    const result = await apiGet("/api/health");

    assert.equal(result.kind, "ok");
    assert.equal(result.data.sha, "1656fd4");
    assert.equal(result.etag, '"abc"');
    assert.equal(result.upstreamRequestId, "r".repeat(32));
  });

  it("sends the validator it was given, and says so in the log line", async () => {
    answer(() => new Response(null, { status: 304, headers: { etag: '"abc"' } }));

    const result = await apiGet("/api/health", { ifNoneMatch: '"abc"' });

    assert.equal(result.kind, "not-modified");
    assert.equal(new Headers(calls[0]?.init.headers).get("if-none-match"), '"abc"');
    assert.match(written[0] ?? "", /"conditional":true/);
  });

  it("sends no validator when it has none", async () => {
    answer(() => json(HEALTH));
    await apiGet("/api/health");
    assert.equal(new Headers(calls[0]?.init.headers).get("if-none-match"), null);
  });

  it("passes correlation headers through untouched", async () => {
    answer(() => json(HEALTH));
    await apiGet("/api/health", { headers: { "X-Request-Id": "a".repeat(32) } });
    assert.equal(new Headers(calls[0]?.init.headers).get("x-request-id"), "a".repeat(32));
  });
});

describe("apiGet reads a refusal", () => {
  it("reads an RFC 9457 document into something a page could render", async () => {
    answer(() =>
      json(
        {
          type: "https://timseil.dev/problems/rate-limited",
          title: "Too many requests",
          status: 429,
          detail: "Try again in a minute.",
        },
        { status: 429, headers: { "content-type": "application/problem+json" } },
      ),
    );

    const result = await apiGet("/api/health");

    assert.equal(result.kind, "fail");
    assert.equal(result.status, 429);
    assert.equal(result.problem?.title, "Too many requests");
  });

  // The case that matters more than the one above. Something in front of the api
  // — a proxy, a load balancer, an error page — can answer with HTML, and the
  // page must not end up rendering a fragment of it as a title.
  it("invents no problem when the body is not one", async () => {
    answer(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await apiGet("/api/health");

    assert.equal(result.kind, "fail");
    assert.equal(result.status, 502);
    assert.equal(result.problem, null);
  });

  it("refuses a document that is missing a required field", async () => {
    answer(() => json({ title: "no type, no status" }, { status: 500 }));

    const result = await apiGet("/api/health");

    assert.equal(result.kind === "fail" && result.problem, null);
  });

  // A 200 whose body is not an object is not a body this contract describes.
  // Calling it data pushes the lie one layer down, to whoever reads a field off
  // it and gets undefined.
  it("refuses a 200 that is not an object", async () => {
    answer(() => json("ok"));
    assert.equal((await apiGet("/api/health")).kind, "fail");
  });

  it("refuses a 200 whose body will not parse", async () => {
    answer(() => new Response("{", { status: 200, headers: { "content-type": "application/json" } }));
    assert.equal((await apiGet("/api/health")).kind, "fail");
  });
});

describe("apiGet when there is no answer at all", () => {
  // ADR 0035: the api is briefly gone during step 3 of every rollout. This is
  // the normal path, not the exceptional one, and a throw here would put a
  // try/catch obligation on every future caller to reach the same `— NO DATA`.
  it("returns status 0 rather than throwing", async () => {
    answer(() => {
      throw new TypeError("fetch failed");
    });

    const result = await apiGet("/api/health");

    assert.equal(result.kind, "fail");
    assert.equal(result.status, 0);
    assert.equal(result.problem, null);
    assert.equal(result.upstreamRequestId, null);
  });

  it("writes one ERROR line with the scrubbed reason", async () => {
    answer(() => {
      throw new TypeError("connect ECONNREFUSED 172.18.0.7:8080");
    });

    await apiGet("/api/health");

    assert.equal(written.length, 1);
    assert.match(written[0] ?? "", /"level":"ERROR"/);
    // lib/scrub redacts the address. Without it every rollout writes the
    // container addresses into a log this site publishes the shape of.
    assert.doesNotMatch(written[0] ?? "", /172\.18\.0\.7/);
  });

  // The stub has to honour the signal, because that is the whole mechanism
  // under test: AbortSignal.timeout does nothing on its own, it only makes fetch
  // reject. A stub that ignored it would hang this test rather than fail it —
  // which it did, on the first run.
  it("gives up rather than hanging when the api never answers", async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "TimeoutError"));
        });
      })) as unknown as typeof fetch;

    const started = Date.now();
    const result = await apiGet("/api/health", { timeoutMs: 20 });

    assert.equal(result.status, 0);
    assert.ok(Date.now() - started < 2_000, "waited the default budget instead of the given one");
  });
});

// Not a behaviour, a boundary — and the reason it is asserted rather than
// commented is in use-cache.md:196: a `next/headers` call reachable from a
// cached scope "can pass `next build` and fail under `next start`". A rule that
// only a production start can break needs a check that costs no production
// start.
describe("the transport stays loadable without Next", () => {
  for (const file of ["client.ts", "health.ts"]) {
    it(`${file} imports nothing from next/`, () => {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      assert.doesNotMatch(source, /from "next\//);
    });
  }

  it("readers.ts is the one file that does, so the split stays visible", () => {
    const source = readFileSync(join(import.meta.dirname, "readers.ts"), "utf8");
    assert.match(source, /from "next\/headers"/);
    assert.match(source, /from "next\/cache"/);
  });
});
