/**
 * The rig the build plan asks for before H1, and the window three measurements
 * from stage G have been waiting in (#236).
 *
 * IT RUNS AGAINST A PRODUCTION BUILD, not against `next dev`, and that is the
 * one decision in this file worth arguing. `next dev` hydrates again since
 * #235, so it would work — but `cacheComponents: true` keeps up to three routes
 * mounted and merely hidden, and that behaviour is a production one. Measuring
 * the `<Activity>` question against a development server would measure a
 * different program. The cost is a build in front of the run, which is why
 * reuseExistingServer is on locally.
 *
 * ONE BROWSER. Chromium only, and the reason is that nothing here asks a
 * question a second engine would answer differently: touch targets, a dialog,
 * and a media query. I2 is where a second engine earns its place — the build
 * plan names Firefox there explicitly, because `animation-timeline: view()` is
 * the thing it does not support — and that is the phase that should pay for it.
 *
 * THE POINTER IS ITS OWN DIMENSION, not a consequence of the width. CLAUDE.md
 * is explicit: the 44px rule and the read-only terminal hang on
 * `pointer: coarse`, not on the viewport. A narrow desktop window is not a
 * phone, and a rig that conflated the two would report a pass for a rule it
 * never evaluated. The `coarse` project is therefore separate and only runs the
 * specs whose name says they need it.
 */
import { defineConfig, devices } from "@playwright/test";

import { WIDTHS, heightFor } from "./e2e/widths";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: "./e2e",
  // The sheets and the app are both local; a slow assertion here is a broken
  // one, not a busy one.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  projects: [
    // The width sweep. Every spec that is not width-specific runs at all seven.
    ...WIDTHS.map((width) => ({
      name: `w${String(width)}`,
      testIgnore: /\.coarse\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width, height: heightFor(width) },
        hasTouch: false,
      },
    })),

    // The coarse pointer, at the one width where the mobile chrome exists.
    // 390 rather than 719 because it is the narrower of the two and every
    // target that fits here fits there.
    {
      name: "coarse-390",
      testMatch: /\.coarse\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: heightFor(390) },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],

  webServer: {
    command: `npm run build && npm run start -- --port ${String(PORT)}`,
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
