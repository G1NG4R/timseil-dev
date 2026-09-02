import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dayState, healthStatus, siteWord, systemStateWord, systemWord } from "./derive.ts";

// The broken case first, because it is the one that happens in production.
//
// ADR 0035: during the overlapping start the new web container talks to
// whichever api container answers, and for a few seconds that can be the
// previous build. Every value below is something the generated type says cannot
// arrive and the wire can still deliver.
describe("a body that is not the body the contract promised", () => {
  it("refuses a field that is absent", () => {
    assert.equal(healthStatus(undefined), null);
    assert.equal(siteWord(undefined), null);
    assert.equal(systemWord(undefined), null);
  });

  it("refuses the right word in the wrong case", () => {
    // `"OK"` is not `ok`. Accepting it would mean the interface decides what
    // the contract meant, and the day the api starts sending `"OK"` for real is
    // the day this site should say `— NO DATA` and be found out.
    assert.equal(healthStatus("OK"), null);
    assert.equal(healthStatus("Ok"), null);
    assert.equal(healthStatus(" ok"), null);
    assert.equal(healthStatus("ok "), null);
  });

  it("refuses a number where a word belongs", () => {
    assert.equal(healthStatus(200), null);
    assert.equal(healthStatus(true), null);
    assert.equal(healthStatus(null), null);
    assert.equal(healthStatus({ status: "ok" }), null);
    assert.equal(healthStatus(["ok"]), null);
  });

  it("refuses a word the contract does not have", () => {
    // `outage` and `nodata` are real contract words — DayState's. They belong
    // to the operation grid and mean nothing about a health answer, and a
    // mapping that took them would be reading one endpoint's vocabulary into
    // another's document.
    assert.equal(healthStatus("outage"), null);
    assert.equal(healthStatus("nodata"), null);
    assert.equal(healthStatus("live"), null);
  });
});

describe("the two subjects one answer can be about", () => {
  it("calls the delivery of this page ONLINE, never LIVE", () => {
    // STATE.05: "LIVE beschreibt ein einzelnes System, ONLINE die Seite selbst."
    assert.equal(siteWord("ok"), "online");
  });

  it("calls the api as a system LIVE, never ONLINE", () => {
    assert.equal(systemWord("ok"), "live");
  });

  it("says DEGRADED in both, which is the point of this phase", () => {
    // Until G6 the meta bar had no third word and showed `degraded` as ONLINE:
    // a state the api announces out loud was invisible in the interface.
    assert.equal(siteWord("degraded"), "degraded");
    assert.equal(systemWord("degraded"), "degraded");
  });

  it("never reaches OFFLINE from a health answer", () => {
    // Both contract words mean "it answered". OFFLINE would need a `200` that
    // says "I am off", which is not a sentence the contract can form — so the
    // word exists in the vocabulary for the probed systems of H1 and H6, and
    // nothing here can produce it.
    for (const value of ["ok", "degraded", "", null, undefined, 503]) {
      assert.notEqual(siteWord(value), "offline");
      assert.notEqual(systemWord(value), "offline");
    }
  });
});

describe("systemStateWord reads a system's own record", () => {
  it("maps every state the contract enumerates", () => {
    // Transcribed from `SystemState` in contract/openapi.yaml. The seed holds
    // rows for two of the three; the third is here because the enum is, and
    // because H6's legend defines a word the page then has to be able to draw.
    assert.equal(systemStateWord("live"), "live");
    assert.equal(systemStateWord("in_build"), "in_build");
    assert.equal(systemStateWord("queued"), "queued");
  });

  it("guesses at nothing", () => {
    for (const value of ["LIVE", "ok", "", null, undefined, 1, {}]) {
      assert.equal(systemStateWord(value), null);
    }
  });

  // The two functions read two different fields of two different documents, and
  // the failure mode is silent: `systemWord("ok")` also returns "live".
  it("is not systemWord — it reads a row, not a health answer", () => {
    assert.equal(systemStateWord("ok"), null);
    assert.equal(systemWord("live"), null);
  });
});

// H2b. The fourth vocabulary, and the one that is a validator rather than a
// translation — a day is not a state a system is in.
describe("one day of the operation grid", () => {
  it("hands back the four the contract enumerates", () => {
    for (const value of ["ok", "degraded", "outage", "nodata"]) {
      assert.equal(dayState(value), value);
    }
  });

  // The load-bearing one. A value this function does not know must not become a
  // clean day: eighty-two of ninety-one cells are `nodata` in production today,
  // and a grid that filled in on a shrug is the picture invariants 1 and 6 both
  // exist to prevent.
  it("turns anything else into nothing, never into a measured day", () => {
    for (const value of ["OK", "up", "down", "", null, undefined, 0, 1, {}, ["ok"]]) {
      assert.equal(dayState(value), null);
    }
  });

  // Two vocabularies with the same word in them, read off two different
  // documents. `degraded` means "it answered badly" in a health document and
  // "that day was reduced" in a grid — the failure mode is silent, because both
  // functions return something for it.
  it("is not healthStatus — it reads a day, not a health answer", () => {
    assert.equal(dayState("outage"), "outage");
    assert.equal(healthStatus("outage"), null);
    assert.equal(dayState("ok"), "ok");
    assert.equal(healthStatus("ok"), "ok");
  });
});
