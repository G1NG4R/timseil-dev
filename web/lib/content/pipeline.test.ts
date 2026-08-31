// The seven stages the case study draws, held against the workflow that runs
// them.
//
// WHY THIS TEST EXISTS AND THE OTHER PROSE ON THE PAGE HAS NONE. Everything else
// in content/case-studies is an argument — it is right or wrong the way a
// sentence is, and a test cannot tell. The pipeline row is different: it is a
// list of NAMES that exist somewhere else. `.github/workflows/ci.yml` is edited
// by phases that never open the case study, and a renamed job would leave this
// page describing a pipeline that no longer runs, with nothing red anywhere.
//
// That is the same class of defect chapter 12.3 removed for version numbers with
// "nobody types a value into a page again" — one step weaker, because the name
// is still typed here. What this test buys is that it cannot stay wrong.
//
// IT READS THE WORKFLOW AS TEXT, not as YAML. Adding a parser to `web/` for one
// assertion would be a dependency on the wrong side of the bundle budget, and
// the two things being asked — does a job with this name exist, and does the
// deploy wait for it — are both single lines in a file whose shape is fixed by
// `check-rule-names.sh` and reviewed on every change.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { timseilDev } from "../../content/case-studies/timseil-dev.ts";

const workflow = readFileSync(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");

/** The stages that claim to be a job in the workflow. */
const jobs = timseilDev.operations.stages
  .map((stage) => stage.job)
  .filter((job): job is string => job !== null);

describe("the pipeline row is the pipeline", () => {
  it("names a job that exists for every stage that claims to be one", () => {
    for (const job of jobs) {
      assert.ok(
        new RegExp(`^  ${job}:$`, "m").test(workflow),
        `the case study names a pipeline stage "${job}" and ci.yml has no such job`,
      );
    }
  });

  // THE ORDER IS THE CLAIM, not the list. Five boxes with arrows between them
  // say "this happens, then this" — so the test that matters is not that the
  // names exist but that the graph agrees they run before the deploy.
  //
  // `deploy` is the last job that carries a `needs:`, and every stage the page
  // draws to its left has to be in it. A page that showed E2E before DEPLOY
  // while the workflow deployed without waiting for it would be a drawing of a
  // gate that is not there.
  it("shows every stage before DEPLOY as something the deploy waits for", () => {
    const needs = /^  deploy:$[\s\S]*?^    needs: \[([^\]]+)\]$/m.exec(workflow);
    assert.ok(needs !== null, "ci.yml has no deploy job with a needs list");

    const waitsFor = needs[1].split(",").map((name) => name.trim());
    const before = jobs.slice(0, jobs.indexOf("deploy"));

    assert.deepEqual(
      before.filter((job) => !waitsFor.includes(job)),
      [],
      `drawn before DEPLOY but not in its needs: ${before.join(", ")} vs ${waitsFor.join(", ")}`,
    );
  });

  // The two stages that are real and are not jobs. PUSH is the event the
  // workflow answers; VERIFY runs inside `deploy`, because a gate that could be
  // skipped as its own job is not a gate. `null` says so explicitly rather than
  // leaving them off the row — the row would then be five boxes and a different
  // claim.
  it("marks the two stages that are not jobs as not jobs", () => {
    const notJobs = timseilDev.operations.stages
      .filter((stage) => stage.job === null)
      .map((stage) => stage.title);

    assert.deepEqual(notJobs, ["PUSH", "VERIFY"]);
  });

  it("draws seven stages, which is what the sheet draws", () => {
    assert.equal(timseilDev.operations.stages.length, 7);
  });
});
