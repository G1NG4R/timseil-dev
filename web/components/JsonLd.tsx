// The second inline script on the site, and the second one that has to be.
//
// A `<script type="application/ld+json">` is not executed — the type is one no
// browser runs, so the element is a data block that happens to be spelled like
// a script. It is inline because that is the only form the format has: there is
// no `src` convention crawlers follow, and a separate request for it would be
// one nobody makes.
//
// THE NONCE IS A PROP THAT NOBODY PASSES YET, exactly as in ThemeScript.tsx,
// and for the same reason rather than by imitation. L4 is where the CSP is born
// (build plan line 1325); it will mint a nonce in proxy.ts and hand it down.
// Reading it here today would mean `headers()` in the tree, and that takes the
// page out of the static pass — the shell G4 prerendered and G5 kept. So the
// seam exists, is named, and stays unbound. ADR 0043.
//
// Worth saying once, because it is the difference from ThemeScript: a
// nonce-based CSP does NOT block this element even without a nonce, because
// `script-src` governs execution and nothing here executes. The prop is here so
// that a future CSP written with `require-trusted-types-for` or a strict
// `script-src` that refuses the element outright has somewhere to attach — not
// because today's absence is a defect.

import { serializeLd } from "@/lib/seo/jsonld";

export function JsonLd({ data, nonce }: { data: unknown; nonce?: string }) {
  // The content is JSON this repository built from its own constants, put
  // through a serializer that escapes the three characters an HTML parser is
  // entitled to act on — `</script` inside a value would otherwise end the
  // element and turn the rest of it into markup. lib/seo/jsonld.ts holds that
  // function, under test, rather than a `.replace()` chain in this file.
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializeLd(data) }}
    />
  );
}
