import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CASE_STUDIES, caseStudyFor } from "../content/case-studies/index.ts";
import { AUTHOR, SITE_NAME, SITE_SYSTEM_SLUG, SITE_URL } from "./site.ts";

describe("the site knows which system it is", () => {
  // The slug is written here and the case study is written there, and this is
  // the seam between them: the homepage strip reads SITE_SYSTEM_SLUG and the
  // case study route reads CASE_STUDIES, and a typo in one of the two would
  // otherwise show up as an empty strip on a page whose whole claim is that it
  // measures itself.
  it("names a system this repository has written about", () => {
    assert.notEqual(caseStudyFor(SITE_SYSTEM_SLUG), null);
  });

  // The half a lookup cannot state: that the two files mean the SAME system
  // rather than two that both happen to exist.
  it("names the study whose slug matches, and there is exactly one", () => {
    const matches = CASE_STUDIES.filter((study) => study.slug === SITE_SYSTEM_SLUG);
    assert.equal(matches.length, 1);
  });

  // lib/http/url.ts refuses a path segment outside its allow-list, and it
  // refuses by throwing. A slug that cannot be asked for would take the strip
  // down with a message nobody reads, so it is checked here where a test can
  // reach it rather than at the fetch, where one cannot.
  it("is a value the upstream guard will carry", () => {
    assert.match(SITE_SYSTEM_SLUG, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("the site says the same name in the places a machine reads it", () => {
  it("keeps the host of SITE_URL and SITE_NAME together", () => {
    assert.equal(new URL(SITE_URL).hostname, SITE_NAME);
  });

  it("keeps the author's address on the site's own domain", () => {
    assert.ok(AUTHOR.email.endsWith(`@${SITE_NAME}`));
  });
});
