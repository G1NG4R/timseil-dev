// The load behind F3's acceptance criterion, and it is deliberately small.
//
//     make rolling-lab && make load && make check-metrics
//
// The build plan asks for a p95 "der zu einem k6-Lauf passt". That needs two
// numbers from one run: k6's own http_req_duration p(95), measured at the
// client, and timseil:request_duration_seconds:p95_5m, measured by Traefik.
// This file produces the first one and gives the second something to be a
// quantile of.
//
// THE TWO NUMBERS ARE NOT MEANT TO BE EQUAL, and reading them as if they were
// is how a phase talks itself into a wrong tolerance. What separates them:
//
//   · k6 times connect + write + wait + read. Traefik's histogram starts when
//     it has the request and stops when it has written the response.
//   · k6 reports over the whole run; the rule is a 5-minute rate window, so a
//     60s run sits inside a window that is mostly empty. The rule reads LOWER
//     for that reason alone until the run has filled the window.
//   · Traefik buckets; k6 keeps every sample. A bucketed p95 lands on a bucket
//     boundary, and with the default buckets that is a coarse grid at the
//     millisecond end.
//
// So the honest reading is "same order, Traefik's slightly below k6's", and if
// the two are far apart the interesting question is which one is wrong rather
// than what tolerance would make both pass.
//
// THIS IS NOT L8. The performance budget — LCP, initial JS, spike and soak —
// is a later stage with thresholds that fail a build. Nothing here fails
// anything: it is an instrument, and an instrument with an opinion about the
// result is a bad instrument.

import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.K6_BASE || 'http://traefik:8080'

export const options = {
  vus: Number(__ENV.K6_VUS || 10),
  duration: __ENV.K6_DURATION || '60s',
  // No thresholds on purpose — see the last paragraph above.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

// ONE CLIENT IS ONE BUCKET, and the first run of this file is why that sentence
// is here instead of a comment about VUs.
//
// Measured 2026-08-25, 10 VUs for 60s against the lab: 4742 requests, of which
// 2226 failed — and the proxy said what they were.
//
//     traefik_service_requests_total{code="200", service="timseil-api@docker"}   324
//     traefik_service_requests_total{code="429", service="timseil-api@docker"}  4190
//
// Not a defect. RATE_LIMIT_RPM is 120 with a burst of 60, per client (ADR 0015),
// and k6 in one container is one client. A load generator that ignores that
// measures the rate limiter and reports it as the site being slow. In
// production the same 40 requests a second would arrive from forty different
// buckets and none of this would happen — which is exactly why the number a
// single-IP run produces for /api is not a number about the API.
//
// Two consequences, and the second is the one worth keeping:
//
//   1. The volume goes through `/`, which is not rate limited. That is where
//      the p95 being compared comes from.
//   2. /api/health is requested at roughly 1 rps — under the limit, and often
//      enough that timseil-api@docker EXISTS as a series. The rules aggregate
//      by service, and a service with no series is indistinguishable from a
//      rule that does not work.
//
// A THIRD THING THE FIRST RUN PROVED, for free: 4190 responses with status 429
// left timseil:requests:error_ratio_5m at zero. Correct — the contract defines
// errorRate as the share of 5xx, and a rate limiter refusing traffic on purpose
// is not the site failing. The rule was written for that and now it is measured
// rather than believed.

// Every VU does ~4 iterations a second, so every 40th iteration per VU across
// 10 VUs is about one request a second in total. Written as a number rather
// than a rate because k6 has no per-scenario throttle that stays honest when
// the target slows down.
const API_EVERY = 40

export default function () {
  const page = http.get(`${BASE}/`)
  check(page, { 'web 200': (r) => r.status === 200 })

  if (__ITER % API_EVERY === 0) {
    const res = http.get(`${BASE}/api/health`)
    check(res, { 'api 200': (r) => r.status === 200 })
  }

  sleep(0.2)
}
