import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NO_DATA } from "../state/words.ts";

import type { ApiResult } from "./client.ts";
import { buildText, footerHealth, healthOrThrow, uptimeText, type Health } from "./health.ts";

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
      // H8c, issue #206. Nothing in web reads this yet — it is here because the
      // contract makes it required, and a fixture that left it out would be a
      // shape /api/health cannot send. The empty-box values are the honest ones
      // for a fixture: `rate` is null because nothing was accepted, not zero.
      deliverability: { rate: null, delivered: 0, accepted: 0, windowDays: 30 },
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

  it("says DEGRADED about a degraded api, which it could not until G6", () => {
    // This assertion used to read `.online === true`, with the comment "DEGRADED
    // has no word in this bar until G6 builds one". It has one now, and the
    // backlog entry that recorded the gap (28.08., G4) closes here: a state the
    // api announces out loud is no longer invisible in the interface.
    assert.equal(footerHealth(health({ status: "degraded" })).status, "degraded");
  });

  it("says ONLINE about a healthy api, and never LIVE", () => {
    // The bar is about the delivery of this page. LIVE is for a single system —
    // the row on `/` uses systemWord for exactly that reason.
    assert.equal(footerHealth(health()).status, "online");
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
    assert.equal(footerHealth(health({ status: undefined })).status, null);
  });

  it("refuses a status word the contract cannot send", () => {
    // The same overlapping-start window can deliver a word this build does not
    // know. `— NO DATA` is the honest rendering; passing it through would put
    // an unmapped wire value on screen.
    assert.equal(footerHealth(health({ status: "OK" })).status, null);
    assert.equal(footerHealth(health({ status: "outage" })).status, null);
  });
});

describe("the two cell texts", () => {
  // Three until G6. The state cell is no longer a string — it is a word plus a
  // mark, which is <StatusDot/>'s job, and lib/state/words.test.ts holds the
  // rules about it.
  it("says — NO DATA rather than nothing", () => {
    assert.equal(buildText(null), NO_DATA);
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

});

describe("healthOrThrow keeps a failure out of the cache", () => {
  // The inversion that makes the cached reader safe. `use cache` stores whatever
  // its function returns; a returned `— NO DATA` would be served for the rest of
  // the window, which is exactly the failure compose.yaml:583 refuses to allow.
  it("throws on every shape of refusal", () => {
    const cases: ApiResult<Health>[] = [
      { kind: "fail", status: 0, problem: null, retryAfterSec: null, upstreamRequestId: null },
      { kind: "fail", status: 503, problem: null, retryAfterSec: null, upstreamRequestId: null },
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
