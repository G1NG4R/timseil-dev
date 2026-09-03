// What this file is for: the trace is the page's argument — "it explains what it
// does while it is doing it" — and an argument that drifts from the request is
// worse than no argument. Two things have to hold: what is drawn is what is
// sent, and the byte count is the body's rather than the drawing's.

import assert from "node:assert/strict";
import test from "node:test";

import { buildBody } from "./payload.ts";
import { bodyBytes, traceLines } from "./trace.ts";

const BODY = buildBody(
  {
    name: "Anna Keller",
    email: "anna.keller@firma.lu",
    message: "Hi Tim, do you have thirty minutes next week?",
  },
  "",
  4018,
  new Date("2026-09-03T19:22:07.000Z"),
);

void test("every value drawn is a value from the body that is sent", () => {
  const text = traceLines(BODY)
    .map((line) => line.text)
    .join("\n");

  assert.match(text, /"name": "Anna Keller",/);
  assert.match(text, /"email": "anna\.keller@firma\.lu",/);
  assert.match(text, /"dwellMs": 4018,/);
  assert.match(text, /"ts": "2026-09-03T19:22:07\.000Z"/);
});

void test("the honeypot is drawn, empty, and labelled", () => {
  // The sheet's own instruction, and the reason it is drawn at all: a visitor
  // who reads the trace can see there is nothing in it.
  const line = traceLines(BODY).find((entry) => entry.text.includes('"company"'));
  assert.ok(line !== undefined);
  assert.equal(line.text, '  "company": "",');
  assert.equal(line.note, "honeypot, stays empty");
});

void test("a value with a quote in it does not break out of the drawing", () => {
  // JSON.stringify and not string concatenation. A message containing `",` would
  // otherwise draw a request that is not valid JSON — and, worse, one that does
  // not match what is actually sent.
  const body = buildBody(
    { name: 'Anna "A" Keller', email: "a@b.lu", message: 'he said ",\n" and left' },
    "",
    4000,
    new Date(),
  );
  const line = traceLines(body).find((entry) => entry.text.includes('"name"'));
  assert.equal(line?.text, '  "name": "Anna \\"A\\" Keller",');
  // A newline in the message stays one line in the drawing, because that is
  // what one line of JSON is.
  const message = traceLines(body).find((entry) => entry.text.includes('"message"'));
  assert.equal(message?.text.includes("\n"), false);
});

void test("the protocol version is not drawn, because it is not known yet", () => {
  // The sheet writes `POST /api/contact HTTP/2`. The trace is rendered before
  // the request leaves; the version is negotiated by Traefik and the browser,
  // and a local build over plain HTTP would print HTTP/2 and be wrong.
  const request = traceLines(BODY)[0];
  assert.equal(request.text, "POST /api/contact");
  assert.equal(request.text.includes("HTTP/"), false);
});

void test("the host is the canonical one, from the one place that holds it", () => {
  assert.equal(traceLines(BODY)[1].text, "host: timseil.dev");
});

void test("the byte count is the body's, not the drawing's", () => {
  const drawn = traceLines(BODY)
    .map((line) => line.text)
    .join("\n").length;

  assert.equal(bodyBytes(BODY), new TextEncoder().encode(JSON.stringify(BODY)).length);
  // The indented drawing is longer than the wire form, so a count taken off the
  // drawing would be a number about the picture.
  assert.ok(bodyBytes(BODY) < drawn, "the wire form should be shorter than the drawing");
});

void test("bytes are bytes, so an umlaut costs two", () => {
  const ascii = buildBody({ name: "Mueller", email: "a@b.lu", message: "x".repeat(20) }, "", 4000, new Date(0));
  const umlaut = buildBody({ name: "M\u00fceller", email: "a@b.lu", message: "x".repeat(20) }, "", 4000, new Date(0));
  assert.equal(bodyBytes(umlaut), bodyBytes(ascii) + 1);
});

void test("an empty draft still draws a whole request", () => {
  // The rest state of the sheet: the shape is there before anything is typed,
  // which is what makes it an explanation rather than a readout.
  const empty = buildBody({ name: "", email: "", message: "" }, "", 0, new Date(0));
  const lines = traceLines(empty);
  assert.equal(lines.length, 12);
  assert.equal(lines.at(-1)?.text, "}");
});
