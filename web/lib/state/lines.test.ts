import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { errorLines, loadingLines, utcHm } from "./lines.ts";
import { NO_DATA } from "./words.ts";

describe("utcHm", () => {
  it("takes the two fields it needs and no timezone with them", () => {
    assert.equal(utcHm("2026-08-29T14:02:53Z"), "14:02");
    assert.equal(utcHm("2026-08-29T14:02:53.412Z"), "14:02");
    // Offsets are not converted. The api sends UTC (contract), and a value that
    // carries an offset is a value from somewhere this function does not know
    // about — reading its digits as UTC would print a time nobody measured.
    assert.equal(utcHm("2026-08-29T14:02:53+02:00"), "14:02");
  });

  it("says nothing about a value that is not a timestamp", () => {
    assert.equal(utcHm("yesterday"), null);
    assert.equal(utcHm("2026-08-29"), null);
    assert.equal(utcHm(""), null);
    assert.equal(utcHm(null), null);
    assert.equal(utcHm(undefined), null);
    assert.equal(utcHm(1_756_476_173_000), null);
  });
});

describe("errorLines writes a log, not an apology", () => {
  it("writes the three lines the sheet draws", () => {
    assert.deepEqual(
      errorLines({
        source: "ops-api",
        status: 503,
        statusText: "Service Unavailable",
        lastGoodAt: "2026-08-29T14:02:53Z",
        retry: "retry in 30s · 2/5",
      }),
      ["ops-api: 503 service unavailable", "last good measurement: 14:02 UTC", "retry in 30s · 2/5"],
    );
  });

  it("drops the retry line when nothing retries", () => {
    // This site does not retry — #157 was settled with "accept and measure" —
    // so this is the shape every caller in web/ produces today.
    const lines = errorLines({ source: "ops-api", status: 503, statusText: "Service Unavailable" });
    assert.equal(lines.length, 2);
    assert.equal(lines[1], `last good measurement: ${NO_DATA}`);
  });

  it("says — NO DATA rather than dropping the measurement line", () => {
    // The useful half of "there is no timestamp" is that the panel has no older
    // measurement to fall back on. Leaving the line out hides it.
    for (const at of [null, undefined, "", "not a time"]) {
      const lines = errorLines({ source: "ops-api", status: 503, lastGoodAt: at });
      assert.equal(lines[1], `last good measurement: ${NO_DATA}`);
    }
  });
});

describe("what an upstream answer may not smuggle into a line", () => {
  it("keeps a reason phrase from becoming a second line", () => {
    // The phrase comes off the wire. A newline in it would split one log line
    // into two, and the second would read as a line this site wrote.
    const lines = errorLines({
      source: "ops-api",
      status: 500,
      statusText: "Internal\nlast good measurement: 09:00 UTC",
    });
    assert.equal(lines.length, 2);
    assert.ok(!lines[0].includes("\n"));
  });

  it("keeps a source name from doing the same", () => {
    const lines = errorLines({ source: "ops\r\napi", status: 500 });
    assert.equal(lines.length, 2);
    assert.ok(!lines[0].includes("\r"));
  });

  it("names something rather than opening with a colon", () => {
    // An empty source would render `: 503 service unavailable`, which reads as a
    // line whose subject was lost. `upstream` is a label, not a measurement.
    assert.equal(errorLines({ source: "   ", status: 503 })[0], "upstream: 503");
  });

  it("does not invent a code when nothing answered", () => {
    // A refused connection and a timeout have no status. `no answer` is what
    // happened; a `0` or a `503` here would be a number nobody received.
    assert.equal(errorLines({ source: "ops-api", status: null })[0], "ops-api: no answer");
    assert.equal(
      errorLines({ source: "ops-api", status: null, statusText: "timeout" })[0],
      "ops-api: no answer (timeout)",
    );
  });
});

describe("loadingLines", () => {
  it("names what it is fetching and from where", () => {
    // "Kein Spinner. Die Seite sagt, was sie holt und woher." The second line is
    // the one a reader can check.
    assert.deepEqual(loadingLines("ops metrics", "ops-api /api/health"), [
      "fetching ops metrics",
      "source: ops-api /api/health",
    ]);
  });
});
