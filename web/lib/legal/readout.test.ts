// The browser that knows nothing.
//
// This panel is the privacy page's whole argument — "here is your own request,
// read from your own browser" — and the argument fails in two directions. It
// fails loudly if the module throws on a browser that will not answer, and it
// fails quietly if a missing answer renders as `undefined`, `NaN` or a blank
// where the reader expects a fact. The second is worse, because it looks like
// the page worked.
//
// So the source under test here is the worst browser that could plausibly load
// this page: no language list, no referrer, a screen of nothing, and an `Intl`
// that refuses outright.

import assert from "node:assert/strict";
import test from "node:test";

import {
  FIELD_COUNT,
  IP_KEY,
  IP_VALUE,
  isPending,
  PENDING,
  readFields,
  readoutServerSnapshot,
  readoutSnapshot,
  resetReadoutForTest,
  subscribeReadout,
  USER_AGENT_MAX,
  type ReadoutSource,
} from "./readout.ts";

/** The address of the document the panel is part of. Handed in by the page,
 *  never read off the browser — that is the whole of #376. */
const PATH = "/privacy";

/** A browser that answers every question. */
function goodSource(over: Partial<ReadoutSource> = {}): ReadoutSource {
  return {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Firefox/141.0",
    languages: ["en-GB", "en", "de"],
    language: "en-GB",
    referrer: "https://example.org/somewhere",
    protocol: "h2",
    screenWidth: 2560,
    screenHeight: 1440,
    windowWidth: 1440,
    windowHeight: 900,
    timeZone: () => "Europe/Luxembourg",
    now: () => Date.parse("2026-09-11T10:42:30.123Z"),
    ...over,
  };
}

/** A browser that answers none of them, and throws at the one that is a call. */
function blindSource(): ReadoutSource {
  return {
    userAgent: undefined,
    languages: undefined,
    language: undefined,
    referrer: "",
    protocol: "",
    screenWidth: undefined,
    screenHeight: undefined,
    windowWidth: undefined,
    windowHeight: undefined,
    timeZone: () => {
      throw new RangeError("Intl is not available");
    },
    now: () => Date.parse("2026-09-11T10:42:30.123Z"),
  };
}

