import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { correlationFrom, headersFrom, logIds } from "./correlation.ts";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const SPAN = "00f067aa0ba902b7";
const VALID = `00-${TRACE}-${SPAN}-01`;

describe("correlationFrom", () => {
  it("reads both ids off a request proxy.ts has been through", () => {
    const c = correlationFrom(new Headers({ "x-request-id": "a".repeat(32), traceparent: VALID }));
    assert.equal(c.requestId, "a".repeat(32));
    assert.equal(c.span?.traceId, TRACE);
  });

  it("is empty on a request that never met the proxy", () => {
    const c = correlationFrom(new Headers());
    assert.equal(c.requestId, null);
    assert.equal(c.span, null);
  });

  // Validated rather than trusted, because this same function reads the headers
  // Next hands to onRequestError.
  it("refuses a request id that would break a header or a line", () => {
    assert.equal(correlationFrom(new Headers({ "x-request-id": "short" })).requestId, null);
    assert.equal(correlationFrom(new Headers({ "x-request-id": "a b c d e f" })).requestId, null);
  });

  it("refuses a malformed traceparent rather than repairing it", () => {
    assert.equal(correlationFrom(new Headers({ traceparent: "00-nope-nope-01" })).span, null);
  });

  it("keeps the half that is intact when the other half is not", () => {
    const c = correlationFrom(new Headers({ "x-request-id": "short", traceparent: VALID }));
    assert.equal(c.requestId, null);
    assert.equal(c.span?.traceId, TRACE);
  });
});

describe("headersFrom", () => {
  it("carries a plain value through", () => {
    assert.equal(headersFrom({ "x-request-id": "abcdefgh" }).get("x-request-id"), "abcdefgh");
  });

  // The comma is not cosmetic: it is how inboundSpan recognises that a request
  // carried two traceparents, and refuses to pick between them.
  it("joins a repeated header so that two traceparents stay refusable", () => {
    const headers = headersFrom({ traceparent: [VALID, VALID] });
    assert.equal(correlationFrom(headers).span, null);
  });
});

describe("logIds", () => {
  it("turns an absent id into an absent field, never an empty one", () => {
    assert.deepEqual(logIds({ requestId: null, span: null }), {
      requestId: undefined,
      traceId: undefined,
    });
  });

  it("passes on what is there", () => {
    const ids = logIds({ requestId: "abcdefgh", span: { traceId: TRACE, spanId: SPAN, sampled: true } });
    assert.equal(ids.requestId, "abcdefgh");
    assert.equal(ids.traceId, TRACE);
  });
});
