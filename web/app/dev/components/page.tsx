import { notFound } from "next/navigation";

import { TrajectoryPanel } from "@/components/about/TrajectoryPanel";
import { TrajectoryRail } from "@/components/about/TrajectoryRail";
import { IncidentLog } from "@/components/case/IncidentLog";
import { OpsGrid } from "@/components/case/OpsGrid";
import { SpecRail } from "@/components/case/SpecRail";
import { ModuleCard } from "@/components/home/ModuleCard";
import { ContributionGraph } from "@/components/home/ContributionGraph";
import { OpsStrip } from "@/components/home/OpsStrip";
import { Systems } from "@/components/home/Systems";
import { WorkList } from "@/components/work/WorkList";
import { ChipStates } from "@/components/dev/ChipStates";
import { StateFlip } from "@/components/dev/StateFlip";
import { DegradedNotice } from "@/components/state/DegradedNotice";
import { EmptyState } from "@/components/state/EmptyState";
import { TxTrace } from "@/components/contact/TxTrace";
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
import type { ContributionLevel, Contributions } from "@/lib/api/contributions";
import type { Incident, OpsCell, SystemDetail, SystemList } from "@/lib/api/systems";
import { modules, type ModuleView } from "@/lib/api/training";
import { Log } from "@/components/home/Log";
import type { PostRead } from "@/lib/content/posts";
import { STATIONS } from "@/lib/about/trajectory";
import { PARTS, inventoryProgress, isBuilt, type Part } from "@/lib/gallery/registry";
import { DEV_GALLERY_ENV, galleryVisible } from "@/lib/gallery/visibility";
import { en } from "@/lib/i18n/messages/en";
import { sessionLines } from "@/lib/contact/log";
import type { ContactRequest } from "@/lib/contact/payload";
import { CONTACT_STATE_KEYS, type ContactStateKey } from "@/lib/contact/states";
import { retryLine, waitLine } from "@/lib/state/retry";
import { MARKS, STATE_KEYS, stateLabel, type DayState, type StateKey } from "@/lib/state/words";

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

/**
 * The two systems the seed holds, plus the one it cannot.
 *
 * THE FIRST TWO ARE PRODUCTION'S OWN ROWS, transcribed from
 * api/internal/seed/seed.sql rather than invented — the point of the part below
 * is the difference between them, and a made-up pair would be a difference
 * somebody chose. `metrics` is all `null` for the same reason it is null in
 * production: seed.sql writes no measurements, because a measurement a seed
 * writes is an invented number (ADR 0013).
 *
 * THE THIRD IS THE ONE PRODUCTION CANNOT MAKE, and it is here for the reason
 * this gallery exists at all: `in_build` is in the contract and no system on
 * this site is in it. It carried the `— NO DATA` branch until H6 closed #289;
 * now it carries the word itself, and this is still the only place anybody can
 * look at it before a system ever reaches that state.
 */
/**
 * A calendar the shape production answers with.
 *
 * BUILT RATHER THAN TRANSCRIBED, and 367 literal days would be the only other
 * way. What matters is that the SHAPE is the real one — measured against
 * https://timseil.dev/api/contributions on 2026-09-01: 53 columns, 367 days, a
 * last week of three, and all five steps present. A tidier fixture is how H5a's
 * defect stayed invisible for a phase: `/` has no api in this rig, so this
 * gallery is the only place any of it is in the document.
 *
 * The counts are chosen to land on all five levels the same way GitHub's own
 * buckets do, so the legend under the graph has something to point at.
 */
/**
 * Three states of SYS.04 that `/` cannot show, and one it can.
 *
 * THIS SECTION IS THE OPPOSITE OF EVERY OTHER HOMEPAGE ENTRY IN THIS FILE. The
 * others are here because the rig has no api and the real page therefore draws
 * an outage panel where the component belongs. SYS.04 reads content/posts out of
 * the repository, so the real page draws real rows and e2e/home.spec.ts asserts
 * them there. What is left for the gallery is what the repository cannot be made
 * to contain: a directory with nothing in it, a directory that cannot be read,
 * and a file the reader had to skip.
 */
