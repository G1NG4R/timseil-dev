// Every line of the log, held against the one rule the log has: it prints what
// this page observed and nothing else.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTHOR } from "../site.ts";

import { sessionLines, type SessionInput } from "./log.ts";

const SENT: SessionInput = {
  state: "accepted",
  invalidCount: 0,
  honeypotEmpty: true,
  dwellMs: 3247.8,
  status: 202,
  durationMs: 1120.4,
  receipt: "msg_01M1MGN4V2DX7ZPP",
  // 1970-01-01T14:22:07Z — the clock is UTC by construction, so a fixed
  // millisecond is a fixed string on every machine.
  answeredAt: 51_727_000,
};

const text = (input: SessionInput) => sessionLines(input).map((line) => line.text);

describe("before anything is attempted", () => {
  it("writes no lines at all", () => {
    // The panel says `waiting for input` in its body. A log that opened with
    // "ready" would be a line about nothing having happened yet.
    assert.deepEqual(sessionLines({ ...SENT, state: "rest" }), []);
    assert.deepEqual(sessionLines({ ...SENT, state: "composing" }), []);
  });
});

describe("what left, and what the page had measured when it did", () => {
  it("names the honeypot and the dwell, and claims no verdict about them", () => {
    const lines = text({ ...SENT, state: "sending", status: null, durationMs: null });

    assert.deepEqual(lines, ["honeypot empty · dwell 3247ms", "POST /api/contact"]);
    // The sheet writes "spam checks … ok" here. Whether the checks passed is
    // the api's answer, and it has not answered yet.
    assert.ok(!lines.some((line) => line.includes("spam")));
    // And it never names a provider, which this page does not see.
    assert.ok(!lines.some((line) => line.includes("provider")));
  });

  it("floors the dwell rather than rounding it, and keeps it in milliseconds", () => {
    // The same unit the request body reports. The sheet prints seconds here and
    // milliseconds ten lines above, which is one quantity in two units on one
    // panel.
    assert.ok(text({ ...SENT, dwellMs: 3999.9 })[0].endsWith("dwell 3999ms"));
  });

  it("says so when the honeypot travelled full", () => {
    // It should never happen from this form, and if it does the log is not the
    // place that quietly tidies it away.
    assert.ok(text({ ...SENT, honeypotEmpty: false })[0].startsWith("honeypot filled"));
  });

  it("drops the dwell rather than printing one it does not have", () => {
    assert.equal(text({ ...SENT, dwellMs: null })[0], "honeypot empty");
    assert.equal(text({ ...SENT, dwellMs: Number.NaN })[0], "honeypot empty");
  });
});

describe("what came back", () => {
  it("writes the receipt and the second it arrived", () => {
    assert.deepEqual(text(SENT), [
      "honeypot empty · dwell 3247ms",
      "POST /api/contact",
      "202 accepted · 1120ms",
      "msg_01M1MGN4V2DX7ZPP · 14:22:07 UTC",
    ]);
  });

  it("never says delivered", () => {
    // ADR 0021 §1: the handler tries once and hands the rest to a dispatcher.
    // `accepted` is the contract's word for a 202 and the strongest one true at
    // the moment it is printed.
    assert.ok(!text(SENT).some((line) => line.includes("delivered")));
  });

  it("keeps the duration, which is the only thing that separates a real send", () => {
    // ADR 0021 §2 answers a honeypot and a short dwell with the same well-formed
    // 202. The status cannot tell them apart; the round trip can.
    assert.ok(text(SENT)[2].endsWith(" · 1120ms"));
    assert.equal(text({ ...SENT, durationMs: null })[2], "202 accepted");
    assert.equal(text({ ...SENT, durationMs: -1 })[2], "202 accepted");
  });

  it("prints the api's own title for anything that is not a 202", () => {
    const lines = text({
      ...SENT,
      state: "failed",
      status: 502,
      statusText: "Mail provider unavailable",
      receipt: null,
      durationMs: 1204,
    });

    assert.equal(lines[2], "502 Mail provider unavailable · 1204ms");
  });

  it("prints the code alone when the api offered no title", () => {
    const lines = text({ ...SENT, state: "failed", status: 503, statusText: null, receipt: null });
    assert.equal(lines[2], "503 · 1120ms");
  });

  it("does not print a zero as if it were a status", () => {
    // Nothing answered. A `0` in a log reads like a code somebody could look up,
    // and the page does not know which failure it was.
    const lines = text({
      ...SENT,
      state: "failed",
      status: 0,
      receipt: null,
      durationMs: 8000,
    });

    assert.equal(lines[2], "no answer · 8000ms");
  });

  it("takes the wait from its caller and drops the line when there is none", () => {
    const base: SessionInput = {
      ...SENT,
      state: "failed",
      status: 429,
      statusText: "Too many requests",
      receipt: null,
      durationMs: 84,
    };

    assert.deepEqual(text({ ...base, retry: "retry in 412s" }).slice(2), [
      "429 Too many requests · 84ms",
      "retry in 412s",
      AUTHOR.email,
    ]);
    assert.deepEqual(text(base).slice(2), ["429 Too many requests · 84ms", AUTHOR.email]);
  });

  it("offers the address on every failure and on no success", () => {
    // "immer mit adresse als ausweg" — the sheet asks for it twice. After a 202
    // it would be an escape from something that worked.
    assert.ok(text({ ...SENT, state: "failed", receipt: null }).includes(AUTHOR.email));
    assert.ok(!text(SENT).includes(AUTHOR.email));
  });

  it("keeps an upstream title from breaking one line into two", () => {
    // A title carrying a newline would produce a second line that looks like one
    // this page wrote.
    const lines = text({
      ...SENT,
      state: "failed",
      status: 500,
      statusText: "boom\nGET /admin",
      receipt: null,
      durationMs: 12,
    });

    assert.equal(lines.length, 4);
    assert.ok(!lines[2].includes("\n"));
  });
});

describe("the refusal, and its two authors", () => {
  it("spends no request when this page can already see the mistake", () => {
    const lines = text({
      ...SENT,
      state: "rejected",
      status: null,
      invalidCount: 2,
      durationMs: null,
      receipt: null,
    });

    assert.deepEqual(lines, ["validating … 2 invalid"]);
  });

  it("shows the round trip when the api was the one that refused", () => {
    const lines = text({
      ...SENT,
      state: "rejected",
      status: 400,
      statusText: "Validation failed",
      invalidCount: 1,
      durationMs: 88,
      receipt: null,
    });

    assert.deepEqual(lines, [
      "honeypot empty · dwell 3247ms",
      "POST /api/contact",
      "400 Validation failed · 88ms",
    ]);
    // The fields carry the alert here, so the log does not also offer a way out.
    assert.ok(!lines.includes(AUTHOR.email));
  });
});

describe("the shape of a line", () => {
  it("keeps the prompt out of the text and in the direction", () => {
    // `.st-log` draws `> ` in a ::before, and the phone shows only the answer —
    // both need to know which side a line is without parsing it back apart.
    const lines = sessionLines(SENT);

    assert.deepEqual(
      lines.map((line) => line.dir),
      ["out", "out", "in", "cont"],
    );
    for (const line of lines) {
      assert.ok(!line.text.startsWith(">"), `${line.text} carries its own prompt`);
      assert.ok(!line.text.startsWith("<"), `${line.text} carries its own prompt`);
    }
  });
});
