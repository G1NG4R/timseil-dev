import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { en } from "../i18n/messages/en.ts";

import { UPTIME_WINDOW_DAYS, workFigure } from "./figure.ts";

// The broken case first, and on this page it is the one the sheet asked for:
// a figure for a system nobody measured.
describe("a state that carries no measurement carries no cell", () => {
  it("gives no figure to queued or in_build, even with metrics attached", () => {
    // THE METRICS ARE DELIBERATELY NON-NULL HERE. The contract guarantees the
    // api never sends them for a non-live system — the lateral filters on
    // `s.state = 'live'` — so this body cannot arrive. The point is that the
    // judgement is made on the STATE and not on the presence of a number: if it
    // read the metrics, a build that changed that guarantee would start
    // printing an uptime for a system that has never run.
    const metrics = { uptime90d: 99.98, p95Ms: 72.5, errorRate: 0, measuredAt: "2026-09-02T00:00:00Z" };

    assert.equal(workFigure("queued", metrics, en), null);
    assert.equal(workFigure("in_build", metrics, en), null);
  });

  it("gives no figure to a state this build has no word for", () => {
    // ADR 0035: the wire can carry a vocabulary this build does not have. A
    // page that cannot say what a system IS has no business printing a number
    // about how well it runs.
    assert.equal(workFigure(null, { uptime90d: 99.98 }, en), null);
  });

  it("does not confuse a system word with a health word", () => {
    // `online` is what this page says about its own delivery, never about a
    // system in the list. It is a valid StateWord and not a valid answer here.
    assert.equal(workFigure("online", { uptime90d: 99.98 }, en), null);
    assert.equal(workFigure("degraded", { uptime90d: 99.98 }, en), null);
  });
});

describe("a live system keeps its cell whether or not the number arrived", () => {
  it("prints the measurement when there is one", () => {
    assert.deepEqual(workFigure("live", { uptime90d: 99.64 }, en), {
      label: "UPTIME · 91 D",
      value: "99.64",
      unit: "%",
    });
  });

  it("keeps the label and drops the value when there is none", () => {
    // TODAY'S ACTUAL STATE, and the distinction the whole file is about. The
    // snapshot loop has written nothing, so the measurement was attempted and
    // has not arrived — `— NO DATA` in the cell. That is a different sentence
    // from the missing cell above, where nobody attempts anything.
    for (const metrics of [{ uptime90d: null }, {}, null, undefined, { uptime90d: "99.6" }]) {
      assert.deepEqual(workFigure("live", metrics, en), {
        label: "UPTIME · 91 D",
        value: null,
        unit: "%",
      });
    }
  });

  it("refuses a number that is not one", () => {
    // `finiteNumber`, not a cast. NaN and Infinity are what a division by an
    // unmeasured window produces upstream, and both would print as words.
    for (const uptime90d of [Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(workFigure("live", { uptime90d }, en), {
        label: "UPTIME · 91 D",
        value: null,
        unit: "%",
      });
    }
  });

  it("keeps a measured zero, which is not a missing one", () => {
    // Invariant 1 in a cell. A system that answered nothing for the whole
    // window measured 0, and that is the strongest thing this page can say
    // about it — it must never render as the absence of a measurement.
    assert.deepEqual(workFigure("live", { uptime90d: 0 }, en), {
      label: "UPTIME · 91 D",
      value: "0.00",
      unit: "%",
    });
  });
});

describe("the window is the field's, not the request's", () => {
  it("is the 91 the contract writes into uptime90d", () => {
    // Transcribed from contract/openapi.yaml: "The name says 90 for historical
    // reasons; the window is 91 days (13 × 7) everywhere else in this contract
    // and on the site." Invariant 7, and 13 × 7 is why it stays countable.
    assert.equal(UPTIME_WINDOW_DAYS, 91);
    assert.equal(UPTIME_WINDOW_DAYS % 7, 0);
  });

  it("is stated rather than read back, because the list answers no window", () => {
    // `/api/systems` takes no `window` parameter and sends no `window` field —
    // unlike the detail answer, which the case study labels from. So this label
    // cannot be derived from the body, and the assertion is that it is stable
    // regardless of what the body claims.
    assert.deepEqual(workFigure("live", { uptime90d: 99.9, window: 30 }, en), {
      label: "UPTIME · 91 D",
      value: "99.90",
      unit: "%",
    });
  });
});
