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
  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "accepted");

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
  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "accepted");

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
  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "accepted");
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
  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "rejected");
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

  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "accepted");
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
  // derives it from min(received_at) precisely so it is a measurement. In
  // SECONDS, which is the State Language sheet's form of this line and what
  // `waitLine` produces — the Contact sheet writes the same line the other way
  // round and says one line above that it inherits the language from that one.
  await expect(page.locator(".cf-status")).toContainText(/retry in (200|199)s/);
  await expect(page.locator("#message")).toHaveValue(GOOD.message);
});

test("the wait is held rather than described, and the button comes back", async ({ page }) => {
  // #231 asked for something on the page that actually waits. This is it: the
  // api's measured seconds run down, the button is locked while they do, and it
  // is released by the same second that removes the line. A button left live
  // through a 429 invites the visitor to spend a request discovering what this
  // page has already been told.
  await page.route("**/api/contact", async (route) => {
    await route.fulfill({
      status: 429,
      // Two seconds, so the test watches the whole thing rather than sampling
      // it. The value is the api's either way — this one is just short.
      headers: { "content-type": "application/json", "retry-after": "2" },
      body: JSON.stringify({
        type: "https://timseil.dev/problems/rate-limited",
        title: "Too many requests",
        status: 429,
        instance: "/api/contact",
      }),
    });
  });

  await fill(page);
  await send(page);

  const button = page.locator('.cf-form button[type="submit"]');
  await expect(button).toBeDisabled();
  await expect(page.locator(".tx-log li[data-dir='cont']").first()).toContainText(/retry in \ds/);

  // And it lets go on its own, with nothing pressed.
  await expect(button).toBeEnabled({ timeout: 5000 });
  await expect(page.locator(".tx-log")).not.toContainText("retry in");
});

