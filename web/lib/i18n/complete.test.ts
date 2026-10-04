// The test this phase exists for is the second one in this file.
//
// A full catalogue and a bundle with no German entry has to resolve to ENGLISH.
// Before U8 nothing asked that question, so the moment the last key landed in
// de.ts, `<main>` on /de would have dropped its `lang="en"` over about 3.040
// words of English page prose. The predicate is one line; this is the line that
// says the predicate is the right one.
//
// AND THE LAST TEST IS THE ONE THAT KEEPS IT TRUE. `BUNDLES` is a register, and
// a register is somewhere to forget something — so the bundle MODULES are read
// off disk and every one of them has to be reachable from the list. It finds
// nothing today, because U8 ships no bundle; it goes red the first time U8a
// writes a `*.de.ts` and does not register it.

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  BUNDLES,
  type ContentBundle,
  bundlesComplete,
  isComplete,
  languageComplete,
  resolveContent,
} from "./complete.ts";
import { de } from "./messages/de.ts";
import { en, type Messages } from "./messages/en.ts";
import { fr } from "./messages/fr.ts";
import { resolveMessages } from "./messages.ts";
import { LOCALES } from "./routes.ts";

/** A catalogue with every key filled, so that a test about bundles is not
 *  accidentally a test about the catalogue. */
function fullCatalogue(): Partial<Messages> {
  return Object.fromEntries(Object.keys(en).map((key) => [key, `x-${key}`]));
}

describe("what the catalogue alone can and cannot answer", () => {
  it("German carries every key and French carries none", () => {
    assert.equal(isComplete(de), true);
    assert.equal(isComplete(fr), false);
    assert.equal(isComplete(en), true);
  });

  // THE PHASE, AS ONE ASSERTION. A page source that is not registered is
  // invisible to the predicate; a registered one that has no German is a
  // language that is not finished, whatever the catalogue says.
  it("a full catalogue with an unregistered-language bundle is not a finished language", () => {
    const catalogue = fullCatalogue();
    assert.equal(isComplete(catalogue), true, "the fixture is not a catalogue problem");

    const englishOnly: ContentBundle<string> = { en: "a station nobody translated" };

    assert.equal(bundlesComplete("de", [englishOnly]), false);
    assert.equal(languageComplete("de", [englishOnly]), false);
  });

  it("a bundle that carries the language does not hold it back", () => {
    const both: ContentBundle<string> = { en: "station", de: "Station" };

    assert.equal(bundlesComplete("de", [both]), true);
    assert.equal(languageComplete("de", [both]), true);
    // French is still missing from the same bundle, and still empty in the
    // catalogue — two independent reasons, and either one is enough.
    assert.equal(bundlesComplete("fr", [both]), false);
  });

  // ENGLISH CANNOT BE INCOMPLETE. It is the shape the others fill, and a bundle
  // without an `en` entry does not compile — so this is a statement about the
  // type as much as about the function.
  it("English is finished by construction", () => {
    const englishOnly: ContentBundle<string> = { en: "x" };

    assert.equal(languageComplete("en", [englishOnly]), true);
  });

  // THE STATE OF THE THREE, TODAY, AGAINST THE REAL REGISTER RATHER THAN A
  // FIXTURE. Every test above hands in its own bundle list; this one asks the
  // question the app asks, with `BUNDLES` as it is shipped.
  it("English and German are finished and French is not", () => {
    assert.deepEqual(
      LOCALES.map((locale) => [locale, languageComplete(locale)]),
      [
        ["en", true],
        ["de", true],
        ["fr", false],
      ],
    );
  });
});

describe("resolveContent", () => {
  it("gives the route's language when the bundle has it", () => {
    const bundle: ContentBundle<string> = { en: "station", de: "Station" };

    assert.deepEqual(resolveContent(bundle, "de"), { value: "Station", resolved: "de" });
  });

  // THE SAME SHAPE `resolveMessages` RETURNS, and for the same reason: the
  // second value is what the block puts on its `lang` attribute. English, not
  // nothing, and not a half-filled object.
  it("falls back to English and says so", () => {
    const bundle: ContentBundle<string> = { en: "station" };

    assert.deepEqual(resolveContent(bundle, "fr"), { value: "station", resolved: "en" });
  });
});

describe("the dictionary follows the whole predicate", () => {
  it("serves German on /de and English on /fr today", () => {
    assert.equal(resolveMessages("de").resolved, "de");
    assert.equal(resolveMessages("fr").resolved, "en");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every translation module on disk, as paths relative to `web/`.
 *
 * A BUNDLE MODULE IS NAMED `*.de.ts` OR `*.fr.ts`, which is U8a's shape: the
 * translation sits beside the module it translates rather than in a directory
 * of its own. `messages/de.ts` and `messages/fr.ts` are the catalogue and are
 * excluded by name — they are not bundles, they are what `isComplete` reads.
 */
function translationModules(root: string, base = root): string[] {
  const found: string[] = [];

  for (const name of readdirSync(root)) {
    if (name === "node_modules" || name.startsWith(".")) continue;

    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      found.push(...translationModules(full, base));
      continue;
    }

    if (/\.(de|fr)\.ts$/.test(name) && !/messages[/\\](de|fr)\.ts$/.test(relative(base, full))) {
      found.push(relative(base, full));
    }
  }

  return found;
}

describe("the bundle register has no holes", () => {
  // THE WALKER IS TESTED BEFORE IT IS TRUSTED, because today it finds nothing
  // and a walker that found nothing because it was broken would look identical.
  // One fixture directory, one file that must be found and one that must not.
  it("finds a translation module and ignores the catalogue", () => {
    const dir = mkdtempSync(join(tmpdir(), "u8-bundles-"));
    writeFileSync(join(dir, "trajectory.de.ts"), "export const x = 1;\n");
    writeFileSync(join(dir, "trajectory.ts"), "export const x = 1;\n");

    assert.deepEqual(translationModules(dir), ["trajectory.de.ts"]);
  });

  // THE REGISTER AGAINST THE DISK. `BUNDLES` holds objects, not paths — there is
  // no second copy of a filename anywhere — so the check is by identity: every
  // value a translation module exports has to BE one of the entries a
  // registered bundle carries.
  it("every translation module on disk is reachable from BUNDLES", async () => {
    const registered = new Set<unknown>();
    for (const bundle of BUNDLES) {
      for (const value of Object.values(bundle)) registered.add(value);
    }

    const orphans: string[] = [];
    for (const path of [...translationModules("lib"), ...translationModules("content")]) {
      const loaded = (await import(`../../${path}`)) as Record<string, unknown>;
      const exported = Object.values(loaded);

      if (!exported.some((value) => registered.has(value))) orphans.push(path);
    }

    assert.deepEqual(
      orphans,
      [],
      "a translation module exists that no bundle in complete.ts registers — " +
        "the predicate cannot see it, and the language it belongs to would " +
        "report itself finished without it",
    );
  });
});
