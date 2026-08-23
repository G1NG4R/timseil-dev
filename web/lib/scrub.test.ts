// The three inputs that disproved the Go scrubber, plus the one that was not a
// leak but a way to stall the service.
//
// Node has no fuzzer, so the corpus is carried over by hand and the property is
// checked against a SECOND, naive implementation written in this file. That is
// the part worth keeping: a property test that calls the same code it is testing
// proves nothing, and the naive scan below shares no line with lib/scrub.ts.

import assert from "node:assert/strict";
import { isIP } from "node:net";
import { describe, it } from "node:test";

import { errorText, scrub, stripControl } from "./scrub.ts";

describe("stripControl", () => {
  it("replaces a control character with a space rather than deleting it", () => {
    // Two tokens run together read as one value that was never there.
    assert.equal(stripControl("a\nb"), "a b");
    assert.equal(stripControl("a\tb"), "a b");
    assert.equal(stripControl("a\u007fb"), "a b");
    assert.equal(stripControl("a\u0000b"), "a b");
  });

  it("keeps the length, so positions still line up", () => {
    const s = "one\r\ntwo";
    assert.equal(stripControl(s).length, s.length);
  });

  it("leaves multi-byte characters alone", () => {
    assert.equal(stripControl("Maß halten — ok"), "Maß halten — ok");
  });

  it("cannot be used to forge a second line", () => {
    const forged = stripControl('x\n{"level":"INFO","msg":"all good"}');
    assert.ok(!forged.includes("\n"));
  });
});

describe("scrub removes what it recognises", () => {
  it("takes an email out of a relay refusal", () => {
    const line = scrub("550 5.1.1 <someone@example.com>: Recipient address rejected");
    assert.ok(!line.includes("someone"));
    assert.ok(!line.includes("example.com"));
    assert.ok(line.includes("redacted-email"));
    // The reason survives — a filter that eats the line it protects gets
    // switched off after two weeks.
    assert.ok(line.includes("Recipient address rejected"));
  });

  it("takes the address out of the failure web will actually see", () => {
    const line = scrub("fetch failed: connect ECONNREFUSED 172.18.0.3:8080");
    assert.ok(!line.includes("172.18.0.3"));
    assert.ok(line.includes("redacted-ip"));
    assert.ok(line.includes("ECONNREFUSED"));
  });

  it("takes an IPv6 address with a port", () => {
    const line = scrub("peer [2001:db8::1]:443 went away");
    assert.ok(!line.includes("2001:db8"));
    assert.ok(line.includes("redacted-ip"));
  });

  // The one this port found in the ORIGINAL. Go skipped every candidate ending
  // in a colon as trailing punctuation, and "::" is syntax, not punctuation —
  // so an address that ends on its zero run went into the log untouched. Both
  // implementations carry the repair; see worthParsing.
  it("takes an IPv6 address that ends on its zero run", () => {
    const line = scrub("peer 2001:db8:: is gone");
    assert.ok(!line.includes("2001:db8"), line);
    assert.ok(line.includes("redacted-ip"), line);
  });
});

describe("the counterexamples the Go fuzzer found", () => {
  // Two separate sweeps — emails, then addresses — left the second domain
  // standing, because the first sweep stopped at the boundary it had just made.
  it("a@b.tld@c.tld leaves no domain behind", () => {
    const out = scrub("a@b.tld@c.tld");
    assert.ok(!out.includes("b.tld"), out);
    assert.ok(!out.includes("c.tld"), out);
  });

  // Redacting the IPv6 BUILT an email that was never in the input. One pass
  // fixes the class: what it writes is never read again.
  it("0@::0.XA does not have an address invented for it", () => {
    const out = scrub("0@::0.XA");
    assert.ok(!containsAddress(out), out);
  });

  // The only one of the five that was a real leak: trying just the maximal run
  // left the leading "::0" standing, one character at a time.
  it("::0.::0 leaves no address standing", () => {
    const out = scrub("::0.::0");
    assert.ok(!out.includes("::0"), out);
  });

  // The run-start test that was meant to keep the scan linear was the same bug
  // in green: the second run begins at '%', "%::0" does not parse, and the
  // "::0" inside it was never tried.
  it("::0X%::0 leaves no address standing", () => {
    const out = scrub("::0X%::0");
    assert.ok(!out.includes("::0"), out);
  });

  // Not a leak — a way to stall the service with the very thing that protects
  // it. 2700 characters of colons and digits took seven seconds in the Go logger
  // before the candidate was capped at 64 characters, and a request path has no
  // length limit.
  it("a 2700-character run of colons and digits does not stall the logger", () => {
    const bomb = ":0".repeat(1350);
    assert.equal(bomb.length, 2700);

    const started = process.hrtime.bigint();
    scrub(bomb);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    // Two orders of magnitude below the seven seconds, and still far above any
    // plausible machine-to-machine variation.
    assert.ok(ms < 500, `took ${String(Math.round(ms))}ms`);
  });

  // The worst case for the repair rather than for the original: worthParsing
  // now lets a candidate ending in "::" through, so a run of nothing but colons
  // is the shape that spends the most parses per position. Bounded by the same
  // 64 characters, and measured rather than assumed.
  it("a 2700-character run of nothing but colons stays bounded too", () => {
    const bomb = ":".repeat(2700);

    const started = process.hrtime.bigint();
    scrub(bomb);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    assert.ok(ms < 500, `took ${String(Math.round(ms))}ms`);
  });
});

