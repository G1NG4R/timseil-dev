// The 404 is the one page a stranger chooses the content of: the address is
// theirs, and it is rendered. So most of this file is about the address being
// hostile rather than about the log being pretty.

import assert from "node:assert/strict";
import test from "node:test";

import { MOUNTED_COUNT, MOUNTED_ROUTES } from "./mounted.ts";
import { PATH_LIMIT, displayPath, routerTraceLines } from "./trace.ts";

void test("an ordinary address is shown as it was sent", () => {
  assert.equal(displayPath("/systems/relay/v2"), "/systems/relay/v2");
});

// THE ONE THAT MATTERS. The terminal's second rule is that output is data and
// never HTML, and this panel is the same surface: React escapes it, so the
// assertion is that nothing here tries to be clever and unescape it first.
void test("markup in an address stays characters", () => {
  const attack = "/<img src=x onerror=alert(1)>";
  assert.equal(displayPath(attack), attack);
});

// A newline in a log line is a second line the writer did not authorise — the
// log-injection shape, one layer up from where the api refuses it.
void test("control characters are removed, not escaped", () => {
  assert.equal(displayPath("/a\nb"), "/ab");
  assert.equal(displayPath("/a\r\nrouter: everything is fine"), "/arouter: everything is fine");
  assert.equal(displayPath("/a\u0000b"), "/ab");
  assert.equal(displayPath("/a\u007Fb"), "/ab");
});

// A scanner's URL is not bounded by anything. The ellipsis is what says the
// value was cut rather than what arrived.
void test("a very long address is cut and says so", () => {
  const long = `/${"a".repeat(PATH_LIMIT * 3)}`;
  const shown = displayPath(long);

  assert.ok(shown !== null);
  assert.equal(shown.length, PATH_LIMIT + 1);
  assert.equal(shown.endsWith("…"), true);
});

// INVARIANT 1, ON A STRING. An address that is absent, or that was nothing but
// control characters, is absent — not an empty line pretending to be a path.
void test("nothing to show is null rather than an empty line", () => {
  assert.equal(displayPath(null), null);
  assert.equal(displayPath(""), null);
  assert.equal(displayPath("   "), null);
  assert.equal(displayPath("\n\r"), null);
});

void test("the log names the address it was given", () => {
  const lines = routerTraceLines({
    path: "/systems/relay/v2",
    mounted: MOUNTED_COUNT,
    hints: MOUNTED_ROUTES,
  });

  assert.equal(lines[0]?.text, "GET /systems/relay/v2 HTTP/1.1");
});

// The request line is the one line with a measured value in it. Without a path
// there is nothing to measure, so the line goes rather than printing a guess.
void test("with no address the request line is absent, not empty", () => {
  const lines = routerTraceLines({ path: null, mounted: MOUNTED_COUNT, hints: MOUNTED_ROUTES });

  assert.equal(
    lines.some((line) => line.text.startsWith("GET ")),
    false,
  );
  assert.equal(lines[0]?.text.startsWith("→ router:"), true);
});

// THE SHEET SAID FOUR AND DREW FIVE. The count comes from the list precisely so
// that the sentence cannot disagree with the thing under it — this is the
// assertion that keeps them married.
void test("the count in the log is the length of the list", () => {
  const lines = routerTraceLines({
    path: "/x",
    mounted: MOUNTED_COUNT,
    hints: MOUNTED_ROUTES,
  });

  assert.equal(MOUNTED_COUNT, MOUNTED_ROUTES.length);
  assert.equal(
    lines.some((line) => line.text === `→ router: matching ${String(MOUNTED_ROUTES.length)} mounted routes … no match`),
    true,
  );
});

void test("the fallback line is the page's alert moment", () => {
  const lines = routerTraceLines({ path: "/x", mounted: MOUNTED_COUNT, hints: MOUNTED_ROUTES });
  const alerts = lines.filter((line) => line.tone === "alert");

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.text, "→ handler: fallback 404");
});

void test("the hint offers every route the page lists", () => {
  const lines = routerTraceLines({ path: "/x", mounted: MOUNTED_COUNT, hints: MOUNTED_ROUTES });
  const hint = lines.find((line) => line.text.startsWith("hint:"));

  assert.notEqual(hint, undefined);
  for (const route of MOUNTED_ROUTES) {
    assert.equal(hint?.text.includes(route), true, route);
  }
});
