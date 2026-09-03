/**
 * `/contact` at every checked width, and the five answers driven rather than
 * read.
 *
 * THE RIG HAS NO API, AND FOR THIS PAGE THAT IS AN ADVANTAGE. Every other page
 * of stage H reads an endpoint, so a rig without one measures an outage panel.
 * This page reads nothing — the form ASKS, and only after somebody presses a
 * button — so the answers can be supplied one at a time, exactly, and each one
 * checked on its own. Nothing here is a guess about what the api sends: the
 * five bodies below were taken off the real handler on 2026-09-03, driven with
 * curl against `compose.dev.yaml`, and pasted in.
 *
 * WHY THAT MATTERS MORE THAN USUAL. Two of the five are indistinguishable from
 * success on purpose (ADR 0021 §2, the honeypot and the dwell floor), and two
 * of them are the same status with different meanings — a `400` carries fields
 * when a field is wrong and carries none when an Origin is refused. A test that
 * invented its own fixtures would agree with itself and with nothing else.
 *
 * ISSUE #189 IS WHY THE REQUEST IS INTERCEPTED RATHER THAN MADE. The dev stack
 * has no edge serving `/` and `/api/*` under one address, so a browser here
 * cannot reach the api the way a browser in production does. The end-to-end
 * that closes that gap is the acceptance against production, which the runbook
 * already prescribes; what this file owns is everything the page does with an
 * answer once it has one.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { CONTACT } from "./widths";

/** The width this project is running at. home.spec.ts's idiom, unchanged. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

/** A message that clears every floor, so a test that is about something else
 *  is not also a test about the length of a message. */
const GOOD = {
  name: "Anna Keller",
  email: "anna.keller@firma.lu",
  message: "Hi Tim, do you have thirty minutes next week to talk about a pipeline?",
};

/** Answers, as the handler actually sends them. Taken off the running api. */
const ANSWERS = {
  accepted: {
    status: 202,
    body: { id: "msg_01M1MC99PFBQMRBJ", ok: true },
  },
  invalid: {
    status: 400,
    body: {
      type: "https://timseil.dev/problems/validation-failed",
      title: "Validation failed",
      status: 400,
      detail: "The submission did not validate.",
      instance: "/api/contact",
      requestId: "bb23cdfafdd398196e4dcc24a0500fea",
      invalidParams: [
        { name: "name", reason: "at least 2 characters" },
        { name: "email", reason: "not a plain mail address" },
      ],
    },
  },
  // The same status and the same problem type, with no fields — a refused
  // Origin. api/internal/contact/contact.go: "No invalidParams: ADR 0009 says
  // that array is one entry per rejected *field*, and an Origin is not one."
  refused: {
    status: 400,
    body: {
      type: "https://timseil.dev/problems/validation-failed",
      title: "Validation failed",
      status: 400,
      detail: "This endpoint does not accept submissions from that origin.",
      instance: "/api/contact",
      requestId: "4234bafb21100466db6d7f2aa8ad8b87",
    },
  },
  throttled: {
    status: 429,
    headers: { "retry-after": "200" },
    body: {
      type: "https://timseil.dev/problems/rate-limited",
      title: "Too many requests",
      status: 429,
      detail: "Slow down and try again in 200 seconds.",
      instance: "/api/contact",
      requestId: "93742adc67274a937fe92afff863825f",
    },
  },
  relayDown: {
    status: 502,
    body: {
      type: "https://timseil.dev/problems/mail-provider-unavailable",
      title: "Mail provider unavailable",
      status: 502,
      detail:
        "Your message was stored and will be delivered as soon as the provider answers. Nothing was lost.",
      instance: "/api/contact",
    },
  },
} as const;

type AnswerName = keyof typeof ANSWERS;

/** Serve one answer, and keep every request that was made. */
async function answerWith(page: Page, name: AnswerName): Promise<{ bodies: unknown[] }> {
  const answer = ANSWERS[name];
  const bodies: unknown[] = [];

  await page.route("**/api/contact", async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: answer.status,
      headers: { "content-type": "application/json", ...("headers" in answer ? answer.headers : {}) },
      body: JSON.stringify(answer.body),
    });
  });

  return { bodies };
}

/** Fill the form the way a person does, so the dwell clock starts. */
async function fill(page: Page, draft: Partial<typeof GOOD> = {}) {
  const values = { ...GOOD, ...draft };
  await page.fill("#name", values.name);
  await page.fill("#email", values.email);
  await page.fill("#message", values.message);
}

