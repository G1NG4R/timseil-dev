import type { Stage } from "@/content/case-studies/types";

/**
 * The seven stages between a merge and a running container.
 *
 * AN `<ol>` WITH A COUNTER, the third component on this page to reach for that
 * shape and for the reason `Constraints` and `BuildPhases` both give: `01` is
 * the sheet's form, a list marker cannot be zero-padded, and the order is the
 * claim. A pipeline drawn out of order is a different pipeline.
 *
 * NO STAGE DURATION, AND NOT AN EM DASH EITHER. The Template puts `[—s]` under
 * six of the seven boxes. Nothing measures a stage here and no phase plans to,
 * so `— NO DATA` would be a promise rather than an honest absence — the same
 * call `RequestPath` makes about hop latency and the uptime tile makes about an
 * unknown window. ADR 0055 §3 wrote the rule; this is its third application.
 *
 * WHAT REPLACES THE DURATION IS THE JOB NAME, which is a thing that exists.
 * `Stage.job` names the job in `.github/workflows/ci.yml`, and
 * lib/content/pipeline.test.ts holds every one of them against that file — so
 * the row cannot quietly describe a pipeline that was renamed. The name is not
 * drawn; it is the test's handle, not the reader's.
 */
export function Pipeline({ stages, label }: { stages: readonly Stage[]; label: string }) {
  return (
    <ol className="pipeline" aria-label={label}>
      {stages.map((stage) => (
        <li className="pipe-stage" key={stage.title}>
          <span className="pipe-title">{stage.title}</span>
          <span className="pipe-detail">{stage.detail}</span>
        </li>
      ))}
    </ol>
  );
}
