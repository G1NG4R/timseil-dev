import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { healthStatus, siteWord, systemStateWord, systemWord } from "./derive.ts";

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
  it("maps the two states this site holds rows for", () => {
    assert.equal(systemStateWord("live"), "live");
    assert.equal(systemStateWord("queued"), "queued");
  });

  // Not an omission. The vocabulary has no word for it, IN BUILD is drawn on
  // the Work Index sheet, and H6 is the phase that gives it a tone, a dot and a
  // dictionary key. A ninth mark invented here would be a state nobody has seen.
  it("has no word for in_build yet, and says so with null", () => {
    assert.equal(systemStateWord("in_build"), null);
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
