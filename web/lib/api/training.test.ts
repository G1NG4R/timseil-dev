import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NO_DATA } from "../state/words.ts";

import { evidenceLine, modules, trackView, trainingMeta, type Training } from "./training.ts";

// THE EMPTY ROW IS THE FIRST TEST AND NOT THE LAST, because it is the row this
// endpoint exists for: nine of the twenty-two tracks have no evidence at launch,
// and ADR 0018 records that an inner join would have dropped exactly them. Every
// block below asks what happens when something is missing before it asks what
// happens when everything is there.

describe("a track with nothing to point at", () => {
  it("says so, and says what stands in place of a system", () => {
    assert.deepEqual(evidenceLine({ name: "C", state: "queued", evidence: [], note: "self-study" }), {
      prefix: "NO SYSTEM YET",
      text: "SELF-STUDY",
    });
  });

  it("stops after the prefix when the answer carried no note either", () => {
    // The contract sets `note` only when `evidence` is empty, so an older build
    // that has the array and not the field lands here. `NO SYSTEM YET` is a
    // whole sentence; an arrow into nothing is not.
    assert.deepEqual(evidenceLine({ name: "C", state: "queued", evidence: [] }), {
      prefix: "NO SYSTEM YET",
      text: null,
    });
  });

  it("says it for any state, not only for queued", () => {
    // The empty array wins over the state word. A `core` track with no evidence
    // is a contradiction the api cannot produce — and if one arrived, the row
    // that claimed `RUNS IN →` with nothing after it would be the worse answer.
    for (const state of ["core", "applied", "learning", "queued"]) {
      assert.equal(evidenceLine({ state, evidence: [] }).prefix, "NO SYSTEM YET");
    }
  });

  it("falls back to it when every row was too broken to render", () => {
    // A row with no `systemId` names nothing. Dropping it and then printing
    // `SHIPPED IN →` with an empty tail would be the shape of an invented claim.
    assert.deepEqual(evidenceLine({ state: "applied", evidence: [{ systemNo: "02" }] }), {
      prefix: "NO SYSTEM YET",
      text: null,
    });
  });
});

describe("the prefix follows the state", () => {
  const row = [{ systemId: "timseil-dev", systemNo: "02" }];

  it("gives each of the four its own words", () => {
    assert.equal(evidenceLine({ state: "core", evidence: row }).prefix, "RUNS IN");
    assert.equal(evidenceLine({ state: "applied", evidence: row }).prefix, "SHIPPED IN");
    assert.equal(evidenceLine({ state: "learning", evidence: row }).prefix, "RUNNING IN");
    assert.equal(evidenceLine({ state: "queued", evidence: row }).prefix, "PLANNED IN");
  });

  it("stays neutral about a state this build cannot name", () => {
    // ADR 0035's overlapping start: a contract newer than this container can
    // send a fifth word. The rows are still real, so the line names them — it
    // just does not say what they make the track, because it no longer knows.
    assert.equal(evidenceLine({ state: "mastered", evidence: row }).prefix, "EVIDENCE");
  });
});

describe("an evidence row is spelled the way the sheet spells it", () => {
  it("puts the number, the id and the detail in one line", () => {
    const line = evidenceLine({
      state: "applied",
      evidence: [{ systemNo: "02", systemId: "timseil-dev", detail: "api, health endpoint" }],
    });
    assert.equal(line.text, "02 TIMSEIL-DEV (API, HEALTH ENDPOINT)");
  });

  it("drops the brackets when there is no detail", () => {
    const line = evidenceLine({
      state: "applied",
      evidence: [{ systemNo: "02", systemId: "timseil-dev" }],
    });
    assert.equal(line.text, "02 TIMSEIL-DEV");
  });

  it("drops the number when there is none, rather than inventing one", () => {
    const line = evidenceLine({ state: "applied", evidence: [{ systemId: "timseil-dev" }] });
    assert.equal(line.text, "TIMSEIL-DEV");
  });

  it("joins several systems with the middle dot and keeps their order", () => {
    const line = evidenceLine({
      state: "core",
      evidence: [
        { systemNo: "02", systemId: "relay" },
        { systemNo: "03", systemId: "feedhound" },
        { systemNo: "04", systemId: "timseil-dev" },
      ],
    });
    assert.equal(line.text, "02 RELAY · 03 FEEDHOUND · 04 TIMSEIL-DEV");
  });

  it("keeps the rows it can read when one of them is broken", () => {
    const line = evidenceLine({
      state: "core",
      evidence: [{ systemNo: "02", systemId: "relay" }, { systemNo: "03" }],
    });
    assert.equal(line.text, "02 RELAY");
  });
});

