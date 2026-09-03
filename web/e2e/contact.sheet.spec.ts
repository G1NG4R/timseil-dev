/**
 * `/contact` against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/contact.gen.json`, written by `tools/gen-sheet-oracle.mjs` out of
 * the read-only sheets and checked for drift by `make check-contract`.
 *
 * TWO CAPS ARE NOT IN THE ORACLE, and the generator says why at length: a `ch`
 * comes back from `getComputedStyle` as pixels, and the pixels depend on which
 * font loaded — 529.152 in a browser with Chakra Petch, 512 in this rig. What
 * the caps are for is asserted in contact.spec.ts, where it can be measured
 * without depending on a font file.
 *
 * TWO WIDTHS, like About and the homepage, and the Intermediate Widths sheet
 * names this page in the sentence that declines a third: "Fliesstext, Blog,
 * About, Contact und Legal fliessen, dort ist nichts zu entscheiden." The one
 * fixed column here — the 520px trace — is drawn at 1440 and gone below 1080,
 * which is a switch layout.css already owns rather than a frame the sheet owes.
 *
 * AND NO `ready`. Like `/about`, this page reads no endpoint: every word comes
 * out of lib/contact/ and lib/i18n/, and the one thing that talks to the api
 * does it after somebody presses a button. There is no streamed region, no
 * fallback, and nothing to wait for.
 *
 * EIGHT OF THE TWENTY-TWO DIVERGE, and one class of them is unlike anything the
 * four earlier oracles carry: `a-form-is-not-a-canvas` is not about pixels. The
 * sheet draws a demo switch that forces a failure, a build number, an uptime,
 * and a footer strip reading "KEINE SPEICHERUNG AUF DEM SERVER" — which is
 * false on this page of all pages, since `contact_messages` is the one table on
 * this site that holds personal data. None of the four is built.
 */
import generated from "./oracle/contact.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { CONTACT, CONTACT_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: CONTACT,
  drawnWidths: CONTACT_DRAWN_WIDTHS,
  // 24, AND NOT ONE OF THEM CARRIES AN `on:`. The second page in a row with
  // that property, and for the same reason: the rig has no api, and this page
  // does not need one to be whole. The form is on the page whether or not
  // anything ever answers it — which is also what a visitor gets during a
  // rollout, when ADR 0035 says the api is briefly gone.
  minimumEntries: 22,
});