async function send(page: Page) {
  await page.click('.cf-form button[type="submit"]');
}

test.beforeEach(async ({ page }) => {
  // No `settled`: this page has no streamed region, for the same reason
  // about.spec.ts says so — it reads no endpoint.
  await page.goto(CONTACT);
});

/* ── The document ──────────────────────────────────────────────────────── */

test("the page has exactly one h1", async ({ page }) => {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Open a channel.");
});

test("the section is named by the title already on the screen", async ({ page }) => {
  const section = page.locator("section.contact");
  const id = await section.getAttribute("aria-labelledby");
  expect(id).not.toBeNull();
  await expect(page.locator(`#${String(id)}`)).toHaveCount(1);
});

test("the address is on the page before anything is typed", async ({ page }) => {
  // For a visitor without JavaScript this is not an alternative, it is the
  // page. It is server-rendered markup, so it is here at every width.
  //
  // SCOPED TO THE PAGE AND NOT `.first()`, because the address appears three
  // more times in the chrome — FooterLead, MobileMenu and, at every width, a
  // hidden `.menu-mail` that comes FIRST in document order. `.first()` resolved
  // to that one and the test failed against a copy it was not about. The
  // duplication is real and is noted in lib/site.ts; this locator names the one
  // this page owns.
  const address = page.locator(".contact-lede a.contact-address");
  await expect(address).toBeVisible();
  await expect(address).toHaveAttribute("href", "mailto:contact@timseil.dev");
});

test("what the page stores is said before it stores it", async ({ page }) => {
  // `/privacy` is a stub until H12, so this sentence is the only place a
  // visitor can learn what happens to what they type.
  await expect(page.locator(".contact-notice")).toContainText("hashed form of your IP address");
});

test("the headline sets on one line, which is what the 16ch cap is for", async ({ page }) => {
  // THE ASSERTION THE ORACLE CANNOT MAKE. The sheet caps this headline at
  // `16ch`, and a `ch` resolves to different pixels depending on which font
  // loaded — 529.152 against 512 between a real browser and this rig. So the
  // number is not pinnable and the requirement is: "Open a channel." is the
  // shortest headline on this site and it does not break.
  const lines = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (h1 === null) throw new Error("no h1");
    const style = getComputedStyle(h1);
    const lineHeight = Number.parseFloat(style.lineHeight);
    return Math.round(h1.getBoundingClientRect().height / lineHeight);
  });
  expect(lines).toBe(1);
});

test("the lede stays inside a reading measure", async ({ page }) => {
  // The other cap the oracle cannot hold. 56ch is one spelling of "this is a
  // paragraph, not a banner"; what is checkable is that it is narrower than the
  // column it sits in at the widths where the column is wide.
  const { lede, column } = await page.evaluate(() => ({
    lede: document.querySelector(".contact-lede")?.getBoundingClientRect().width ?? 0,
    column: document.querySelector("main")?.getBoundingClientRect().width ?? 0,
  }));
  if (widthOf(page) >= 1080) expect(lede).toBeLessThan(column);
  expect(lede).toBeGreaterThan(0);
});

