// The table of broken traceparents, written out again on this side.
//
// Two implementations of one wire format are two chances to get it differently
// wrong. Every rejection below is one api/internal/traceparent also makes, and
// the point of duplicating them is that a change to either half fails here
// before it reaches a log store where the two ids would stop meeting.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  childSpan,
  createSpan,
  inboundSpan,
  parseTraceparent,
  renderTraceparent,
} from "./trace.ts";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN = "00f067aa0ba902b7";
const VALID = `00-${TRACE}-${SPAN}-01`;

describe("parseTraceparent accepts what the specification describes", () => {
  it("reads the example from the specification", () => {
    const span = parseTraceparent(VALID);
    assert.deepEqual(span, { traceId: TRACE, spanId: SPAN, sampled: true });
  });

  it("reads the sampled bit rather than the whole flags byte", () => {
    assert.equal(parseTraceparent(`00-${TRACE}-${SPAN}-00`)?.sampled, false);
    // Bit 0 set among other bits still means sampled.
    assert.equal(parseTraceparent(`00-${TRACE}-${SPAN}-09`)?.sampled, true);
  });
});

describe("parseTraceparent refuses, and never repairs", () => {
  // Each of these is a fresh trace rather than an error: a stranger's broken
  // header is not a reason to fail their request.
  const rejected: [string, string][] = [
    ["empty", ""],
    ["uppercase hex", `00-${TRACE.toUpperCase()}-${SPAN}-01`],
    ["all-zero trace id", `00-${"0".repeat(32)}-${SPAN}-01`],
    ["all-zero span id", `00-${TRACE}-${"0".repeat(16)}-01`],
    ["unknown version", `ff-${TRACE}-${SPAN}-01`],
    ["future version", `01-${TRACE}-${SPAN}-01`],
    ["three fields", `00-${TRACE}-${SPAN}`],
    ["five fields", `00-${TRACE}-${SPAN}-01-extra`],
    ["short trace id", `00-${TRACE.slice(1)}-${SPAN}-01`],
    ["long span id", `00-${TRACE}-${SPAN}0-01`],
    ["one-character flags", `00-${TRACE}-${SPAN}-1`],
    ["non-hex flags", `00-${TRACE}-${SPAN}-gg`],
    ["a newline", `00-${TRACE}-${SPAN}-01\n`],
    ["a carriage return", `00-${TRACE}-${SPAN}-01\r`],
    ["a tab", `00-${TRACE}-${SPAN}-01\t`],
    ["a space", `00-${TRACE}-${SPAN}-01 `],
    ["a list", `${VALID},${VALID}`],
  ];

  for (const [name, header] of rejected) {
    it(name, () => {
      assert.equal(parseTraceparent(header), null);
    });
  }

  // The reason the whitespace cases above are not cosmetic: the trace id is
  // written into a JSON log line, and a value carrying a newline would be a
  // stranger writing a second line of our log.
  it("cannot be used to forge a log line", () => {
    const forged = `00-${TRACE}-${SPAN}-01\n{"level":"INFO"}`;
    assert.equal(parseTraceparent(forged), null);
  });
});

describe("inboundSpan", () => {
  it("takes a single header", () => {
    const headers = new Headers({ traceparent: VALID });
    assert.equal(inboundSpan(headers)?.traceId, TRACE);
  });

  // The specification says a receiver must restart the trace when it sees more
  // than one. It is right: picking one would be picking which of two callers to
  // believe.
  it("refuses two headers rather than choosing between them", () => {
    const headers = new Headers();
    headers.append("traceparent", VALID);
    headers.append("traceparent", `00-${SPAN}${SPAN}-${SPAN}-01`);
    assert.equal(inboundSpan(headers), null);
  });

  it("is null when there is no header at all", () => {
    assert.equal(inboundSpan(new Headers()), null);
  });
});

describe("what this service generates", () => {
  it("mints ids of the shape the api will accept", () => {
    const span = createSpan();
    assert.match(span.traceId, /^[0-9a-f]{32}$/);
    assert.match(span.spanId, /^[0-9a-f]{16}$/);
    assert.equal(span.sampled, true);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createSpan().traceId));
    assert.equal(ids.size, 500);
  });

  // Without a new span id this service and the api are one span in F8's view,
  // and the hop between them — the thing worth seeing — has no width.
  it("gives a child the same trace and a different span", () => {
    const parent = createSpan();
    const child = childSpan(parent);
    assert.equal(child.traceId, parent.traceId);
    assert.notEqual(child.spanId, parent.spanId);
  });

  // Re-deciding sampling halfway would split one trace into a sampled and an
  // unsampled half.
  it("inherits the sampling decision rather than remaking it", () => {
    const parent = { traceId: TRACE, spanId: SPAN, sampled: false };
    assert.equal(childSpan(parent).sampled, false);
  });

  it("renders what it parses", () => {
    const span = createSpan();
    assert.deepEqual(parseTraceparent(renderTraceparent(span)), span);
  });

  it("renders the flags of an unsampled span", () => {
    assert.ok(renderTraceparent({ traceId: TRACE, spanId: SPAN, sampled: false }).endsWith("-00"));
  });
});
