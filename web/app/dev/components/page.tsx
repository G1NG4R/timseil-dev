import { notFound } from "next/navigation";

import { IncidentLog } from "@/components/case/IncidentLog";
import { OpsGrid } from "@/components/case/OpsGrid";
import { SpecRail } from "@/components/case/SpecRail";
import { ModuleCard } from "@/components/home/ModuleCard";
import { StateFlip } from "@/components/dev/StateFlip";
import { DegradedNotice } from "@/components/state/DegradedNotice";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorPanel } from "@/components/state/ErrorPanel";
import { LoadingLines } from "@/components/state/LoadingLines";
import { NoData } from "@/components/state/NoData";
import { StateWord, StatusDot } from "@/components/state/StatusDot";
import { FooterLead } from "@/components/FooterLead";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MetricTile } from "@/components/ui/MetricTile";
import { SectionHead } from "@/components/ui/SectionHead";
import type { Incident, OpsCell } from "@/lib/api/systems";
import { modules, type ModuleView } from "@/lib/api/training";
import { PARTS, inventoryProgress, isBuilt, type Part } from "@/lib/gallery/registry";
import { DEV_GALLERY_ENV, galleryVisible } from "@/lib/gallery/visibility";
import { en } from "@/lib/i18n/messages/en";
import { retryLine } from "@/lib/state/retry";
import { MARKS, STATE_KEYS, stateLabel, type StateKey } from "@/lib/state/words";

/**
 * A window with all four kinds of day in it, and an incident to reach.
 *
 * THE ONLY PLACE THREE OF THESE STATES EXIST. Production answers `incidents: []`
 * and a window that is mostly `nodata`, so `degraded`, `outage` and the notch
 * that opens one have never rendered outside a unit test. The registry has asked
 * for all five since G7; this is where they are shown.
 *
 * AND THE FIFTH ONE IS NOT DRAWN, IT IS OPERATED. `selected` is `:target`, so
 * the notch below is a working link into the incident under it — clicking it in
 * this gallery produces the real state rather than a picture of it. That is the
 * whole argument for the anchor, standing in the one place it can be tried.
 */
const GALLERY_DAYS: OpsCell[] = Array.from({ length: 91 }, (_, i): OpsCell => {
  const date = new Date(Date.UTC(2026, 5, 2) + i * 86_400_000).toISOString().slice(0, 10);
  if (i === 84) return { date, state: "outage", downSec: 2520, incidentId: "INC-001" };
  if (i === 87) return { date, state: "degraded", downSec: 1080, incidentId: "INC-002" };
  return { date, state: i < 78 ? "nodata" : "ok", downSec: 0, incidentId: null };
});

/**
 * Two module cards: the four states the contract declares, and the one it does
 * not.
 *
 * BUILT THROUGH `modules()` RATHER THAN AS LITERALS, which is the difference
 * between a gallery and a picture of one. The shape below is what the api
 * actually sends — `state` as a lowercase word, `evidence` as an array, `note`
 * only where the array is empty — so what this page renders went through the
 * same reader the homepage uses. Hand-written `ModuleView`s would keep looking
 * right on the day that reader stopped producing them.
 *
 * `mastered` IS NOT A TYPO. ADR 0035's overlapping start lets a container talk
 * to a contract one deploy newer than itself, and a fifth state word is what
 * that looks like from here. Production cannot produce this row; that is
 * precisely why it is in a gallery.
 *
 * The two systems in the `core` row are not this site's — `core` needs two live
 * systems and there is one. The row draws a rule, and it says so by naming
 * systems that do not exist yet rather than by inventing evidence for this one.
 *
 * THE SECOND CARD IS EMPTY ON PURPOSE. ADR 0018 keeps a module with no tracks
 * in the answer, because "das Modul ist leer" is a different statement from
 * "das Modul gibt es nicht" — and a card that has nothing in it is a state
 * somebody has to have looked at once.
 */
