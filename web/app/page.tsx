// Server Component by default — no 'use client' here and none without a
// comment saying why, anywhere.
//
// This page exists so that `make dev` can prove hot reload on the web side.
// The homepage itself is stage H; nothing about it is decided here.
//
// SINCE F1B IT ALSO MAKES THE HOP. The two lines below are the only reason web
// talks to the api at all today, and they are what the phase's acceptance reads:
// one request to `/` has to leave a line in this container and a line in the
// api's, joined by one trace id. H3 REPLACES this block rather than extending it.

import { serverFetch } from "@/lib/http/serverFetch";

// Not redundant next to the `headers()` call inside serverFetch, and that is
// worth a sentence. `headers()` does take this route out of the static pass —
// but it does so by throwing a DynamicServerError that Next catches during the
// build. Relying on a caught throw to keep a build green is one refactor away
// from a build that is not.
export const dynamic = "force-dynamic";

const NO_DATA = "— NO DATA";

export default async function Home() {
  const health = await serverFetch("/api/health");

  // Invariant 1, and this is the first place in web where it applies: a number
  // or a name this page cannot get from the api is absent, never zero and never
  // an empty string pretending to be one.
  const status = readString(health.body, "status") ?? NO_DATA;
  const version = readString(health.body, "version") ?? NO_DATA;

  return (
    <main>
      <h1>timseil.dev</h1>
      <p>Development shell. The site itself is built in stage H.</p>
      <dl>
        <dt>api</dt>
        <dd>{status}</dd>
        <dt>version</dt>
        <dd>{version}</dd>
      </dl>
    </main>
  );
}

/**
 * Reads one string off a body whose type nothing has checked.
 *
 * No generated type here on purpose. lib/api/schema.d.ts exists and G4 is where
 * it gets used, together with the client that makes a typed answer worth having.
 * Two of these accessors would already be one too many.
 */
function readString(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : null;
}