test("no counter stands beside the wait, because the page cannot see one", async ({ page }) => {
  // Two limiters answer this route with a 429 — the token bucket in front of
  // every /api/* route and the contact floor of three per ten minutes — and
  // both write it through httpx.WriteRateLimitProblem, so the documents carry
  // the same type and the same title. `2/3` here would be naming which of the
  // two refused the request, and nothing in the answer says.
  await answerWith(page, "throttled");
  await fill(page);
  await send(page);

  await expect(page.locator(".tx-log")).toContainText("retry in");
  await expect(page.locator(".tx-log")).not.toContainText("/3");
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

/* ── The six states, and the log that may not claim a verdict ───────────── */

test("every state says its word, and the word is not the colour", async ({ page }) => {
  // ADR 0048's rule, on the page this site says it hardest: the panel carries a
  // word and a fill, and the fill says which kind of answer produced the state.
  const badge = page.locator(".tx-state");
  const dot = page.locator(".tx-head .st-dot");

  await expect(badge).toHaveText("REST");
  await expect(dot).toHaveAttribute("data-dot", "dash");

  await fill(page);
  await expect(badge).toHaveText("COMPOSING");
  // The pair ADR 0063 settled once already: same tone, same fill, told apart by
  // the word alone.
  await expect(dot).toHaveAttribute("data-dot", "dash");

  await answerWith(page, "accepted");
  await send(page);
  await expect(badge).toHaveText("ACCEPTED");
  await expect(dot).toHaveAttribute("data-dot", "solid");
});

test("a 400 that names no field is the alert moment, and one that does is not", async ({ page }) => {
  // The two answers that share a status code. With fields the visitor has a
  // typo and `.field-error` already carries the red; without fields the Origin
  // was refused, nobody typed anything wrong, and this page owes its one alert
  // moment to that.
  await answerWith(page, "refused");
  await fill(page);
  await send(page);

  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "failed");
  await expect(page.locator(".tx-state")).toHaveText("FAILED");

  await page.reload();
  await answerWith(page, "invalid");
  await fill(page);
  await send(page);

  await expect(page.locator(".cf-status")).toHaveAttribute("data-state", "rejected");
  await expect(page.locator(".tx-state")).toHaveText("REJECTED");
});

test("the log prints what this page measured and claims no verdict", async ({ page }) => {
  const seen = await answerWith(page, "accepted");
  await fill(page);
  await send(page);

  const log = page.locator(".tx-log");

  // The honeypot and the dwell, which are the two things ADR 0021 §2 discards a
  // submission for — and NOT "spam checks ok", which is the api's answer.
  await expect(log).toContainText(/honeypot empty · dwell \d+ms/);

  // AND IT IS THE DWELL THAT LEFT, not the one the trace was holding. The body
  // above is the state of the last keystroke by design; the log is a record of
  // the departure, and the two are different numbers whenever somebody types
  // faster than the floor. Filling three fields in one burst and reading `dwell
  // 7ms` under a request that carried 3000 is how the difference was found.
  const logged = Number(/dwell (\d+)ms/.exec(await log.innerText())?.[1]);
  const carried = (seen.bodies[0] as { dwellMs: number }).dwellMs;
  expect(logged).toBe(carried);
  expect(logged).toBeGreaterThanOrEqual(3000);

  // AND THE DRAWING AGREES WITH BOTH. The panel's claim is that it IS the
  // request, and the one field where it was not could only be seen once the log
  // stood under it: `"dwellMs": 6` in the body against `dwell 7255ms` in the
  // log, two lines apart, the same field.
  const drawn = Number(/"dwellMs": (\d+)/.exec(await page.locator(".tx-body").innerText())?.[1]);
  expect(drawn).toBe(carried);
  await expect(log).not.toContainText("spam");
  // The page never sees a provider. It posts to an address.
  await expect(log).not.toContainText("provider");
  await expect(log).toContainText("POST /api/contact");
  await expect(log).not.toContainText("kopie");
});

test("the duration is on the page, and it is what proves a real send", async ({ page }) => {
  // ADR 0021 §2 answers a filled honeypot and a short dwell with the same
  // well-formed 202 a real send gets, so the status cannot tell them apart. The
  // round trip can, and the H8a acceptance had to measure it by hand.
  await answerWith(page, "accepted");
  await fill(page);
  await send(page);

  const answer = page.locator(".tx-log li[data-dir='in']");
  await expect(answer).toContainText(/^202 accepted · \d+ms$/);
  await expect(answer).not.toContainText("delivered");

  // The receipt and the second it arrived, on the continuation line.
  await expect(page.locator(".tx-log li[data-dir='cont']")).toContainText(
    /msg_[A-Z0-9]+ · \d{2}:\d{2}:\d{2} UTC/,
  );
});

test("the fields are locked and not greyed out while sending", async ({ page }) => {
  // "felder gesperrt, nicht ausgegraut", and until H8b nothing drew it — the
  // form set readOnly and no stylesheet had a rule for it. `disabled` is the
  // wrong tool for a second reason: a disabled input cannot take focus, which
  // is what silently broke the jump to the first wrong field.
  // The route is held open so the sending state can be looked at, rather than
  // raced against a fulfil that returns immediately.
  const gate: { open?: () => void } = {};
  const held = new Promise<void>((resolve) => {
    gate.open = resolve;
  });

  await page.route("**/api/contact", async (route) => {
    await held;
    await route.fulfill({
      status: 202,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "msg_01M1MC99PFBQMRBJ" }),
    });
  });

  await fill(page);
  await send(page);

  const message = page.locator("#message");
  await expect(message).toHaveAttribute("readonly", "");
  await expect(message).not.toBeDisabled();
  // The text is still the visitor's, and it still reads like text.
  await expect(message).toHaveValue(GOOD.message);

  gate.open?.();
  await expect(page.locator(".cf-receipt")).toBeVisible();
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

test("below 720 the trace is a status line, and above it a drawn request", async ({ page }) => {
  // Artboard `1c`: "Mobile · 390 — TX-Spur wird eine Statuszeile". Both sides
  // of the switch, at every checked width, because a switch asserted from one
  // side is a switch nobody has seen move.
  const phone = widthOf(page) < 720;

  await answerWith(page, "accepted");
  await fill(page);
  await send(page);
  await expect(page.locator(".cf-receipt")).toBeVisible();

  const body = page.locator(".tx-body");
  const log = page.locator(".tx-log");

  // The log is on every width. It is the whole of the panel on a phone.
  await expect(log).toBeVisible();
  await expect(log.locator("li[data-dir='in']")).toContainText("202 accepted");

  if (phone) {
    // The JSON goes, and so do the two readouts that describe it. What stays is
    // a dot, a word, and the answer.
    await expect(body).toBeHidden();
    await expect(page.locator(".tx-bytes")).toBeHidden();
    await expect(page.locator(".tx-name")).toBeHidden();
    await expect(page.locator(".tx-state")).toHaveText("ACCEPTED");
    await expect(page.locator(".tx-head .st-dot")).toBeVisible();

    // The steps this page took are its own; the phone shows what came back.
    // They are still IN the document, because hiding is a width's business and
    // the log is one list at every width.
    await expect(log.locator("li[data-dir='out']")).toHaveCount(2);
    return;
  }

  await expect(body).toBeVisible();
  await expect(body).toContainText("POST /api/contact");
  await expect(page.locator(".tx-bytes")).toContainText("B");
});

test("the resting panel does not stand on a phone with nothing to say", async ({ page }) => {
  // An empty bordered box under the button would be a component announcing
  // that it has nothing to say. Above the switch the panel is the drawn
  // request and is on the page from the first paint.
  const panel = page.locator(".tx");

  if (widthOf(page) < 720) {
    await expect(panel).toBeHidden();
    return;
  }

  await expect(panel).toBeVisible();
  await expect(page.locator(".tx-body")).toContainText("waiting for input");
});