const GALLERY_LOG: PostRead = {
  posts: [
    {
      slug: "014-eighty-pixels-that-were-never-mine",
      title: "Eighty pixels that were never mine",
      deck: "A contribution graph was drawn eighty pixels narrower than the column it sits in.",
      published: "2026-09-01",
      systemId: "timseil-dev",
      // The three keys H9a added. The gallery draws a row, and a row draws none
      // of them — they are here because the type is the post's, not the row's.
      tags: ["frontend", "css"],
      summary: "One paragraph, as every post carries.",
      updated: null,
    },
    {
      slug: "013-the-column-the-test-rig-could-not-see",
      title: "The column the test rig could not see",
      deck: "A description column on my homepage computed to zero pixels wide.",
      published: "2026-09-01",
      systemId: "timseil-dev",
      // The three keys H9a added. The gallery draws a row, and a row draws none
      // of them — they are here because the type is the post's, not the row's.
      tags: ["testing", "css"],
      summary: "One paragraph, as every post carries.",
      updated: null,
    },
    {
      slug: "001-zero-downtime-measured-not-claimed",
      title: "Zero-downtime, measured instead of claimed",
      deck: "My build plan promised about three seconds and no 5xx.",
      published: "2026-08-23",
      systemId: "timseil-dev",
      // The three keys H9a added. The gallery draws a row, and a row draws none
      // of them — they are here because the type is the post's, not the row's.
      tags: ["ci-cd", "deploys", "traefik"],
      summary: "One paragraph, as every post carries.",
      updated: null,
    },
  ],
  skipped: [],
};

/** Read, and holding nothing. `LATEST 00` is a measurement; `— NO DATA` is not. */
const GALLERY_LOG_EMPTY: PostRead = { posts: [], skipped: [] };

/** Read, and one file in it could not be used. The row count is what changes. */
const GALLERY_LOG_SKIPPED: PostRead = {
  posts: GALLERY_LOG.posts.slice(0, 2),
  skipped: ["015-a-post-with-no-frontmatter.mdx"],
};

function calendar(first: string, days: number, ageSec: number): Contributions {
  const start = Date.parse(`${first}T00:00:00Z`);
  const weeks: { days: { date: string; count: number; level: ContributionLevel }[] }[] = [];
  let total = 0;

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start + index * 86_400_000);
    const iso = date.toISOString().slice(0, 10);
    // Deterministic and lumpy: a run of empty days, then a burst, so the picture
    // reads as work rather than as noise.
    const count = index % 11 === 0 ? 28 : index % 7 === 0 ? 12 : index % 3 === 0 ? 5 : index % 5 === 0 ? 1 : 0;
    const level: ContributionLevel =
      count === 0 ? "l0" : count === 1 ? "l1" : count === 5 ? "l2" : count === 12 ? "l3" : "l4";
    total += count;

    if (date.getUTCDay() === 0 || weeks.length === 0) weeks.push({ days: [] });
    weeks[weeks.length - 1].days.push({ date: iso, count, level });
  }

  return { totalContributions: total, fetchedAt: `${first}T00:00:00Z`, cacheAgeSec: ageSec, weeks };
}

/** 53 columns from a Sunday, a short last week, 22 minutes old — production. */
const GALLERY_CALENDAR = calendar("2025-08-31", 367, 1_357);

/** The case no live answer has produced: a first column of four, on rows 4–7. */
const GALLERY_CALENDAR_OFFSET = calendar("2025-09-03", 364, 90);

/** GitHub has been unreachable for nine hours and the answer says so. */
const GALLERY_CALENDAR_STALE = calendar("2025-08-31", 367, 33_000);

