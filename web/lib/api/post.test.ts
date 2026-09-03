// What this file is for: five answers, and the page says a different thing to
// each. `apiGet` has one failure and one sentence for it — `— NO DATA` — so its
// test asks mostly whether the body arrived. This one has to prove the five
// stay apart, because the visitor's next move depends on which one it was:
// fix a field, wait ten minutes, or try again in a moment.
//
// AND THE HEADERS ARE HALF THE TEST. `content-type` must be exactly
// `application/json` — the api compares it strictly and the Origin check hangs
// off it — and `Retry-After` is the one number on the failure path that was
// MEASURED by the api rather than assumed, so dropping it would replace a
// measurement with a guess.

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { apiPost, POST_TIMEOUT_MS, retryAfterSeconds } from "./post.ts";

const realFetch = globalThis.fetch;

interface Call {
  url: string;
  init: RequestInit;
}
let calls: Call[] = [];

function answer(handler: () => Response | Promise<Response>): void {
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(handler());
  }) as unknown as typeof fetch;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

const BODY = {
  name: "Anna Keller",
  email: "anna.keller@firma.lu",
  message: "Hi Tim, do you have thirty minutes next week to talk about a pipeline?",
  company: "",
  dwellMs: 4200,
  ts: "2026-09-03T19:22:07.000Z",
};

function problem(status: number, type: string, extra: Record<string, unknown> = {}) {
  return { type: `https://timseil.dev/problems/${type}`, title: type, status, ...extra };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("the request", () => {
  it("goes to a relative path in a browser, so the page's own origin carries it", async () => {
    answer(() => json({ ok: true, id: "msg_01K3F9QX7A" }, { status: 202 }));

    // `apiTarget` branches on `typeof window`, and this is the branch that had
    // no caller until this phase. Node is not a browser, so the test has to say
    // it is one — which is also the shortest statement of what changed in H8.
    (globalThis as { window?: unknown }).window = {};
    try {
      await apiPost("/api/contact", BODY);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }

    // Not an absolute URL and not a container name. Traefik's PathPrefix(/api)
    // router is what makes this work, and it is the reason there is no
    // NEXT_PUBLIC_ variable naming an api host.
    assert.equal(calls[0].url, "/api/contact");
  });

  it("goes to the container on the server, where Traefik is not in the path", async () => {
    answer(() => json({ ok: true, id: "msg_1" }, { status: 202 }));
    await apiPost("/api/contact", BODY);
    // The same function, the other branch. Nothing calls it this way today —
    // the form is an island — and the assertion is here so that a future
    // server-side caller finds the behaviour stated rather than surprising.
    assert.match(calls[0].url, /^https?:\/\/[^/]+\/api\/contact$/);
  });

  it("sends exactly application/json, with no charset", async () => {
    answer(() => json({ ok: true, id: "msg_1" }, { status: 202 }));
    await apiPost("/api/contact", BODY);

    const headers = new Headers(calls[0].init.headers);
    // `contact.go:181` compares the whole value. A charset suffix here is
    // refused by our own api and looks like an outage from the outside.
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.cache, "no-store");
  });

  it("carries the honeypot as it was built, empty and untouched", async () => {
    answer(() => json({ ok: true, id: "msg_1" }, { status: 202 }));
    await apiPost("/api/contact", BODY);
    assert.equal(JSON.parse(String(calls[0].init.body)).company, "");
  });
});

describe("the five answers stay apart", () => {
  it("202 is a receipt", async () => {
    answer(() =>
      json({ ok: true, id: "msg_01K3F9QX7A" }, { status: 202, headers: { "X-Request-Id": "r".repeat(32) } }),
    );

    const result = await apiPost("/api/contact", BODY);

    assert.equal(result.kind, "ok");
    assert.equal(result.status, 202);
    if (result.kind !== "ok") return;
    assert.equal(result.data.id, "msg_01K3F9QX7A");
    assert.equal(result.upstreamRequestId, "r".repeat(32));
  });

  it("400 arrives with the fields, in the order the api listed them", async () => {
    answer(() =>
      json(
        problem(400, "validation-failed", {
          invalidParams: [
            { name: "name", reason: "at least 2 characters" },
            { name: "email", reason: "not a plain mail address" },
          ],
        }),
        { status: 400 },
      ),
    );

    const result = await apiPost("/api/contact", BODY);

    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.equal(result.status, 400);
    assert.deepEqual(result.problem?.invalidParams?.map((p) => p.name), ["name", "email"]);
  });

  it("429 carries the wait the api measured", async () => {
    answer(() => json(problem(429, "rate-limited"), { status: 429, headers: { "Retry-After": "418" } }));

    const result = await apiPost("/api/contact", BODY);

    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.equal(result.status, 429);
    // 418 and not 600: ADR 0021 §3 derives it from min(received_at), so a page
    // that printed a flat ten minutes would be wrong for everyone who wrote
    // nine minutes ago.
    assert.equal(result.retryAfterSec, 418);
  });

  it("502 says the relay is down, and the problem type says which relay", async () => {
    answer(() => json(problem(502, "mail-provider-unavailable"), { status: 502 }));

    const result = await apiPost("/api/contact", BODY);

    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.equal(result.status, 502);
    assert.equal(result.problem?.type, "https://timseil.dev/problems/mail-provider-unavailable");
    assert.equal(result.retryAfterSec, null);
  });

  it("no answer at all is status 0, not an exception", async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

    const result = await apiPost("/api/contact", BODY);

    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.equal(result.status, 0);
    assert.equal(result.problem, null);
  });
});

describe("a 202 that is not a receipt", () => {
  it("is a failure, because a receipt nobody can quote is worse than an admitted one", async () => {
    answer(() => new Response("accepted", { status: 202 }));

    const result = await apiPost("/api/contact", BODY);

    // The sender would otherwise be told their message arrived, on the page
    // whose whole argument is that it only says what it can show.
    assert.equal(result.kind, "fail");
  });
});

describe("Retry-After", () => {
  it("reads a delay", () => {
    assert.equal(retryAfterSeconds("600"), 600);
    assert.equal(retryAfterSeconds(" 42 "), 42);
  });

  it("reads a date, because a proxy may have rewritten the delay into one", () => {
    const seconds = retryAfterSeconds(new Date(Date.now() + 120_000).toUTCString());
    assert.ok(seconds !== null && seconds > 110 && seconds <= 121, `got ${String(seconds)}`);
  });

  it("says nothing rather than zero when it cannot tell", () => {
    // Zero is a promise that the next attempt will work. Absent is the truth.
    assert.equal(retryAfterSeconds(null), null);
    assert.equal(retryAfterSeconds(""), null);
    assert.equal(retryAfterSeconds("soon"), null);
    assert.equal(retryAfterSeconds(new Date(Date.now() - 60_000).toUTCString()), null);
  });
});

describe("the deadline", () => {
  it("is the eight seconds the build plan asks for", () => {
    // Sized against the api's own SMTP attempt, which is bounded at 7 s so that
    // this one does not abandon a request that was about to succeed.
    assert.equal(POST_TIMEOUT_MS, 8000);
  });

  it("gives up rather than hanging, and reports it as no answer", async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;

    const result = await apiPost("/api/contact", BODY, { timeoutMs: 20 });

    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.equal(result.status, 0);
  });
});
