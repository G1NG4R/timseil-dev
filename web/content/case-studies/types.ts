// What a case study is made of, apart from its numbers.
//
// Its own file so that content/case-studies/index.ts can hold the registry
// without importing every study to learn the shape, and so that a second system
// (build plan P7) gets the same fields or a type error rather than a page that
// silently omits one.
//
// EVERY FIELD HERE IS PROSE OR A LABEL. Nothing measured, nothing versioned:
// those come from /api/systems/{slug}, and lib/api/systems.ts reads them. If a
// field ever wants a number, that is the signal it belongs in the api instead.

/**
 * One station on the request path.
 *
 * `own` is the sheet's own vocabulary and not a styling flag: the Case Study Map
 * labels every box `EIGEN` or `EXTERN`, and the Template draws the two stations
 * that are our code with a signal border while the browser, the edge and the
 * volume keep the ordinary one. The distinction is what the section argues, so
 * it is content.
 */
export interface Hop {
  /** `CLIENT`, `EDGE`, `WEB`, `API`, `DATA` — the station, not the product. */
  readonly key: string;
  /** The thing standing there. A technology, never a version. */
  readonly name: string;
  readonly detail: string;
  /** Whether this station is code in this repository. */
  readonly own: boolean;
}

/** One of the lanes beside the path: the things that are not a request. */
export interface Lane {
  readonly key: string;
  readonly detail: string;
}

/**
 * One row of the decision table.
 *
 * `alternative` is required, and that is the point of the table rather than a
 * schema detail — the Operations sheet says it in one line: a choice recorded
 * without what it rejected "ist es keine Entscheidung".
 */
export interface Decision {
  readonly decision: string;
  readonly alternative: string;
  readonly why: string;
}

/** One phase of the build, in the order it happened. */
export interface Phase {
  readonly title: string;
  readonly detail: string;
}

export interface CaseStudy {
  /** The system's slug in `systems`. The route is `/work/<slug>`. */
  readonly slug: string;
  /** ISO date, `YYYY-MM-DD`. The page's real modification date for sitemap.ts. */
  readonly updatedAt: string;

  /** The `<h1>`. One sentence, not the system's name — the eyebrow says that. */
  readonly headline: string;
  readonly lead: string;
  /** The one red line on the page. */
  readonly alert: string;

  readonly role: string;
  readonly year: string;
  /** The qualifier after the state word in the spec rail's STATUS row. */
  readonly hosting: string;

  readonly problem: readonly string[];
  readonly constraints: readonly string[];

  /** `.02 ARCHITECTURE` — the request path, the lanes beside it, the decisions. */
  readonly architecture: {
    readonly hops: readonly Hop[];
    readonly lanes: readonly Lane[];
    readonly decisions: readonly Decision[];
  };

  /** `.03 BUILD` — the caption under the compose block, and the order of work. */
  readonly build: {
    readonly composeCaption: string;
    readonly phases: readonly Phase[];
  };

  readonly emptyNote: {
    readonly label: string;
    readonly text: string;
  };
}