describe("a track row", () => {
  it("takes its bar length from the state table and nowhere else", () => {
    assert.equal(trackView({ name: "Go", state: "core", evidence: [] })?.steps, 4);
    assert.equal(trackView({ name: "Go", state: "applied", evidence: [] })?.steps, 3);
    assert.equal(trackView({ name: "Go", state: "learning", evidence: [] })?.steps, 2);
    assert.equal(trackView({ name: "Go", state: "queued", evidence: [] })?.steps, 0);
  });

  it("draws no bar at all for a state it cannot name", () => {
    // Invariant 1 in four segments. A word we do not know may not be mapped
    // onto the nearest one we do — that would be an invented claim about
    // somebody's skill, made by a container that is one deploy out of date.
    assert.deepEqual(trackView({ name: "Rust", state: "mastered", evidence: [] }), {
      name: "Rust",
      state: null,
      steps: 0,
      evidence: { prefix: "NO SYSTEM YET", text: null },
    });
  });

  it("is dropped when it has no name to show", () => {
    // A nameless row is not a track with a missing label — there is nothing to
    // put in front of the evidence, and a bar on its own says nothing.
    assert.equal(trackView({ state: "applied", evidence: [] }), null);
    assert.equal(trackView({ name: "", state: "applied" }), null);
    assert.equal(trackView(null), null);
  });
});

describe("the tree comes back in the order it arrived", () => {
  it("does not sort the modules", () => {
    // D5 of this phase and ADR 0018 before it: `ORDER BY module_no, sort_order`
    // is part of the answer, and it is what keeps the ETag stable. A sort here
    // would be a second opinion about an order the server already has one on.
    const body = {
      modules: [
        { no: "04", title: "DevOps", tracks: [] },
        { no: "01", title: "Languages", tracks: [] },
      ],
    } as unknown as Training;

    assert.deepEqual(
      modules(body).map((module) => module.no),
      ["04", "01"],
    );
  });

  it("keeps a module that has no tracks", () => {
    // ADR 0018 kept `ListModules` as its own query for this: "das Modul ist
    // leer" is a different statement from "das Modul gibt es nicht", and a card
    // that vanished would make the second one for us.
    const body = { modules: [{ no: "05", title: "Foundations", tracks: [] }] } as unknown as Training;
    assert.equal(modules(body).length, 1);
    assert.equal(modules(body)[0].tracks.length, 0);
  });

  it("drops a module with no number or no name", () => {
    const body = {
      modules: [{ title: "Languages", tracks: [] }, { no: "02", tracks: [] }],
    } as unknown as Training;
    assert.deepEqual(modules(body), []);
  });

  it("answers an absent body with an empty list rather than throwing", () => {
    assert.deepEqual(modules(null), []);
    assert.deepEqual(modules({} as unknown as Training), []);
    assert.deepEqual(modules({ modules: "five" } as unknown as Training), []);
  });
});

describe("the line over the log", () => {
  it("reads the seed's own answer back", () => {
    const body = { trackCount: 22, evidenceSystems: 1 } as unknown as Training;
    assert.equal(
      trainingMeta(body),
      "SELF-TRACKED · 22 TRACKS · EVIDENCE: 01 SYSTEM · SOURCE: /api/training",
    );
  });

  it("counts systems in the plural once there are two", () => {
    const body = { trackCount: 22, evidenceSystems: 6 } as unknown as Training;
    assert.ok(trainingMeta(body).includes("EVIDENCE: 06 SYSTEMS"));
  });

  it("uses the api's count even when the tree disagrees with it", () => {
    // ADR 0018 counts both header numbers off the rows it actually serves, so
    // "die Kopfzeile und die Liste können strukturell nicht auseinanderlaufen".
    // Recounting the tree here would rebuild the second source of truth that
    // argument removed — and put the disagreement where it shows.
    const body = {
      trackCount: 22,
      evidenceSystems: 1,
      modules: [{ no: "01", title: "Languages", tracks: [{ name: "Go", state: "applied" }] }],
    } as unknown as Training;

    assert.ok(trainingMeta(body).includes("22 TRACKS"));
    assert.equal(modules(body)[0].tracks.length, 1);
  });

  it("says — NO DATA rather than nought when a number did not arrive", () => {
    // Invariant 1. `0 TRACKS` would be a measurement; the absence of the field
    // is not one, and the two must not look the same.
    const line = trainingMeta(null);
    assert.ok(line.includes(`${NO_DATA} TRACKS`), line);
    assert.ok(line.includes(`EVIDENCE: ${NO_DATA}`), line);
  });

  it("never says UPDATED, because no field in the answer means that", () => {
    // D4. `generatedAt` is filled after the ETag is computed — it is when this
    // answer was assembled, not when the log last changed. Printed as UPDATED it
    // would move on every reload while nothing had moved.
    const body = { trackCount: 22, evidenceSystems: 1, generatedAt: "2026-09-01T10:00:00Z" };
    assert.equal(trainingMeta(body as unknown as Training).includes("UPDATED"), false);
    assert.equal(trainingMeta(body as unknown as Training).includes("2026"), false);
  });
});
