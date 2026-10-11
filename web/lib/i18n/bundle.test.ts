// The one thing this module has to keep being: small.
//
// `bundle.ts` exists because `complete.ts` imports all three catalogues and
// `app/[lang]/error.tsx` is a client component. That reasoning is a byte count,
// and a byte count is exactly the kind of reason a later edit undoes without
// noticing — one convenient `import { en } from "./messages/en.ts"` and the
// error chunk carries every word on the site again.
//
// SO THE TEST IS THE IMPORT LIST, READ OFF DISK. Not the behaviour: the
// behaviour of `resolveContent` is asserted in complete.test.ts, where it was
// written, and moving those assertions here would be a second copy of the
// answer.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveContent } from "./bundle.ts";

describe("the module a client component is allowed to import", () => {
  it("imports one type and nothing else", () => {
    // THE COMMENTS GO FIRST, and the first run of this test is why: the header
    // of `bundle.ts` quotes the import it warns against, so a plain match found
    // `./complete.ts` in a sentence that says not to write it.
    const source = readFileSync("lib/i18n/bundle.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual(imports, ["./routes.ts"]);
  });

  // THE RE-EXPORT IS PART OF THE PROMISE. complete.ts says a caller does not
  // have to know the split exists; if that re-export is dropped, every page
  // written against the old path breaks at once, and this says so first.
  it("is the same function complete.ts hands out", async () => {
    const complete = (await import("./complete.ts")) as { resolveContent: unknown };

    assert.equal(complete.resolveContent, resolveContent);
  });
});
