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

  readonly emptyNote: {
    readonly label: string;
    readonly text: string;
  };
}
