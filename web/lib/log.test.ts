// The line has to be the api's line, or one query does not read both containers.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { log, type Attrs, type Correlation, type Level } from "./log.ts";

/** Captures what one call would have written, parsed back from the JSON. */
function capture(
  level: Level,
  msg: string,
  attrs?: Attrs,
  ids?: Correlation,
): Record<string, unknown> | null {
  const written: string[] = [];
  const original = console.log;
  console.log = (line: string) => written.push(line);
  try {
    log(level, msg, attrs, ids);
  } finally {
    console.log = original;
  }

  if (written.length === 0) return null;
  assert.equal(written.length, 1, "one event is one line");
  return JSON.parse(written[0]) as Record<string, unknown>;
}

afterEach(() => {
  delete process.env.LOG_LEVEL;
});

describe("the shape is the api's shape", () => {
  it("writes time, level and msg first and in that order", () => {
    const line = capture("INFO", "leaving");
    assert.deepEqual(Object.keys(line ?? {}), ["time", "level", "msg"]);
  });

  it("writes the level in upper case, like slog", () => {
    assert.equal(capture("WARN", "x")?.level, "WARN");
  });

  it("writes an RFC 3339 timestamp", () => {
    const time = capture("INFO", "x")?.time;
    assert.equal(typeof time, "string");
    assert.match(String(time), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("puts the correlation last and at the root of the object", () => {
    const line = capture("INFO", "upstream request", { status: 200 }, { requestId: "a", traceId: "b" });
    assert.deepEqual(Object.keys(line ?? {}), ["time", "level", "msg", "status", "request_id", "trace_id"]);
  });

  // slog does not deduplicate either, and two identical keys in one object are
  // valid JSON whose meaning depends on the parser.
  it("never writes a key twice", () => {
    const written: string[] = [];
    const original = console.log;
    console.log = (line: string) => written.push(line);
    try {
      log("INFO", "x", { request_id: "from the call site" }, { requestId: "from the context" });
    } finally {
      console.log = original;
    }

    const keys = written[0].match(/"request_id"/g) ?? [];
    assert.equal(keys.length, 1, written[0]);
  });
});

describe("a missing id is a missing field", () => {
  // An empty request_id in Loki is a value every query then has to exclude,
  // where an absent one is a value they can match on.
  it("omits both fields when there is no request", () => {
    const line = capture("INFO", "leaving") ?? {};
    assert.ok(!("request_id" in line));
    assert.ok(!("trace_id" in line));
  });

  it("omits only the one that is missing", () => {
    const line = capture("INFO", "roll-up finished", {}, { traceId: "b" }) ?? {};
    assert.ok(!("request_id" in line));
    assert.equal(line.trace_id, "b");
  });

  it("drops an attribute that is undefined rather than writing null", () => {
    const line = capture("INFO", "x", { upstream_request_id: undefined }) ?? {};
    assert.ok(!("upstream_request_id" in line));
  });

  it("keeps an attribute that is deliberately null", () => {
    const line = capture("INFO", "x", { upstream_request_id: null }) ?? {};
    assert.equal(line.upstream_request_id, null);
  });
});

describe("nothing reaches the writer unfiltered", () => {
  it("scrubs the message, not only the attributes", () => {
    // A message built around an error carries whatever the error had.
    const line = capture("ERROR", "could not reach 203.0.113.7");
    assert.ok(!String(line?.msg).includes("203.0.113.7"), String(line?.msg));
    assert.ok(String(line?.msg).includes("redacted-ip"));
  });

  it("scrubs an attribute value", () => {
    const line = capture("ERROR", "upstream request failed", { error: "550 <a@b.tld> rejected" });
    assert.ok(!String(line?.error).includes("a@b.tld"));
  });

  it("renders an Error through its cause chain and then scrubs it", () => {
    const cause = new Error("connect ECONNREFUSED 172.18.0.3:8080");
    const line = capture("ERROR", "upstream request failed", {
      error: new TypeError("fetch failed", { cause }),
    });
    const text = String(line?.error);
    assert.ok(!text.includes("172.18.0.3"), text);
    assert.ok(text.includes("fetch failed"), text);
    assert.ok(text.includes("ECONNREFUSED"), text);
  });

  it("cannot be made to write a second line", () => {
    const line = capture("INFO", 'x\n{"level":"INFO","msg":"all good"}');
    assert.ok(!String(line?.msg).includes("\n"));
  });
});

describe("LOG_LEVEL", () => {
  it("writes info by default", () => {
    assert.ok(capture("INFO", "x") !== null);
    assert.equal(capture("DEBUG", "x"), null);
  });

  it("reads the api's spelling of the level", () => {
    process.env.LOG_LEVEL = "debug";
    assert.ok(capture("DEBUG", "x") !== null);

    process.env.LOG_LEVEL = "error";
    assert.equal(capture("WARN", "x"), null);
    assert.ok(capture("ERROR", "x") !== null);
  });

  it("tolerates the spellings a human types", () => {
    process.env.LOG_LEVEL = " WARN ";
    assert.equal(capture("INFO", "x"), null);
    assert.ok(capture("WARN", "x") !== null);
  });

  // The api refuses to start on a bad value and names it. Web is not the place
  // to duplicate that judgement, and falling silent would be worse than falling
  // back to the documented default.
  it("falls back to info on a value it does not know", () => {
    process.env.LOG_LEVEL = "verbose";
    assert.ok(capture("INFO", "x") !== null);
    assert.equal(capture("DEBUG", "x"), null);
  });
});
