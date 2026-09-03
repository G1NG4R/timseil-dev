// What this file is for: the three fields nobody types are the three that can be
// wrong without anyone noticing. A honeypot with a space in it, a `ts` that is
// the open moment rather than the send moment, a `dwellMs` rounded up to the
// floor — none of those show on the screen, and all three change what the api
// does with the message.
//
// THE DWELL NUMBER IS THE ONE WITH TEETH. ADR 0021 §2 answers a submission
// under three seconds with a `202` that leads nowhere: no row, no mail, a
// receipt that means nothing. A form that clamped the number to 3000 would turn
// every early send into a silent loss AND make the loss invisible from both
// ends. So the test below asserts the number is reported and not repaired, and
// the wait is somebody's job instead.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBody, MIN_DWELL_MS, remainingDwellMs } from "./payload.ts";

const DRAFT = {
  name: "  Anna Keller  ",
  email: " anna.keller@firma.lu ",
  message: "  Hi Tim, do you have thirty minutes next week to talk about a pipeline?  ",
};

void test("the floor is the contract's floor", () => {
  const contract = readFileSync(new URL("../../../contract/openapi.yaml", import.meta.url), "utf8");
  const block = contract.slice(contract.indexOf("    ContactRequest:"));
  const stated = /dwellMs:[\s\S]{0,400}?minimum: (\d+)/.exec(block);
  assert.ok(stated !== null, "dwellMs has no minimum in the contract any more");
  assert.equal(MIN_DWELL_MS, Number.parseInt(stated[1], 10));
});

void test("the honeypot travels exactly as it was found", () => {
  // Empty for a visitor, because nothing puts a value in a field CSS has moved
  // off the screen. Not empty for whatever filled it — and THAT is the case
  // worth a test: a form that hardcoded "" would send a clean-looking body for
  // a submitter it was built to catch.
  assert.equal(buildBody(DRAFT, "", 4200, new Date()).company, "");
  assert.equal(buildBody(DRAFT, "Acme Ltd", 4200, new Date()).company, "Acme Ltd");
  // Untrimmed. validate.go compares `body.Company != ""` exactly, and a single
  // space is a submitter doing something worth refusing.
  assert.equal(buildBody(DRAFT, " ", 4200, new Date()).company, " ");
});

void test("every typed field arrives trimmed", () => {
  const body = buildBody(DRAFT, "", 4200, new Date("2026-09-03T19:22:07.000Z"));
  assert.equal(body.name, "Anna Keller");
  assert.equal(body.email, "anna.keller@firma.lu");
  assert.equal(body.message.startsWith("Hi Tim"), true);
  assert.equal(body.message.endsWith("pipeline?"), true);
});

void test("ts is the send moment, in the form the contract asks for", () => {
  const body = buildBody(DRAFT, "", 4200, new Date("2026-09-03T19:22:07.000Z"));
  assert.equal(body.ts, "2026-09-03T19:22:07.000Z");
});

void test("dwellMs is reported, not repaired", () => {
  // The assertion this file exists for. 2500 goes out as 2500 and is discarded
  // by the api; it does not go out as 3000 and quietly succeed. Waiting is the
  // caller's job, and remainingDwellMs is how it knows how long.
  assert.equal(buildBody(DRAFT, "", 2500, new Date()).dwellMs, 2500);
  assert.equal(buildBody(DRAFT, "", 4200.7, new Date()).dwellMs, 4200);
});

void test("the wait is zero once the floor is cleared", () => {
  assert.equal(remainingDwellMs(1000, 1000 + MIN_DWELL_MS), 0);
  assert.equal(remainingDwellMs(1000, 99_999), 0);
});

void test("the wait is the difference while it is not", () => {
  assert.equal(remainingDwellMs(1000, 1000), MIN_DWELL_MS);
  assert.equal(remainingDwellMs(1000, 3500), 500);
});

void test("a wait of a fraction of a millisecond is still a wait", () => {
  // THE ONE-MILLISECOND BUG, kept as a test. A timer asked to sleep 2957ms may
  // wake at 2956.8; the reading is then 2999.7, `buildBody` floors it to 2999,
  // and the api discards it in silence. So a fraction left over must come back
  // as a positive number rather than as zero — the caller loops on it until it
  // is zero, and this is the value that keeps the loop honest.
  assert.equal(remainingDwellMs(1000, 3999.7) > 0, true);
  assert.equal(remainingDwellMs(1000, 4000), 0);
});

void test("a clock that went backwards waits the whole floor", () => {
  // The safe direction: the visitor waits and the message is delivered. The
  // other direction sends a request that is discarded in silence, which is the
  // one outcome this page must never produce by accident.
  assert.equal(remainingDwellMs(5000, 1000), MIN_DWELL_MS);
  assert.equal(remainingDwellMs(Number.NaN, 1000), MIN_DWELL_MS);
});
