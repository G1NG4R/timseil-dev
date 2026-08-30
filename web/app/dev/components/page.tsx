import { notFound } from "next/navigation";

import { SpecRail } from "@/components/case/SpecRail";
import { StateFlip } from "@/components/dev/StateFlip";
import { DegradedNotice } from "@/components/state/DegradedNotice";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorPanel } from "@/components/state/ErrorPanel";
import { LoadingLines } from "@/components/state/LoadingLines";
import { NoData } from "@/components/state/NoData";
import { StateWord, StatusDot } from "@/components/state/StatusDot";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MetricTile } from "@/components/ui/MetricTile";
import { SectionHead } from "@/components/ui/SectionHead";
import { PARTS, inventoryProgress, isBuilt, type Part } from "@/lib/gallery/registry";
import { DEV_GALLERY_ENV, galleryVisible } from "@/lib/gallery/visibility";
import { en } from "@/lib/i18n/messages/en";
import { retryLine } from "@/lib/state/retry";
import { MARKS, STATE_KEYS, stateLabel, type StateKey } from "@/lib/state/words";

// The gallery — every component this site has, in every state its sheet
// documents. Build plan G7, ADR 0049.
//
// NOT A PAGE OF THE SITE. It has no language, no entry in lib/seo/pages.ts, no
// line in the sitemap and no `Disallow` in robots.txt — a Disallow would
// publish the address that the 404 below already closes.

/**
 * The word each state renders with, in English.
 *
 * `getDictionary()` is not available out here: it reads the `lang` root
 * parameter and this route has none, deliberately (see app/dev/layout.tsx). The
 * English dictionary is imported directly instead, which is also the honest
 * thing for a workbench — the German and French overlays are empty until P6, so
 * a language switch here would show the same seven words three times.
 */
const LABELS = Object.fromEntries(
  STATE_KEYS.map((key) => [key, stateLabel(key, en)]),
) as Record<StateKey, string>;

