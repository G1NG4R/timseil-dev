// The bracket ADR 0075 said was missing.
//
// The retention loop lives in Go and the promise about it lives in English, and
// nothing in the type system can see both. This file can: it reads policy.go
// off disk and holds the two constants against the two the page renders.
//
// IT FAILS ON A REWORDING, NOT ONLY ON A NEW VALUE, and that is the point. The
// likelier accident is not somebody changing 30 to 60 — that is a decision
// somebody makes on purpose — it is somebody refactoring the duration into
// `720 * time.Hour` or a `time.Duration` returned from config, at which point a
// regex looking only for the digits would keep passing while the page's sentence
// quietly became a claim nobody enforces. So a missed match is a failure with
// its own message, not a skipped assertion.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RATE_LIMIT_MINUTES, RETENTION_DAYS, retentionSentence } from "./retention.ts";

// Resolved against this file rather than the working directory: `npm test` runs
// from web/, the e2e rig and the editor do not, and a cwd-relative path would
// make this test's answer depend on who asked.
const POLICY_GO = new URL("../../../api/internal/contact/policy.go", import.meta.url);

function policySource(): string {
  try {
    return readFileSync(POLICY_GO, "utf8");
  } catch {
    assert.fail(
      `api/internal/contact/policy.go is not readable from ${POLICY_GO.pathname}. ` +
        "It is the source of both durations on /privacy; if it moved, this bracket moved with it.",
    );
  }
}

void test("the retention window on the page is the one the purge loop enforces", () => {
  const match = /retentionWindow\s*=\s*(\d+)\s*\*\s*24\s*\*\s*time\.Hour/.exec(policySource());
  assert.ok(
    match !== null,
    "policy.go no longer writes retentionWindow as `N * 24 * time.Hour`. " +
      "Whatever it says now, /privacy still promises a number of days — read it and fix one of the two.",
  );
  assert.equal(Number.parseInt(match[1], 10), RETENTION_DAYS);
});

void test("the rate-limit window on the page is the one the limiter enforces", () => {
  const match = /RateLimitWindow\s*=\s*(\d+)\s*\*\s*time\.Minute/.exec(policySource());
  assert.ok(
    match !== null,
    "policy.go no longer writes RateLimitWindow as `N * time.Minute`. " +
      "/privacy says an IP hash is kept for minutes; one of the two is now wrong.",
  );
  assert.equal(Number.parseInt(match[1], 10), RATE_LIMIT_MINUTES);
});

// THE BROKEN CASE, STATED RATHER THAN IMPLIED. If the regex above is ever
// loosened to the point where it matches something that is not a duration, this
// is the test that notices: a file with no constant in it at all must not
// produce a passing comparison.
void test("a policy file without the constant does not silently agree", () => {
  const empty = "package contact\n\n// nothing here declares a window\n";
  assert.equal(/retentionWindow\s*=\s*(\d+)\s*\*\s*24\s*\*\s*time\.Hour/.exec(empty), null);
  assert.equal(/RateLimitWindow\s*=\s*(\d+)\s*\*\s*time\.Minute/.exec(empty), null);
});

void test("the promise is built from the number and carries it in digits", () => {
  const sentence = retentionSentence();
  assert.match(sentence, new RegExp(`\\b${String(RETENTION_DAYS)} days\\b`));
  // Spelled out, the number is invisible to content.test.ts's sweep over every
  // duration in the prose, and a promise nothing can read is a promise nothing
  // can check.
  assert.doesNotMatch(sentence, /thirty/i);
});