const GALLERY_MODULES: readonly ModuleView[] = modules({
  modules: [
    {
      no: "01",
      title: "Languages",
      tracks: [
        {
          name: "Go",
          state: "core",
          evidence: [
            { systemNo: "02", systemId: "relay", detail: "api" },
            { systemNo: "04", systemId: "timseil-dev", detail: "api, health endpoint" },
          ],
        },
        {
          name: "CI/CD (GitHub Actions)",
          state: "applied",
          evidence: [{ systemNo: "02", systemId: "timseil-dev", detail: "build + deploy" }],
        },
        {
          name: "Kubernetes",
          state: "learning",
          evidence: [{ systemNo: "05", systemId: "foundry", detail: "k3s on the vps" }],
        },
        { name: "Pub/sub (RabbitMQ)", state: "queued", evidence: [], note: "self-study" },
        { name: "Rust", state: "mastered", evidence: [] },
      ],
    },
    { no: "02", title: "Backend", tracks: [] },
  ],
} as never);

const GALLERY_INCIDENT: Incident[] = [
  {
    id: "INC-001",
    startedAt: "2026-08-25T02:14:00Z",
    durationSec: 2520,
    cause: "postgres hit its memory limit while a migration held a lock",
    fix: "limit raised, migration split into two steps, lock timeout set",
    postSlug: "011-the-migration-that-locked-the-table",
  },
  // TWO, NOT ONE, AND A TEST NEEDED THE SECOND. `selected` is a difference
  // rather than an appearance — the first `:target` rule was invisible beside an
  // untargeted entry and a screenshot is what caught it — so the gallery has to
  // show a targeted entry next to one that is not.
  {
    id: "INC-002",
    startedAt: "2026-08-28T03:02:00Z",
    durationSec: 1080,
    cause: "certificate renewal raced a container restart and the proxy served a stale chain",
    fix: "renewal moved into a fixed window, the restart waits for the store",
    postSlug: "012-acme-json-and-the-three-am-restart",
  },
];

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
          <h2 className="gal-name">CTA E-Mail</h2>
          <span className="gal-where">footer, long version · homepage, about</span>
        </div>
        <p className="gal-states">
          Three of its four states are things a pointer does, so they are not
          drawn here — they are reachable. Hover it for the glow, tab to it for
          the ring globals.css gives every focusable element, hold it for the
          pressed colour. The block is the real component, not a copy of its
          markup: a second `.foot-mail` in this file would be the thing that
          drifts.
        </p>
        <div className="gal-demo">
          <FooterLead channel={en.channel} respond={en.respond} />
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

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">OperationGrid</h2>
          <span className="gal-where">case study `.04` · 91 days · notches are links</span>
        </div>
        <p className="gal-states">
          Four kinds of day and the fifth state that is not a kind of day:
          clicking the red cell targets the incident under it, which is what
          `selected` is. No JavaScript is involved — components/case/OpsGrid.tsx
          says why not.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <OpsGrid
            grid={{ cells: GALLERY_DAYS, weeks: 13 }}
            label="Operation grid, gallery sample"
            messages={en}
          />
          <IncidentLog incidents={GALLERY_INCIDENT} messages={en} />
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">SkillRow</h2>
          <span className="gal-where">homepage `SYS.01` · the state is derived, never typed</span>
        </div>
        <p className="gal-states">
          Five rows for four states, because the fifth is the one production
          cannot make: a word from a contract newer than this container. Two of
          the four cannot be reached either — `core` needs two live systems and
          `learning` needs one in build, and this site has one system, live. They
          are drawn here because the contract declares them, which is the whole
          use of a gallery.
        </p>
        <p className="gal-states">
          The inventory column beside this part says `rest 28 %` and
          `hover 100 % + beleg`, and none of these rows does that. The SYS.01
          sheet overrules it — the evidence line is always readable, and the
          hover carries nothing it does not. lib/gallery/registry.ts holds the
          disagreement rather than editing the transcription.
        </p>
        <p className="gal-states">
          Rendered inside a real `.trn-grid` and real `ModuleCard`s rather than
          on their own, because this is also the only place the rig can measure
          the card geometry the sheet draws: `/` has no api here, so SYS.01 is
          an outage panel there and the grid is not in the document at all.
          e2e/sheet.ts explains what that costs and what the `on` field does
          about it.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <div className="trn-grid">
            {GALLERY_MODULES.map((module) => (
              <ModuleCard key={module.no} module={module} messages={en} />
            ))}
          </div>
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">IncidentLog</h2>
          <span className="gal-where">case study `.04` · the empty state is the one that ships</span>
        </div>
        <p className="gal-states">
          Production has answered `incidents: []` every day this page has
          existed, so the panel below is what a visitor actually sees. It owes a
          reason, and STATE.05 is why: an empty list without one is a dead end.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <IncidentLog incidents={[]} messages={en} />
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
