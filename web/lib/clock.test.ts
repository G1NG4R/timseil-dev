// The G3 acceptance, for the half a machine can hold. The other half is a
// browser console with twenty reloads in it, and the runbook carries that.
//
// The valuable tests here are the four that describe FAILURES NOBODY WOULD SEE:
// a clock that is right on CI and wrong in Kathmandu, a server snapshot that
// quietly went live, a placeholder that changes width when the digits land, and
// an interval that is either duplicated or leaked. None of them show up as a
// broken-looking page.
//
// No DOM library. The store touches `setInterval` and `clearInterval`, and two
// globals are cheaper to fake than to install — the same trade lib/theme.test.ts
// made for `localStorage`.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  CLOCK_INTERVAL_MS,
  CLOCK_PLACEHOLDER,
  clockServerSnapshot,
  clockSnapshot,
  formatUtc,
  subscribeClock,
} from "./clock.ts";

void test("formatUtc is HH:MM:SS, zero-padded, 24-hour", () => {
  assert.equal(formatUtc(Date.UTC(2026, 7, 28, 4, 5, 6)), "04:05:06");
  assert.equal(formatUtc(Date.UTC(2026, 7, 28, 0, 0, 0)), "00:00:00");
  assert.equal(formatUtc(Date.UTC(2026, 7, 28, 23, 59, 59)), "23:59:59");
  assert.equal(formatUtc(0), "00:00:00");

  // Not 12-hour, and no AM/PM anywhere near it.
  assert.equal(formatUtc(Date.UTC(2026, 7, 28, 13, 0, 0)), "13:00:00");
});

// THE BROKEN CASE THIS FILE EXISTS FOR.
//
// `getHours()` with padding passes every assertion above on a UTC machine, and
// CI is a UTC machine. So the zone has to be forced from outside the process:
// the child imports the real module and prints what it computes.
//
// Kathmandu is +05:45 — a rewrite using local time fails on the hour AND on the
// minute there, where a +01:00 zone would let a minute bug through unseen. The
// UTC run beside it is not redundant: without it, a harness that silently failed
// to spawn anything would report a pass.
void test("the clock is UTC, on a machine that is not", () => {
  const source = `
    import { formatUtc } from "./clock.ts";
    process.stdout.write(formatUtc(Date.UTC(2026, 7, 28, 4, 5, 6)));
  `;

  const inZone = (tz: string): string =>
    execFileSync(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "--eval", source],
      { cwd: import.meta.dirname, encoding: "utf8", env: { ...process.env, TZ: tz } },
    );

  assert.equal(inZone("Asia/Kathmandu"), "04:05:06", "the clock followed the machine's zone");
  assert.equal(inZone("UTC"), "04:05:06", "the harness did not actually run the module");
});

void test("the server snapshot is the placeholder and stays it", () => {
  // Two calls a moment apart. Anything derived from the clock differs across a
  // second boundary; this must not.
  assert.equal(clockServerSnapshot(), CLOCK_PLACEHOLDER);
  assert.equal(clockServerSnapshot(), CLOCK_PLACEHOLDER);

  // Spelled out, because the edit that breaks it looks like an improvement:
  // returning formatUtc(Date.now()) here puts one string in the server HTML and
  // a different one in the hydration render, which is the mismatch the whole
  // phase is about.
  assert.notEqual(clockServerSnapshot(), clockSnapshot());
});

void test("the placeholder is exactly as wide as a time", () => {
  // Eight characters either side. A `-:-:-` placeholder would shift the logo,
  // the nav and the language button on every cold load.
  assert.equal(CLOCK_PLACEHOLDER.length, formatUtc(0).length);
  assert.equal(CLOCK_PLACEHOLDER.length, 8);
});

void test("getSnapshot returns the identical string within a second", () => {
  // React: "The result of getSnapshot should be cached to avoid an infinite
  // loop." It is a warning rather than an error, which means it would pass a
  // page that looks fine and fail an acceptance whose criterion is an empty
  // console.
  assert.ok(Object.is(clockSnapshot(), clockSnapshot()));
});

// ONE INTERVAL, HOWEVER MANY CLOCKS — the test for the failure mode no browser
// shows you. Three separate bugs live in this shape: a second timer per
// subscriber, one component unmounting stopping everyone's clock, and the last
// unsubscribe leaving the timer running forever.
void test("the interval is refcounted, started once and cleared once", () => {
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;

  let started = 0;
  let cleared = 0;
  const ticks: (() => void)[] = [];

  try {
    globalThis.setInterval = ((fn: () => void, ms: number) => {
      started += 1;
      assert.equal(ms, CLOCK_INTERVAL_MS);
      ticks.push(fn);
      return 1;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = () => {
      cleared += 1;
    };

    let a = 0;
    let b = 0;
    const stopA = subscribeClock(() => (a += 1));
    const stopB = subscribeClock(() => (b += 1));

    assert.equal(started, 1, "a second subscriber started a second interval");
    assert.equal(cleared, 0);

    ticks[0]?.();
    assert.deepEqual([a, b], [1, 1]);

    stopA();
    assert.equal(cleared, 0, "one component unmounting stopped everyone's clock");
    ticks[0]?.();
    assert.deepEqual([a, b], [1, 2], "the remaining subscriber stopped receiving ticks");

    stopB();
    assert.equal(cleared, 1, "the last unsubscribe leaked the interval");

    // And it comes back: a page that unmounts every clock and mounts one again
    // must not be left with a dead store.
    const stopC = subscribeClock(() => undefined);
    assert.equal(started, 2, "the interval did not restart");
    stopC();
    assert.equal(cleared, 2);
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});

void test("unsubscribing twice does not clear the interval out from under anyone", () => {
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;

  let started = 0;
  let cleared = 0;

  try {
    globalThis.setInterval = (() => {
      started += 1;
      return 1;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = () => {
      cleared += 1;
    };

    const stopA = subscribeClock(() => undefined);
    const stopB = subscribeClock(() => undefined);
    stopA();
    stopA();

    assert.equal(cleared, 0, "a repeated unsubscribe cleared a timer B still needs");
    stopB();
    assert.equal(cleared, 1);
    assert.equal(started, 1);
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});
