// The broken case is an injection, and it is the reason this file has a
// serializer at all rather than a call to JSON.stringify.

import assert from "node:assert/strict";
import test from "node:test";

import { AUTHOR, SITE_URL } from "../site.ts";
import { aboutLd, collectionLd, personLd, serializeLd, siteLd, webSiteLd } from "./jsonld.ts";

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

// WHAT MUST NOT BE IN THERE. A SearchAction tells a crawler there is a search
// endpoint it can call with a query. H9b built a search and this assertion did
// not change: the log's search is a filter inside one prerendered page, with no
// query URL to name — every URL this site could offer would answer with the
// unfiltered index.
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

// ── H9b · #322, and it is one decision for two lists ────────────────────────

const ENTRIES = [
  { name: "The witness that was turned away", path: "/blog/023-the-witness-that-was-turned-away" },
  { name: "The frontmatter nothing had ever read", path: "/blog/022-the-frontmatter-nothing-had-ever-read" },
];

/** The `CollectionPage` node out of the graph, so the tests below read plainly. */
function pageOf(data: Record<string, unknown>): Record<string, unknown> {
  const graph = data["@graph"];
  assert.ok(Array.isArray(graph));
  return graph[0] as Record<string, unknown>;
}

function listOf(data: Record<string, unknown>): Record<string, unknown> {
  return pageOf(data).mainEntity as Record<string, unknown>;
}

// THE BROKEN CASE, and it is the one #322 was raised about: two lists described
// by two builders come out differently and no test ever notices. So this asserts
// that the SHAPE is identical for the two callers, over different data.
void test("the log and the work index describe themselves with the same shape", () => {
  const blog = pageOf(collectionLd("en", "/blog", "Writing", ENTRIES));
  const work = pageOf(
    collectionLd("en", "/work", "Selected work", [{ name: "timseil.dev", path: "/work/timseil-dev" }]),
  );

  assert.deepEqual(Object.keys(blog), Object.keys(work));
  assert.equal(blog["@type"], work["@type"]);
  assert.deepEqual(
    Object.keys(blog.mainEntity as object),
    Object.keys(work.mainEntity as object),
  );
});

// A row with no page of its own carries a name and no url. Inventing one would
// be the machine-readable half of the site pointing at a 404 — invariant 5, and
// the reason WorkRow draws no arrow on those rows either.
void test("a row with nowhere to go carries no url", () => {
  const list = listOf(collectionLd("en", "/work", "Selected work", [
    { name: "timseil.dev", path: "/work/timseil-dev" },
    { name: "vat-check", path: null },
  ]));
  const items = list.itemListElement as Record<string, unknown>[];

  assert.equal(items[0]?.url, `${SITE_URL}/work/timseil-dev`);
  assert.ok(!("url" in (items[1] ?? {})), "a system with no page must not be given one");
  assert.equal(items[1]?.name, "vat-check");
});

void test("every url in the list is absolute, because a crawler is not on this host", () => {
  const list = listOf(collectionLd("en", "/blog", "Writing", ENTRIES));
  for (const item of list.itemListElement as Record<string, unknown>[]) {
    assert.ok(String(item.url).startsWith(`${SITE_URL}/`), `relative url: ${String(item.url)}`);
  }
});

// An ItemList is unordered by default. Both of these lists have an order that
// means something — newest first, and ORDER BY s.system_no — so the document
// says so rather than leaving a crawler to assume it does not.
void test("the order is declared and the positions are one-based", () => {
  const list = listOf(collectionLd("en", "/blog", "Writing", ENTRIES));
  assert.equal(list.itemListOrder, "https://schema.org/ItemListOrderDescending");
  assert.equal(list.numberOfItems, ENTRIES.length);
  assert.deepEqual(
    (list.itemListElement as Record<string, unknown>[]).map((item) => item.position),
    [1, 2],
  );
});

// The count is the list's own length and not a number written beside it.
void test("numberOfItems cannot disagree with the items", () => {
  for (const entries of [[], ENTRIES, [...ENTRIES, ...ENTRIES]]) {
    const list = listOf(collectionLd("en", "/blog", "Writing", entries));
    assert.equal(list.numberOfItems, (list.itemListElement as unknown[]).length);
  }
});

// The page names itself, and it says it is part of the one WebSite — the same
// `@id` the homepage defines, which is how the two lists and the profile page
// describe one site rather than four.
void test("the collection names its own canonical url and the site it belongs to", () => {
  const page = pageOf(collectionLd("de", "/de/blog", "Writing", ENTRIES));
  assert.equal(page.url, `${SITE_URL}/de/blog`);
  assert.equal(page["@id"], `${SITE_URL}/de/blog#collection`);
  assert.deepEqual(page.isPartOf, { "@id": `${SITE_URL}/#website` });
  // The language of the TEXT, which is what `getDictionary` resolved — not the
  // language the route is named after.
  assert.equal(page.inLanguage, "de");
});

// The titles in this list are prose somebody writes later, which is the case
// serializeLd's own comment was written for.
void test("a post title cannot close the script element it is inside", () => {
  const html = serializeLd(
    collectionLd("en", "/blog", "Writing", [
      { name: 'A title with </script><img> & "quotes"', path: "/blog/001-a-slug" },
    ]),
  );
  assert.ok(!html.includes("</script"), "a title closed the block");
  assert.ok(!html.includes("<img"), "a title opened an element");
});