void test("a browser that knows nothing still fills all eight lines", () => {
  const fields = readFields(PATH, blindSource());
  assert.equal(fields.length, FIELD_COUNT);
  for (const field of fields) {
    assert.equal(typeof field.value, "string", field.key);
    assert.notEqual(field.value.length, 0, field.key);
    // The three ways a missing answer leaks into a legal document.
    assert.doesNotMatch(field.value, /undefined|NaN|\[object/, field.key);
  }
});

void test("the values a blind browser produces are the ones a reader can act on", () => {
  const byKey = new Map(readFields(PATH, blindSource()).map((field) => [field.key, field.value]));
  assert.equal(byKey.get("REFERRER"), "(none — typed or bookmarked)");
  assert.equal(byKey.get("LANGUAGE"), PENDING);
  assert.equal(byKey.get("TIME ZONE"), PENDING);
  // 0×0 rather than NaN×NaN, and rather than a line that quietly disappears.
  assert.equal(byKey.get("VIEWPORT"), "0×0 screen · 0×0 window");
});

void test("an Intl that throws is an answer, not a crash", () => {
  assert.doesNotThrow(() => readFields(PATH, blindSource()));
});

// THE LINE THAT MUST NEVER BECOME A MEASUREMENT. The panel's credibility rests
// on it: the browser cannot read the visitor's address, the server writes it
// down anyway, and the page says so instead of pretending the field is empty.
void test("the IP line is the same sentence whatever the browser offers", () => {
  const planted = {
    ...goodSource(),
    // A source that tries to supply one. The type does not allow it, the shape
    // of the object at runtime does, and this is the test that says no.
    IP: "203.0.113.7",
  } as unknown as ReadoutSource;

  for (const source of [goodSource(), blindSource(), planted]) {
    const ip = readFields(PATH, source).find((field) => field.key === IP_KEY);
    assert.ok(ip !== undefined, "the IP line is not optional; it is the point of the panel");
    assert.equal(ip.value, IP_VALUE);
    assert.doesNotMatch(ip.value, /\d+\.\d+\.\d+\.\d+/);
  }
});

void test("the request line measures the protocol and never claims a status", () => {
  const byKey = new Map(readFields(PATH, goodSource()).map((field) => [field.key, field.value]));
  assert.equal(byKey.get("REQUEST"), "GET /privacy · h2");

  // The sheet's mock writes `GET /privacy HTTP/2 · 200`. A browser cannot see
  // the status code of the document it is displaying, so the page does not say
  // one — here or in any future edit that finds the line too short.
  for (const source of [goodSource(), blindSource(), goodSource({ protocol: "http/1.1" })]) {
    const request = readFields(PATH, source).find((field) => field.key === "REQUEST");
    assert.doesNotMatch(request?.value ?? "", /\b[1-5]\d\d\b/);
  }
});

void test("a browser that reports no protocol gets a line without one", () => {
  const byKey = new Map(
    readFields(PATH, goodSource({ protocol: undefined })).map((field) => [field.key, field.value]),
  );
  assert.equal(byKey.get("REQUEST"), "GET /privacy");
});

void test("a long user agent is cut visibly, not silently", () => {
  const long = "U".repeat(USER_AGENT_MAX + 40);
  const value =
    readFields(PATH, goodSource({ userAgent: long })).find((field) => field.key === "USER-AGENT")
      ?.value ?? "";

  assert.equal(value.length, USER_AGENT_MAX + 1);
  assert.ok(value.endsWith("…"), "a string cut without a mark reads as a short string");
});

void test("a user agent exactly at the limit is not cut", () => {
  const exact = "U".repeat(USER_AGENT_MAX);
  const value =
    readFields(PATH, goodSource({ userAgent: exact })).find((field) => field.key === "USER-AGENT")
      ?.value ?? "";
  assert.equal(value, exact);
});

void test("the timestamp is UTC whatever the machine thinks", () => {
  const value =
    readFields(PATH, goodSource()).find((field) => field.key === "TIMESTAMP")?.value ?? "";
  assert.equal(value, "2026-09-11 10:42:30 UTC");
});

void test("the count under the panel is the number of lines above it", () => {
  assert.equal(readFields(PATH, goodSource()).length, FIELD_COUNT);
  assert.equal(readoutServerSnapshot().length, FIELD_COUNT);
});

// THE INFINITE LOOP, AND IT IS TWO LINES OF TEST. `useSyncExternalStore`
// compares with `Object.is`; a getSnapshot that builds a fresh array every call
// never returns an equal value and React re-renders until the tab gives up.
void test("the server snapshot is the same array every time it is asked", () => {
  assert.equal(readoutServerSnapshot(), readoutServerSnapshot());
});

void test("the live snapshot is the same array every time it is asked", () => {
  resetReadoutForTest();
  const first = readoutSnapshot(PATH, () => goodSource());
  const second = readoutSnapshot(PATH, () => goodSource());
  assert.equal(first, second, "a fresh array per call is an infinite render loop");
  resetReadoutForTest();
});

// THE BROKEN CASE OF #376, and it is the reason the path is an argument.
//
// The old shape read `location.pathname` into the cache on first call and kept
// it for the life of the module. A client-side transition between two
// prerendered routes leaves the cache in place, so the panel on the second page
// printed the first page's address — measured against production on 2026-09-19,
// arriving at `/privacy` from `/imprint` by link.
//
// Here that is a cache that outlives the document it describes, and it cannot
// happen any more because the key is the document.
void test("a reading does not follow the visitor to the next page", () => {
  resetReadoutForTest();

  const onPrivacy = readoutSnapshot("/privacy", () => goodSource());
  assert.equal(
    onPrivacy.find((field) => field.key === "REQUEST")?.value,
    "GET /privacy · h2",
  );

  const onImprint = readoutSnapshot("/imprint", () => goodSource());
  assert.equal(
    onImprint.find((field) => field.key === "REQUEST")?.value,
    "GET /imprint · h2",
    "the cached reading described the page the visitor came from",
  );
  assert.notEqual(onPrivacy, onImprint, "two documents, two readings");

  // And the second reading is as stable as the first was.
  assert.equal(onImprint, readoutSnapshot("/imprint", () => goodSource()));

  resetReadoutForTest();
});

// The other half: the browser is no longer asked, so no browser can answer.
// There is no `path` on `ReadoutSource` to read, and the line is whatever the
// page handed in — including the localised route.
void test("the request line names the address the page was rendered for", () => {
  for (const path of ["/privacy", "/de/privacy", "/fr/privacy"]) {
    resetReadoutForTest();
    const request = readoutSnapshot(path, () => goodSource()).find(
      (field) => field.key === "REQUEST",
    );
    assert.equal(request?.value, `GET ${path} · h2`);
  }
  resetReadoutForTest();
});

void test("the pending panel is recognised by identity, not by looking for dashes", () => {
  resetReadoutForTest();
  assert.equal(isPending(readoutServerSnapshot()), true);
  // A visitor with no referrer, no language list and no time zone has three
  // dashes in a real reading. Scanning for them would tell that visitor their
  // request was never read.
  assert.equal(isPending(readFields(PATH, blindSource())), false);
  resetReadoutForTest();
});

void test("the server snapshot already carries the one line that needs no browser", () => {
  const ip = readoutServerSnapshot().find((field) => field.key === IP_KEY);
  assert.equal(ip?.value, IP_VALUE);
  for (const field of readoutServerSnapshot()) {
    if (field.key === IP_KEY) continue;
    assert.equal(field.value, PENDING, field.key);
  }
});

void test("subscribing and unsubscribing is safe and changes nothing", () => {
  const unsubscribe = subscribeReadout();
  assert.equal(typeof unsubscribe, "function");
  assert.doesNotThrow(() => {
    unsubscribe();
  });
});

// KEIN ALERT-ROT. The sheet's design note says the panel has no error state,
// and the type enforces it — this test is what makes the type's job legible to
// somebody reading the file rather than the union.
void test("no line is ever emphasised as an error", () => {
  for (const source of [goodSource(), blindSource()]) {
    for (const field of readFields(PATH, source)) {
      assert.ok(["dim", "body", "ink"].includes(field.emphasis), field.key);
    }
  }
});

void test("the source is built once, however often the snapshot is read", () => {
  // React calls `getSnapshot` on every render. Reading `navigator`, `screen`
  // and the Navigation Timing entry on each of those would be waste, and — more
  // to the point — a second reading could disagree with the first, which on
  // this page means the panel quietly changing what it claims about a request
  // that already happened.
  resetReadoutForTest();
  let built = 0;
  const make = () => {
    built += 1;
    return goodSource();
  };
  readoutSnapshot(PATH, make);
  readoutSnapshot(PATH, make);
  readoutSnapshot(PATH, make);
  assert.equal(built, 1);
  resetReadoutForTest();
});