describe("scrub leaves alone what is not an address", () => {
  // A pattern cannot tell these apart; handing the candidate to a parser can.
  it("keeps a timestamp", () => {
    assert.equal(scrub("started at 11:19:35"), "started at 11:19:35");
  });

  it("keeps a version", () => {
    assert.equal(scrub("v1.2.3-rc.1"), "v1.2.3-rc.1");
  });

  it("keeps a request id", () => {
    const id = "c1ae68fa4b2d4e7f9a0b1c2d3e4f5061";
    assert.equal(scrub(id), id);
  });

  it("keeps a bare sentence untouched and cheap", () => {
    const s = "contact delivery failed after 3 attempts";
    assert.equal(scrub(s), s);
  });
});

describe("errorText", () => {
  it("walks the cause chain, which is where the real failure lives", () => {
    const cause = new Error("connect ECONNREFUSED 172.18.0.3:8080");
    const err = new TypeError("fetch failed", { cause });
    assert.equal(errorText(err), "fetch failed: connect ECONNREFUSED 172.18.0.3:8080");
  });

  it("survives a cycle in cause", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;
    assert.ok(errorText(b).length > 0);
  });

  it("says what happened when the thrown value is not an Error", () => {
    assert.equal(errorText({ nope: true }), "non-error thrown");
    assert.equal(errorText("plain string"), "plain string");
  });
});

describe("the property: what the filter recognises, it removes", () => {
  // Deliberately NOT idempotence. The marker is either built from domain
  // characters and can become part of a domain, or it is not and can end one —
  // both marker shapes are duals, and a second pass may legitimately redact more
  // than the first. The property that holds is the promised one.
  it("holds over a generated corpus of address-shaped noise", () => {
    const rand = mulberry32(0x5eed);
    const alphabet = "0123456789abcdefABCDEF.:%[]@- xyz";

    for (let n = 0; n < 3000; n++) {
      const length = 1 + Math.floor(rand() * 40);
      let input = "";
      for (let i = 0; i < length; i++) {
        input += alphabet[Math.floor(rand() * alphabet.length)];
      }

      const out = scrub(input);
      assert.ok(!containsAddress(out), `input ${JSON.stringify(input)} left ${JSON.stringify(out)}`);
    }
  });
});

/**
 * A second, deliberately naive address finder.
 *
 * It shares no code with lib/scrub.ts: every substring up to 64 characters is
 * offered to `isIP`, with no run logic, no shrinking loop and no cleverness
 * about where a candidate may begin. Slow, and that is fine for a test — the
 * point is that it cannot inherit a mistake from the implementation it checks.
 *
 * Sixty-four matches the implementation's cap, and that is not a way of hiding
 * a gap: the longest thing `isIP` accepts is 45 characters, so a longer
 * candidate cannot be an address in the first place.
 */
function containsAddress(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 2; j <= Math.min(s.length, i + 64); j++) {
      if (isIP(s.slice(i, j)) !== 0) return true;
    }
  }
  return false;
}

/** A seeded PRNG, so a failing case is the same case tomorrow. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