/**
 * Thirty days of operation, and two states production has not produced.
 *
 * `nodata` twenty times and `ok` ten is what /api/systems/timseil-dev?window=30
 * answered on 2026-09-01 — the probe is about ten days old, so two thirds of the
 * real strip is outline. `degraded` and `outage` are added for the reason the
 * `in_build` row above gives: a state nobody has drawn is a state nobody has
 * looked at.
 */
const GALLERY_STRIP: SystemDetail = {
  slug: "timseil-dev",
  systemNo: "02",
  name: "timseil.dev",
  state: "live",
  source: { access: "public", url: "https://github.com/G1NG4R/timseil-dev" },
  stack: ["Next.js 16.3", "Go 1.26", "PostgreSQL 18.6"],
  metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
  window: 30,
  generatedAt: "2026-09-01T19:21:00Z",
  incidents: [],
  deploys: [],
  days: Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.parse("2026-08-03T00:00:00Z") + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const state: DayState =
      index < 18 ? "nodata" : index === 21 ? "degraded" : index === 24 ? "outage" : "ok";
    return { d: date, state, downSec: state === "outage" ? 640 : 0 };
  }),
};

const GALLERY_SYSTEMS = {
  systems: [
    {
      slug: "vat-check",
      systemNo: "01",
      name: "VAT Check API",
      state: "queued",
      source: { access: "private", reason: "internal" },
      stack: ["Python", "FastAPI", "Docker", "SQLite"],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
    {
      slug: "timseil-dev",
      systemNo: "02",
      name: "timseil.dev",
      state: "live",
      source: { access: "public", url: "https://github.com/G1NG4R/timseil-dev" },
      // THE WHOLE STACK AND NOT THREE OF IT, and that is the fixture's most
      // load-bearing detail. `stack.gen.json` answers eleven items for this
      // system; a shortened list here would draw a row that production never
      // draws, and it would hide the defect H5a found by measuring the real
      // page — `auto` on the fourth track is max-content, max-content of eleven
      // items is 618px at 1440, and the description column beside it computes to
      // zero. Transcribed from api/internal/seed/stack.gen.json.
      stack: [
        "Next.js 16.3",
        "React 19.2",
        "Go 1.26",
        "pgx 5.10",
        "sqlc 1.30",
        "goose 3.27",
        "PostgreSQL 18.6",
        "Node 24",
        "Prometheus 3.13",
        "Loki 3.7",
        "Alloy 1.18",
      ],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
    {
      slug: "not-a-real-system",
      systemNo: "03",
      name: "A system being built",
      state: "in_build",
      source: { access: "private", reason: "nda" },
      stack: ["Go 1.26"],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
  ],
  generatedAt: "2026-09-01T12:00:00Z",
} as unknown as SystemList;

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
          <h2 className="gal-name">ContactForm</h2>
          <span className="gal-where">contact · six states, and never one by colour alone</span>
        </div>
        {/* THE SIX, SIDE BY SIDE, WHICH IS THE ONLY PLACE THEY EVER ARE. On the
            page a visitor sees one at a time and four of them need a particular
            answer from the api to reach at all — a 429 needs three messages in
            ten minutes, a 502 needs the relay to be down. The Consistency
            Check's second round lists "sechs Formzustände" as settled for this
            page, and until here nothing rendered the claim.

            THE PANEL AND NOT A LIVE FORM. Six islands on one document would be
            six honeypots and six dwell clocks, and the state is not in the
            fields — it is in this strip, which is what H8b built. */}
        <div className="gal-demo">
          {CONTACT_STATE_KEYS.map((state) => (
            <div className="gal-case" key={state}>
              <span className="gal-case-label">{state}</span>
              <TxTrace body={galleryBody(state)} lines={galleryLog(state)} state={state} />
            </div>
          ))}
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
          <h2 className="gal-name">SystemRow</h2>
          <span className="gal-where">homepage `SYS.02` · the exit is absent, never greyed out</span>
        </div>
        <p className="gal-states">
          Both rows the seed holds, and the difference between them is the part
          worth looking at: `timseil.dev` is LIVE and carries an arrow, and
          `VAT Check API` is QUEUED and carries none. STATE.05 refuses a dead
          control, so a row with nowhere to go has no control at all — the state
          column beside it is what says why.
        </p>
        <p className="gal-states">
          A third row stands under them that production cannot produce: a system
          the contract calls `in_build`, which the seed has never held. It read
          `— NO DATA` for five phases because the vocabulary had no word that
          meant it; H6 closed issue 289 and it now reads IN BUILD, carrying the
          same tone and the same dash as QUEUED. That sameness is the decision
          rather than an oversight — nothing is measured in either state, so the
          fill cannot separate them and the word is what does.
        </p>
        <p className="gal-states">
          Rendered through the real section, so the head above the rows is the
          real `systemsMeta` counting the rows under it. `/` has no api in this
          rig, so SYS.02 there is an outage panel and this is the only place the
          list is in the document at all.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <Systems body={GALLERY_SYSTEMS} messages={en} />
        </div>
      </section>

      {/* ── /work, and the whole page rather than a row ────────────────────── */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">WorkList</h2>
          <span className="gal-where">`/work` · the only place this rig can see a row</span>
        </div>
        <p className="gal-states">
          THE WHOLE SECTION, NOT A ROW, and that is what this entry is for. There
          is no api in this rig, so `/work` itself renders an outage panel — the
          head, the counter and every row live here or nowhere. e2e/work.spec.ts
          asserts the page; e2e/gallery.work.spec.ts asserts what is under this
          heading, and between them they cover a page that cannot be seen whole
          in one place.
        </p>
        <p className="gal-states">
          Three rows, from the same fixture SystemRow uses: `vat-check` is QUEUED
          and carries no operating figure at all — nobody measures the uptime of
          a system that is not running, and ADR 0055 says that gets no cell
          rather than `— NO DATA`. `timseil.dev` is LIVE and carries the label
          with an empty value, because that measurement was attempted and has not
          arrived. The third is IN BUILD, which production cannot produce.
        </p>
        <p className="gal-states">
          The fourth row under it is the same component with `body={null}`: the
          resting state, which is also what a failed read looks like. Its four
          tiles say `— NO DATA` rather than `00`, and the two are different
          claims — `00` means the api answered and there are none.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <WorkList body={GALLERY_SYSTEMS} posts={GALLERY_LOG.posts} messages={en} />
        </div>
        <div className="gal-demo" style={{ display: "block" }}>
          <WorkList body={null} posts={[]} messages={en} />
        </div>
      </section>

      {/* ── The chip, on its own, in the states the inventory names ───────── */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">FilterChip</h2>
          <span className="gal-where">`/work` · the two rows above the list</span>
        </div>
        <p className="gal-states">
          rest · hover · focus · gesetzt (invertiert) · leer (0 treffer). The
          first four are here; the fifth is not, and the reason is in the
          registry entry. State Language draws DISABLED as a struck-through
          `RUST` annotated &quot;0 treffer&quot; — a chip out of a fixed
          vocabulary that today matches nothing. This page derives its stack
          chips from the answer, so a chip that matches nothing is never drawn.
          What is empty here is a COMBINATION, and the panel under the list is
          where that state lives. Press LIVE and PYTHON in the section above to
          see it.
        </p>
        <p className="gal-states">
          The sentinel is a third resting state the sheet only draws in its own
          script: `ANY` at rest is the accent in outline, an ordinary chip is
          steel. Hover is behind `hover: hover`, so a touch screen gets the rest
          state; focus is the one ring globals.css draws for everything.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <ChipStates />
        </div>
      </section>

      {/* ── SYS.04, and the only three states of it that are not on `/` ────── */}
      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">Log</h2>
          <span className="gal-where">homepage `SYS.04` · the states the repository cannot hold</span>
        </div>
        <p className="gal-states">
          NOT IN THE HANDOFF INVENTORY, and deliberately not added to it. The
          sheet&apos;s sixteen names carry `PostCard` for the blog, which H9
          builds; the homepage log row is a different component and
          lib/gallery/registry.ts is a transcription of that sheet rather than a
          list of everything we ship. So this section has no registry row, and
          the inventory count above is unchanged.
        </p>
        <p className="gal-states">
          The first block is the shape, rendered through the real section so the
          head is the real `logMeta` counting the rows under it. No row is a
          link: `/blog/&lt;slug&gt;` is a 404 until H9, and a row that lit up
          under the pointer and did nothing would be the dead control STATE.05
          refuses. The one link is in the head.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <Log read={GALLERY_LOG} caseStudyHref="/work/timseil-dev" messages={en} />
        </div>
        <p className="gal-states">
          Then the two emptinesses, and they are two claims rather than one.
          `LATEST 00` says the directory was read and holds nothing — the
          statement `00 SYSTEMS` makes one section up. `— NO DATA` says it could
          not be read at all, which on this site means an image that shipped
          without its own content.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <Log read={GALLERY_LOG_EMPTY} exit={{ href: "/blog", label: en.navLog }} messages={en} />
        </div>
        <div className="gal-demo" style={{ display: "block" }}>
          <Log read={null} exit={{ href: "/blog", label: en.navLog }} messages={en} />
        </div>
        <p className="gal-states">
          And a read that had to skip a file. Nothing on the page says so — a
          reader is owed entries, not the reader&apos;s bookkeeping — so the only
          visible difference is the count, which is the point: the skipped file
          is a WARN in the build log, and lib/content/posts.ts explains why it is
          not silence and not a throw.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <Log read={GALLERY_LOG_SKIPPED} caseStudyHref="/work/timseil-dev" messages={en} />
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">ContributionGraph</h2>
          <span className="gal-where">homepage `SYS.03` · one picture, one name</span>
        </div>
        <p className="gal-states">
          Fifty-three columns, because that is what production answers: measured
          on 2026-09-01 the calendar carried 53 weeks and 367 days, the last week
          three of them. The caption counts what is drawn — the sheet writes
          `LAST 365 DAYS`, and 365 is a round number about a year rather than
          this year.
        </p>
        <p className="gal-states">
          All five steps stand in it, which production also does: 322 · 26 · 12 ·
          4 · 3 on the day this was built. `--l0` to `--l4` have been in all seven
          palettes since G1 with nothing drawing them, and this is the grid they
          were cut for.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <ContributionGraph body={GALLERY_CALENDAR} messages={en} />
        </div>
        <p className="gal-states">
          The second one begins on a Wednesday, which no live answer has yet
          produced. Its first column is four cells and they belong on rows four to
          seven; placed at the top the whole year would slide up three rows, and
          nothing on `/` would look wrong enough to notice.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <ContributionGraph body={GALLERY_CALENDAR_OFFSET} messages={en} />
        </div>
        <p className="gal-states">
          The third is old. The api answers with the last good calendar and its
          age for as long as it has one, so `from cache` is not a panel — it is
          the same picture wearing a larger number. Only the cold start, where
          GitHub has never replied, draws the fourth.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <ContributionGraph body={GALLERY_CALENDAR_STALE} messages={en} />
          <ContributionGraph body={null} messages={en} />
        </div>
      </section>

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name">OpsStrip</h2>
          <span className="gal-where">homepage `SYS.03` · thirty days, one row, nothing to press</span>
        </div>
        <p className="gal-states">
          The same four cell states as the case study&apos;s grid and the same
          derivation, in the shape the sheet gives the homepage: one row, and no
          notch on the incidents. Production answers 20 `nodata` and 10 `ok`
          today — the probe has been running about ten days — so two thirds of
          the real strip is outline, which is the correct picture and not a bug.
        </p>
        <p className="gal-states">
          `degraded` and `outage` are in the fixture and not in production, for
          the reason the `in_build` row above gives: this is where a state gets
          looked at before a visitor meets it.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <OpsStrip body={GALLERY_STRIP} messages={en} />
          <OpsStrip body={null} messages={en} />
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

      <section className="gal-part">
        <div className="gal-part-head">
          <h2 className="gal-name" id="gal-tl-name">TrajectoryRail</h2>
          <span className="gal-where">`/about` · SYS.05.01 · six stations, no script</span>
        </div>
        <p className="gal-states">
          The inventory asks for `jahr aktiv`, `inaktiv` and `tastatur ← →`, and
          two of the three are below: the chosen station and the ones that are
          not. The third has nothing to draw — this is a radio group, so the
          arrows are the browser&rsquo;s and there is no class for them. Press
          them here and the rail answers; `e2e/about.spec.ts` is where that is
          asserted, because a keystroke is not a state.
        </p>
        <p className="gal-states">
          The rail rests on `NOW`. Everything behind the chosen station carries a
          half-accent ring, everything after it a plain one, and the line runs to
          the centre of the chosen dot rather than to the edge of its column.
        </p>
        <div className="gal-demo" style={{ display: "block" }}>
          <TrajectoryRail
            name="gal-tl"
            labelledBy="gal-tl-name"
            panels={STATIONS.map((station) => (
              <TrajectoryPanel
                key={station.key}
                station={station}
                soon={en.aboutStationSoon}
                pickedUp="PICKED UP"
                shippedLabel="SHIPPED"
                /* THE GALLERY GATES THE LINK THE WAY THE PAGE DOES, so a station
                   whose system has no page draws no shipped cell here either. A
                   fixture that handed every station an href would draw a state
                   the site cannot produce. */
                href={station.shipped === null ? null : `/work/${station.shipped.slug}`}
              />
            ))}
          />
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

/**
 * A request for the gallery to draw, or `null` where the state has none.
 *
 * FIXED VALUES AND A FIXED TIMESTAMP, because this page is also a visual
 * regression target: a body built from `new Date()` would make every run
 * different in the one place a diff is supposed to mean something. The address
 * is the sheet's own (`anna.keller@firma.lu`), so the panel here draws what the
 * artboard draws.
 */
function galleryBody(state: ContactStateKey): ContactRequest | null {
  if (state === "rest") return null;

  return {
    name: "Anna Keller",
    email: "anna.keller@firma.lu",
    message: "Hi Tim, we are looking for somebody for our payment pipeline.",
    company: "",
    dwellMs: 3247,
    ts: "2026-09-03T14:22:04Z",
  };
}

/** The log each state carries, built by the same function the page uses. */
function galleryLog(state: ContactStateKey): ReturnType<typeof sessionLines> {
  const base = {
    state,
    honeypotEmpty: true,
    dwellMs: 3247,
    invalidCount: 0,
    status: null as number | null,
    statusText: null as string | null,
    durationMs: null as number | null,
    receipt: null as string | null,
    answeredAt: null as number | null,
    retry: null as string | null,
  };

  switch (state) {
    case "rejected":
      return sessionLines({ ...base, invalidCount: 2 });
    case "accepted":
      return sessionLines({
        ...base,
        status: 202,
        durationMs: 1120,
        receipt: "msg_01M1MGN4V2DX7ZPP",
        answeredAt: Date.parse("2026-09-03T14:22:07Z"),
      });
    case "failed":
      // The 429, because it is the one state with a line that ticks: the page
      // holds the api's measured wait and prints what is left of it.
      return sessionLines({
        ...base,
        status: 429,
        statusText: "Too many requests",
        durationMs: 84,
        answeredAt: Date.parse("2026-09-03T14:22:07Z"),
        retry: waitLine(412),
      });
    default:
      return sessionLines(base);
  }
}
