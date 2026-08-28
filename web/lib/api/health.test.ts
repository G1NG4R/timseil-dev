import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApiResult } from "./client.ts";
import {
  NO_DATA,
  buildText,
  footerHealth,
  healthOrThrow,
  onlineText,
  uptimeText,
  type Health,
} from "./health.ts";

/** A complete answer, in the shape /api/health really sends. */
function health(over: Record<string, unknown> = {}): Health {
  return {
    status: "ok",
    version: "0.10.0",
    sha: "1656fd4",
    startedAt: "2026-08-28T18:26:15Z",
    generatedAt: "2026-08-28T18:57:09Z",
    ops: {
      uptime90d: 99.98,
      p95Ms: 24.25,
      errorRate: 0,
      measuredAt: "2026-08-28T18:51:53Z",
      systemsLive: 1,
      systemsTotal: 2,
      lastDeploy: null,
    },
    ...over,
  };
}

describe("footerHealth reads a whole answer", () => {
  it("takes the commit, not the release tag", () => {
    // Both are in the answer. The sha is the one a stranger can hold against
    // `main` without knowing how this repository tags, and it is what chapter
    // 8.5 of the build plan curls to decide a phase is finished.
    assert.equal(footerHealth(health()).build, "1656fd4");
  });

  it("passes the uptime through as a number", () => {
    assert.equal(footerHealth(health()).uptime, 99.98);
  });

  it("calls a degraded api online, because it answered", () => {
    // Saying OFFLINE about a service that just described its own state would be
    // a worse claim than the one invariant 1 is guarding against. DEGRADED has
    // no word in this bar until G6 builds one.
    assert.equal(footerHealth(health({ status: "degraded" })).online, true);
  });
});

describe("footerHealth against an answer that is missing pieces", () => {
  // Not hypothetical. ADR 0035: during the overlapping start the new web
  // container can be talking to the previous api build for a few seconds, and a
  // field added this week is simply absent in that window.
  it("has no uptime when the whole ops block is missing", () => {
    assert.equal(footerHealth(health({ ops: undefined })).uptime, null);
  });

  it("keeps a contract null as null and never as zero", () => {
    assert.equal(footerHealth(health({ ops: { uptime90d: null } })).uptime, null);
  });

  it("refuses a value that is a number but not a measurement", () => {
    assert.equal(footerHealth(health({ ops: { uptime90d: Number.NaN } })).uptime, null);
    assert.equal(footerHealth(health({ ops: { uptime90d: "99.98" } })).uptime, null);
  });

  it("has no build when the sha is an empty string", () => {
    // An empty string is not a build identity, and `?? NO_DATA` would print it
    // as one — the cell would read "BUILD " and look like a rendering bug
    // rather than a missing number.
    assert.equal(footerHealth(health({ sha: "" })).build, null);
  });

  it("does not know whether it is online when there is no status", () => {
    assert.equal(footerHealth(health({ status: undefined })).online, null);
  });
});

describe("the three cell texts", () => {
  it("says — NO DATA rather than nothing", () => {
    assert.equal(buildText(null), NO_DATA);
    assert.equal(onlineText(null), NO_DATA);
    assert.equal(uptimeText(null), NO_DATA);
  });

  // The invariant, in one assertion. A measured zero is the reading that matters
  // most — a window that was down the whole time — and `uptime || NO_DATA` would
  // turn it into "we did not measure".
  it("prints a measured zero as a number", () => {
    assert.equal(uptimeText(0), "0.00%");
  });

  it("prints two decimals, the way the sheet draws it", () => {
    assert.equal(uptimeText(99.98), "99.98%");
    assert.equal(uptimeText(100), "100.00%");
  });

  it("has a word for both sides of online", () => {
    assert.equal(onlineText(true), "ONLINE");
    assert.equal(onlineText(false), "OFFLINE");
  });
});

describe("healthOrThrow keeps a failure out of the cache", () => {
  // The inversion that makes the cached reader safe. `use cache` stores whatever
  // its function returns; a returned `— NO DATA` would be served for the rest of
  // the window, which is exactly the failure compose.yaml:583 refuses to allow.
  it("throws on every shape of refusal", () => {
    const cases: ApiResult<Health>[] = [
      { kind: "fail", status: 0, problem: null, upstreamRequestId: null },
      { kind: "fail", status: 503, problem: null, upstreamRequestId: null },
      { kind: "not-modified", status: 304, etag: null, upstreamRequestId: null },
    ];
    for (const c of cases) {
      assert.throws(() => healthOrThrow(c), /health unavailable/);
    }
  });

  it("returns the body untouched when there is one", () => {
    const body = health();
    const ok: ApiResult<Health> = {
      kind: "ok",
      status: 200,
      data: body,
      etag: '"abc"',
      upstreamRequestId: null,
    };
    assert.equal(healthOrThrow(ok), body);
  });
});
