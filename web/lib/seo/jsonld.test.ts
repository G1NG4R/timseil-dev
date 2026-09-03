// The broken case is an injection, and it is the reason this file has a
// serializer at all rather than a call to JSON.stringify.

import assert from "node:assert/strict";
import test from "node:test";

import { AUTHOR, SITE_URL } from "../site.ts";
import { aboutLd, personLd, serializeLd, siteLd, webSiteLd } from "./jsonld.ts";

// THE DEFECT. An HTML parser ends a script element at the literal `</script`,
// inside a JSON string as readily as outside one. A value carrying that
// sequence closes the block early and the rest of the document is markup —
// which is why this block goes through a serializer and not through
// dangerouslySetInnerHTML with plain JSON.
void test("a value cannot close the script element it is inside", () => {
  const escaped = serializeLd({ name: "</script><img onerror=alert(1)>" });

  assert.ok(!escaped.includes("</script"), "the block can be closed from inside a value");
  assert.ok(!escaped.includes("<"), "a raw angle bracket reached the document");
  assert.ok(!escaped.includes(">"), "a raw angle bracket reached the document");
  // And it is still the same string once decoded — escaping must not change
  // what a reader gets, only what a parser sees.
  assert.equal(
    (JSON.parse(escaped) as { name: string }).name,
    "</script><img onerror=alert(1)>",
  );
});

void test("an ampersand is escaped too, and the value survives it", () => {
  const escaped = serializeLd({ jobTitle: "Backend & DevOps Engineer" });
  assert.ok(!escaped.includes("&"));
  assert.equal(
    (JSON.parse(escaped) as { jobTitle: string }).jobTitle,
    "Backend & DevOps Engineer",
  );
});

// The graph is one document with two nodes that name each other. If the ids
// drift apart the two nodes are simply unrelated, and nothing says so.
void test("the website and the person are joined by one id", () => {
  const graph = siteLd("en")["@graph"] as Record<string, unknown>[];

  assert.equal(graph.length, 2);
  assert.equal(graph[0]["@type"], "Person");
  assert.equal(graph[1]["@type"], "WebSite");
  assert.deepEqual(graph[1].author, { "@id": graph[0]["@id"] });
  assert.deepEqual(graph[1].publisher, { "@id": graph[0]["@id"] });
});

// Every claim in the graph has to come from lib/site.ts, which is the file that
// says what is true about this site. A literal here would be a second answer.
void test("the person is the one lib/site.ts names", () => {
  const person = personLd();
  assert.equal(person.name, AUTHOR.name);
  assert.equal(person.email, `mailto:${AUTHOR.email}`);
  assert.deepEqual(person.sameAs, [AUTHOR.github]);
  assert.equal(person.url, `${SITE_URL}/`);
});

// WHAT MUST NOT BE IN THERE. A SearchAction tells Google there is a search
// endpoint; this site has none until H9, and a query URL that answers 404 is
// the machine-readable form of an invented number.
void test("the graph claims no search, no photograph, no address", () => {
  const serialized = serializeLd(siteLd("en"));

  for (const absent of ["SearchAction", "potentialAction", "image", "address"]) {
    assert.ok(!serialized.includes(absent), `the graph claims ${absent}`);
  }
});

// inLanguage is the language the TEXT is in, not the language the route is
// named after. Today all three routes serve English, and the graph has to say
// so — a `/de` page claiming `de` while showing English is the half page the
// sheet forbids, restated for a machine.
void test("inLanguage is whatever it is handed, so it can follow the strings", () => {
  assert.equal(webSiteLd("en").inLanguage, "en");
  assert.equal(webSiteLd("de").inLanguage, "de");
});

// ── H7 · the profile block on /about ───────────────────────────────────────
//
// THE ONE THING A TYPE CANNOT CATCH HERE: every field is a string, so a
// relative path and an absolute URL are the same shape. Next resolves a
// relative canonical against `metadataBase` on the way out; nothing resolves a
// JSON-LD document, and a crawler reads the characters it finds. The first
// rendered block on this page said `"url": "/about"`, and it was found by
// looking at the page rather than by the compiler.
void test("the profile is absolute, at the path it was handed", () => {
  const graph = aboutLd("en", "/about")["@graph"] as Record<string, unknown>[];
  const profile = graph[1];

  assert.equal(profile["@type"], "ProfilePage");
  assert.equal(profile.url, `${SITE_URL}/about`);
  assert.equal(profile["@id"], `${SITE_URL}/about#profile`);

  const de = aboutLd("de", "/de/about")["@graph"] as Record<string, unknown>[];
  assert.equal(de[1].url, `${SITE_URL}/de/about`);
});

// THE PERSON IS REPEATED AND THE `@id` IS NOT A SECOND ONE. A crawler reads one
// page at a time, so `mainEntity` pointing at an `@id` defined only on `/`
// would be a reference into nothing — invariant 5 in the machine-readable half
// of the site. Repeating the node is right; minting a second identity for the
// same person would not be.
void test("the profile points at the same person the homepage names", () => {
  const graph = aboutLd("en", "/about")["@graph"] as Record<string, unknown>[];

  assert.equal(graph[0]["@type"], "Person");
  assert.equal(graph[0]["@id"], personLd()["@id"]);
  assert.deepEqual(graph[1].mainEntity, { "@id": personLd()["@id"] });
});

// The same absence the site graph is held to, one page over. There is still no
// photograph of the operator in this repository, and a ProfilePage is exactly
// the block that would be tempted to invent one.
void test("the profile claims no photograph and no address", () => {
  const serialized = serializeLd(aboutLd("en", "/about"));

  for (const absent of ["image", "address", "SearchAction"]) {
    assert.ok(!serialized.includes(absent), `the profile claims ${absent}`);
  }
});