export default function GalleryPage() {
  // THE GATE RUNS WHEN THE PAGE IS RENDERED, AND FOR THIS ROUTE THAT IS BUILD
  // TIME. It is a static route, so `next build` prerenders it once: without the
  // override the render calls notFound() and what ships is a prerendered 404,
  // rather than a page that is served and then declined per request.
  //
  // WHAT THAT DOES NOT MEAN, measured rather than assumed: the components are
  // still bundled. `grep -rl "Component gallery" .next/server` finds this file's
  // strings in an ssr chunk after a build without the flag — the module graph
  // reaches them, and only the RENDERED HTML is absent. The gate is a gate, not
  // dead-code elimination, and saying otherwise would be a claim about bytes
  // nobody looked at.
  //
  // Making it dynamic instead was tried and rejected in the same hour:
  // `connection()` under Cache Components needs a Suspense boundary above it,
  // and the shell that streams from one answers 200 before the gate has run.
  // A route whose first byte is 200 is not "nur in Development".
  //
  // So the acceptance build sets the variable — `DEV_GALLERY=1 npm run build` —
  // and the deployed image never does. docs/runbooks/web.md carries the recipe.

  // THE WHOLE OF "nur in Development", and it is one call rather than a build
  // configuration because there is no build configuration that removes a route.
  // lib/gallery/visibility.ts holds the decision and fails closed; this file
  // only obeys it. Measured with a request against a production build, not
  // asserted from here.
  if (!galleryVisible(process.env.NODE_ENV, process.env[DEV_GALLERY_ENV])) notFound();

  const { built, total } = inventoryProgress();

  return (
    <>
      <header className="gal-head">
        <h1 className="gal-title">Component gallery</h1>
        <p className="gal-sub">
          Every part, every documented state. Development only.
          <br />
          Handoff inventory (SYS.00.04.04): {built} of {total} built.
          {" "}The build plan says fifteen; the sheet has fourteen rows and sixteen
          names — two rows carry two components each. Counted, not quoted.
        </p>
      </header>

      {/* ── The state language ───────────────────────────────────────────────
          First, because everything below borrows from it. This is also the
          first time anyone sees `barred` and `dash`: /api/health cannot produce
          OFFLINE, and QUEUED has no caller yet. G6 built them and proved them
          with a unit test; this is the picture. */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">StatusDot</h2>
          <span className="gal-where">global · all eight keys of words.ts</span>
        </div>
        <div className="gal-grid">
          {STATE_KEYS.map((key) => (
            <div className="gal-case" key={key}>
              <span className="gal-case-label">
                {key} · {MARKS[key].dot ?? "no dot"}
                {MARKS[key].pulse ? " · pulse" : ""}
              </span>
              <StatusDot state={key} label={LABELS[key]} />
            </div>
          ))}
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">StateWord</h2>
          <span className="gal-where">a column that already names the state</span>
        </div>
        <div className="gal-grid">
          {STATE_KEYS.map((key) => (
            <div className="gal-case" key={key}>
              <span className="gal-case-label">{key}</span>
              <StateWord state={key} label={LABELS[key]} />
            </div>
          ))}
        </div>
      </section>

      {/* Issue #230: the burst has had its rule since G6 and no motion, because
          nothing could watch it. This is the trigger and the viewer. */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">Glitch burst</h2>
          <span className="gal-where">move M5 · one per change · 600ms lock</span>
        </div>
        <p className="gal-states">
          Flipping fires exactly one burst; a second flip inside 600ms fires none.
          Under prefers-reduced-motion the value simply stands.
        </p>
        <div className="gal-demo">
          <StateFlip labels={LABELS} />
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">NoData</h2>
          <span className="gal-where">inside a cell whose label says what is missing</span>
        </div>
        <div className="gal-demo">
          <NoData />
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">LoadingLines</h2>
          <span className="gal-where">no spinner · says what it fetches and from where</span>
        </div>
        <div className="gal-demo">
          <div className="gal-case">
            <span className="gal-case-label">two lines</span>
            <LoadingLines what="health" source="ops-api /api/health" />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">six lines of reserved height</span>
            <LoadingLines what="incidents" source="ops-api /api/incidents" lines={6} />
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">ErrorPanel</h2>
          <span className="gal-where">errors are logs · one alert moment per page</span>
        </div>
        <div className="gal-demo">
          <div className="gal-case">
            <span className="gal-case-label">nothing answered</span>
            <ErrorPanel source="ops-api" status={null} lastGoodAt="2026-08-29T18:12:44Z" />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">a status, and no older measurement</span>
            <ErrorPanel source="ops-api" status={503} statusText="Service Unavailable" />
          </div>
          <div className="gal-case">
            {/* The one honest caller retryLine() has until H8 builds a form
                that actually tries again. lib/state/retry.ts says so itself. */}
            <span className="gal-case-label">with a retry counter</span>
            <ErrorPanel
              heading="CONTACT"
              source="mail"
              status={429}
              statusText="Too Many Requests"
              lastGoodAt="2026-08-29T17:59:01Z"
              retry={retryLine(30, 2, 5)}
            />
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">EmptyState</h2>
          <span className="gal-where">say why it is empty, and offer a way back</span>
        </div>
        <div className="gal-demo">
          <div className="gal-case">
            <span className="gal-case-label">no filter to reset</span>
            <EmptyState heading="NO POSTS" reason="The log starts when the first system does." />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">with filters and a way back</span>
            <EmptyState
              heading="0 RESULTS"
              reason="rust is LEARNING, not APPLIED — no system runs it yet."
              filters={["rust", "live"]}
            >
              <Button variant="ghost" type="button">
                clear filters
              </Button>
            </EmptyState>
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">DegradedNotice</h2>
          <span className="gal-where">beside the content, never over it</span>
        </div>
        <div className="gal-demo">
          <div className="gal-case">
            <span className="gal-case-label">one reduction</span>
            <DegradedNotice label={LABELS.degraded} reduced={["metrics: hidden"]} />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">three, each one checkable</span>
            <DegradedNotice
              label={LABELS.degraded}
              reduced={["terminal: read-only", "graph: from cache, 6h old", "metrics: hidden"]}
            />
          </div>
        </div>
      </section>

      {/* ── The Foundations parts ───────────────────────────────────────────── */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">Button</h2>
          <span className="gal-where">three variants · hover changes colour and nothing else</span>
        </div>
        <div className="gal-demo">
          {(["primary", "secondary", "ghost"] as const).map((variant) => (
            <div className="gal-case" key={variant}>
              <span className="gal-case-label">{variant}</span>
              <Button variant={variant} type="button">
                send message
              </Button>
            </div>
          ))}
          <div className="gal-case">
            <span className="gal-case-label">disabled</span>
            <Button variant="primary" type="button" disabled>
              send message
            </Button>
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">MetricTile</h2>
          <span className="gal-where">solid border measured · dashed means there is none</span>
        </div>
        <div className="gal-grid">
          <div className="gal-case">
            <span className="gal-case-label">ok</span>
            <MetricTile label="p95" value="20.5" unit="ms" />
          </div>
          <div className="gal-case">
            {/* The one-character mistake this component is written against: a
                falsiness check would hide the best number the site can print. */}
            <span className="gal-case-label">zero is a value</span>
            <MetricTile label="error rate" value={0} unit="%" />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">real and bad</span>
            <MetricTile label="uptime" value="98.90" unit="%" warn />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">no data</span>
            <MetricTile label="deliverability" />
          </div>
          <div className="gal-case">
            {/* H1, issue #208: a percentage over 91 days reads the same whether
                eight of them were measured or all of them, so the coverage
                stands under the figure. Both states, because the empty one is
                the one that shipped first. */}
            <span className="gal-case-label">with its coverage</span>
            <MetricTile label="UPTIME · 91 D" value="100.00" unit="%" note="8 of 91 days measured" />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">no data, and none measured</span>
            <MetricTile label="UPTIME · 91 D" note="0 of 91 days measured" />
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">SpecRail</h2>
          <span className="gal-where">case study · sticky above 1080, static below</span>
        </div>
        <div className="gal-grid">
          <div className="gal-case">
            <span className="gal-case-label">public source</span>
            <SpecRail
              role="Design, backend, infrastructure — solo"
              stack="Next.js 16.3 · Go 1.26 · PostgreSQL 18.6"
              year="2026 — ongoing"
              state="live"
              hosting="self-hosted"
              source={{ access: "public", url: "https://github.com/G1NG4R/timseil-dev" }}
              messages={en}
            />
          </div>
          <div className="gal-case">
            {/* K-21: source is its own axis. A closed system owes a reason, and
                the schema refuses one without it. */}
            <span className="gal-case-label">closed, with a reason</span>
            <SpecRail
              role="Backend — contract work"
              stack="Python · FastAPI · Docker"
              year="2025"
              state="queued"
              hosting="client infrastructure"
              source={{ access: "private", reason: "nda" }}
              messages={en}
            />
          </div>
          <div className="gal-case">
            {/* The api did not answer. Everything the row would have carried is
                absent, and none of it falls back to a plausible value. */}
            <span className="gal-case-label">no answer from the api</span>
            <SpecRail
              role="Design, backend, infrastructure — solo"
              stack={null}
              year="2026 — ongoing"
              state={null}
              hosting="self-hosted"
              source={null}
              messages={en}
            />
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">Field</h2>
          <span className="gal-where">label above the field, always · error tied to it</span>
        </div>
        <div className="gal-demo">
          <div className="gal-case">
            <span className="gal-case-label">rest, with a hint</span>
            <Field name="gal-email" label="Email" hint="required" />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">filled</span>
            <Field name="gal-filled" label="Email" defaultValue="tim@example.org" value="tim@example.org" readOnly />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">error, with the reason</span>
            <Field name="gal-error" label="Email" error="No @ in that address." />
          </div>
          <div className="gal-case">
            <span className="gal-case-label">multiline, with a counter</span>
            <Field name="gal-message" label="Message" counter="0/2000" multiline rows={3} />
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">SectionHead</h2>
          <span className="gal-where">SYS.NN · title · optional meta</span>
        </div>
        <div className="gal-demo" style={{ display: "block" }}>
          <SectionHead id="SYS.01" title="Training log" meta="22 tracks" />
          <SectionHead id="SYS.02" title="Systems" />
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">ThemeSwitch</h2>
          <span className="gal-where">footer, all pages · seven palettes</span>
        </div>
        <p className="gal-states">
          Every state above is drawn again in each palette. Word, fill and pulse
          must not move — the colour is the third feature, not the first.
        </p>
        <div className="gal-demo">
          <ThemeSwitch label={en.themeLabel} aria={en.themeAria} />
        </div>
      </section>

      {/* ── What is not built ────────────────────────────────────────────────
          The inventory, minus what stands above. Each one names the phase that
          owes it, because a dead cell without a reason is a bug — the gallery
          owes its own rows the answer it demands of every component in it. */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">Not built yet</h2>
          <span className="gal-where">{total - built} of {total} in the inventory</span>
        </div>
        {PARTS.filter((part) => !part.preview).map((part) => (
          <Row key={part.id} part={part} />
        ))}
      </section>

      <p className="gal-foot">
        The parts above are the whole of what this site can draw today. Nothing
        here is a mock: every one of them is the component a page will import.
      </p>
    </>
  );
}

/** One line for a part with no live example, and the reason it has none. */
function Row({ part }: { part: Part }) {
  return (
    <div className="gal-part-head">
      <span className="gal-name">{part.id}</span>
      <span className="gal-where">{part.where}</span>
      <p className="gal-states">{part.states.join(" · ")}</p>
      <p className="gal-absent">
        {isBuilt(part) ? (
          part.note
        ) : (
          <StatusDot state="queued" label={`${LABELS.queued} · ${part.owedBy ?? ""}`} />
        )}
      </p>
    </div>
  );
}