test("nothing overflows sideways", async ({ page }) => {
  // The TX trace scrolls inside its own box on purpose; the page must not.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

/* ── The honeypot ──────────────────────────────────────────────────────── */

test("the honeypot is hidden by position, never by display", async ({ page }) => {
  // The sheet says it twice and the handbook explains it: a bot parses the
  // stylesheet, and a field it can tell is hidden is a field it leaves alone.
  const label = page.locator('.cf-hp label[for="company"]');
  await expect(label).toHaveCount(1);

  const drawn = await page.evaluate(() => {
    const box = document.querySelector(".cf-hp");
    const lbl = document.querySelector(".cf-hp label");
    const input = document.querySelector<HTMLInputElement>("#company");
    if (box === null || lbl === null || input === null) throw new Error("no honeypot");
    return {
      labelDisplay: getComputedStyle(lbl).display,
      labelVisibility: getComputedStyle(lbl).visibility,
      inputDisplay: getComputedStyle(input).display,
      left: box.getBoundingClientRect().left,
      ariaHidden: box.getAttribute("aria-hidden"),
      tabIndex: input.tabIndex,
    };
  });

  expect(drawn.labelDisplay).not.toBe("none");
  expect(drawn.labelVisibility).not.toBe("hidden");
  expect(drawn.inputDisplay).not.toBe("none");
  // Off the canvas rather than clipped: some form fillers check that a box is
  // still laid out where it was.
  expect(drawn.left).toBeLessThan(-1000);
  // The half that keeps this from harming a person instead of a script: a
  // screen reader must not walk into it and be discarded as a bot.
  expect(drawn.ariaHidden).toBe("true");
  expect(drawn.tabIndex).toBe(-1);
});

test("the honeypot travels, and it travels empty", async ({ page }) => {
  const seen = await answerWith(page, "accepted");
  await fill(page);
  await send(page);
  await expect(page.locator(".cf-status")).toHaveAttribute("data-phase", "accepted");

  const sent = seen.bodies[0] as { company: string };
  // Sent, not omitted — a form that hardcoded the empty string would catch
  // nothing, because the only submitter it could catch is one that filled it.
  expect(sent).toHaveProperty("company");
  expect(sent.company).toBe("");
});

/* ── What is sent ──────────────────────────────────────────────────────── */

test("the dwell floor is waited out rather than reported short", async ({ page }) => {
  const seen = await answerWith(page, "accepted");
  await fill(page);
  await send(page);
  await expect(page.locator(".cf-status")).toHaveAttribute("data-phase", "accepted");

  const sent = seen.bodies[0] as { dwellMs: number; ts: string };
  // ADR 0021 §2 discards anything under 3000 with a receipt that leads
  // nowhere. Filling three fields takes a Playwright run well under that, so
  // this assertion is only true because the form waits.
  expect(sent.dwellMs).toBeGreaterThanOrEqual(3000);
  // And it is a real reading, not the floor written out: a form that clamped
  // would make every early send look legal.
  expect(Number.isInteger(sent.dwellMs)).toBe(true);
  expect(Date.parse(sent.ts)).toBeGreaterThan(0);
});

test("the trace draws the request that is sent, field for field", async ({ page }) => {
  const seen = await answerWith(page, "accepted");
  await fill(page);

  const drawn = await page.locator(".tx-body").innerText();
  expect(drawn).toContain('"name": "Anna Keller"');
  expect(drawn).toContain('"email": "anna.keller@firma.lu"');
  expect(drawn).toContain('"company": ""');
  // The version is NOT drawn: the trace is written before the request leaves,
  // and nothing on the page knows what will be negotiated.
  expect(drawn).not.toContain("HTTP/");

  await send(page);
  await expect(page.locator(".cf-status")).toHaveAttribute("data-phase", "accepted");
  const sent = seen.bodies[0] as { name: string; email: string };
  expect(sent.name).toBe("Anna Keller");
  expect(sent.email).toBe("anna.keller@firma.lu");
});

/* ── The five answers ──────────────────────────────────────────────────── */

test("nothing is sent when the page can already see the mistake", async ({ page }) => {
  const seen = await answerWith(page, "accepted");
  await fill(page, { email: "anna.keller@firma" });
  await send(page);

  // The whole point of the client mirror: a round trip here would spend one of
  // three attempts in ten minutes to be told what the page already knew.
  expect(seen.bodies).toHaveLength(0);
  await expect(page.locator(".cf-status")).toHaveAttribute("data-phase", "invalid");
  await expect(page.locator("#email-error")).toHaveText("▸ not a plain mail address");
  // And the status line is not silent, which it was until this was driven.
  await expect(page.locator(".cf-status")).toContainText("Nothing was sent");
});

test("focus lands on the first wrong field, without sorting anything", async ({ page }) => {
  await answerWith(page, "accepted");
  await fill(page, { name: "T", email: "anna.keller@firma" });
  await send(page);

  // validate.go:53-55 promises the order, lib/contact/fields.ts keeps it, and
  // this is where the promise is cashed.
  await expect(page.locator("#name")).toBeFocused();
});

test("a 202 is a receipt, and the text stays in the field", async ({ page }) => {
  await answerWith(page, "accepted");
  await fill(page);
  await send(page);

  await expect(page.locator(".cf-status")).toHaveAttribute("data-phase", "accepted");
  await expect(page.locator(".cf-receipt")).toHaveText("msg_01M1MC99PFBQMRBJ");
  // The deliberate break with convention. The handbook: "die ID ist der Beleg,
  // den der Absender zitieren kann, und der Text geht nicht verloren".
  await expect(page.locator("#message")).toHaveValue(GOOD.message);
  await expect(page.locator("#name")).toHaveValue(GOOD.name);
  // And it never claims delivery — the dispatcher may still be carrying it.
  await expect(page.locator(".cf-status")).not.toContainText("delivered");
});

test("a 400 with fields marks the fields", async ({ page }) => {
  await answerWith(page, "invalid");
  await fill(page);
  await send(page);

  await expect(page.locator("#name-error")).toHaveText("▸ at least 2 characters");
  await expect(page.locator("#email-error")).toHaveText("▸ not a plain mail address");
  await expect(page.locator("#name")).toBeFocused();
});

test("a 400 with no fields does not send anybody hunting for one", async ({ page }) => {
  await answerWith(page, "refused");
  await fill(page);
  await send(page);

  // The same status and the same problem type as the test above, and a
  // different sentence — because no field is wrong and none is marked.
  await expect(page.locator(".field-error")).toHaveCount(0);
  await expect(page.locator(".cf-status")).toContainText("none of the fields is at fault");
});

test("a 429 prints the wait the api measured", async ({ page }) => {
  await answerWith(page, "throttled");
  await fill(page);
  await send(page);

  // 200 seconds, from `Retry-After`, and not a flat ten minutes. ADR 0021 §3
  // derives it from min(received_at) precisely so it is a measurement.
  await expect(page.locator(".cf-status")).toContainText("Try again in 4 min");
  await expect(page.locator("#message")).toHaveValue(GOOD.message);
});

test("a 502 says stored, not lost, and not delivered either", async ({ page }) => {
  await answerWith(page, "relayDown");
  await fill(page);
  await send(page);

  // ADR 0021's own "Was das kostet": the sender reads this and the dispatcher
  // may deliver ten minutes later, so the sentence has to survive both.
  await expect(page.locator(".cf-status")).toContainText("stored");
  await expect(page.locator(".cf-status")).not.toContainText("delivered");
  await expect(page.locator("#message")).toHaveValue(GOOD.message);
});

test("no answer at all admits it does not know, and names no cause", async ({ page }) => {
  await page.route("**/api/contact", (route) => route.abort("connectionrefused"));
  await fill(page);
  await send(page);

  // The one failure where neither side can say whether anything arrived. The
  // page says so rather than guessing in either direction.
  await expect(page.locator(".cf-status")).toContainText("cannot tell");
  await expect(page.locator(".cf-status")).toContainText("address below");
  // AND IT DOES NOT NAME A TIMEOUT. A refused connection fails in a
  // millisecond; an earlier draft called it "No answer within eight seconds",
  // which is a claim about which failure it was.
  await expect(page.locator(".cf-status")).not.toContainText("eight seconds");
});

test("a status nobody expected is printed rather than described", async ({ page }) => {
  // Something between the browser and the api answered instead of the api — a
  // proxy, a maintenance page, an edge that is not ours. The page does not know
  // what it was, so it quotes the number: a visitor who sends me that has told
  // me more than any sentence written in advance could.
  await page.route("**/api/contact", (route) =>
    route.fulfill({ status: 503, headers: { "content-type": "text/html" }, body: "<h1>maintenance</h1>" }),
  );
  await fill(page);
  await send(page);

  await expect(page.locator(".cf-status")).toContainText("503");
  await expect(page.locator(".cf-status")).toContainText("cannot tell");
});

/* ── Without JavaScript ────────────────────────────────────────────────── */

test.describe("with JavaScript turned off", () => {
  test.use({ javaScriptEnabled: false });

  test("there is no form pretending to work, and the address is there", async ({ page }) => {
    await page.goto(CONTACT);

    // The gap, stated rather than hidden. ADR 0066 got `/about`'s one control
    // down to zero bytes with a radio group; a request that has to carry a
    // duration and a clock reading has no such trick.
    await expect(page.locator("h1")).toHaveText("Open a channel.");
    await expect(page.locator(".contact-lede a.contact-address")).toBeVisible();
    await expect(page.locator(".contact-notice")).toBeVisible();
    // The trace says it is waiting rather than drawing a request with a zeroed
    // clock — there is no send moment on a page nothing is running on.
    await expect(page.locator(".tx-body")).toContainText("waiting for input");
    await expect(page.locator(".tx-bytes")).toHaveText("—");
  });
});

/* ── Geometry ──────────────────────────────────────────────────────────── */

test("the trace stands beside the form above 1080 and under it below", async ({ page }) => {
  const wide = widthOf(page) >= 1080;
  const columns = await page.evaluate(() => {
    const cf = document.querySelector(".cf");
    if (cf === null) throw new Error("no form");
    return getComputedStyle(cf).gridTemplateColumns.split(" ").length;
  });
  expect(columns).toBe(wide ? 2 : 1);
});
