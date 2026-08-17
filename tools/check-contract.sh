#!/bin/sh
# The contract is public from launch, so a mistake here is a mistake somebody else
# already wrote a script against. Four rules:
#
#   1. It validates as OpenAPI 3.1, in both views — `full` for the generators,
#      `public` for the document readers get.
#
#   2. The public bundle carries nothing internal. /api/internal/* has to be in the
#      contract (C7 needs the types, E2 checks router parity against it) and must not
#      be in what /api/docs serves. That is the whole reason for the filter-out
#      decorator, and this is the assertion that it worked. Paths are not enough:
#      leftover schemas would publish the shape of the internal payloads.
#
#   3. Every operation marked x-internal declares a security scheme. Marking one
#      hidden without protecting it hides it from the reader, not from an attacker.
#
#   4. The embedded copy matches the bundle. go:embed cannot reach outside its own
#      directory, so `make gen` copies the bundle into the Go package; a stale copy
#      would serve last week's contract from a fresh binary.
#
# Redocly comes from web/node_modules, which is why this runs from web/ with the
# config passed explicitly.
set -eu

spec=contract/openapi.yaml
public=contract/openapi.public.yaml
embedded=api/internal/httpx/assets/openapi.yaml

if [ ! -f "$spec" ]; then
  printf '  – skip: %s does not exist yet\n' "$spec"
  exit 0
fi

fail=0

bad() {
  printf '  ✗ %s\n' "$1"
  fail=1
}

# ---------------------------------------------------------------- 1. validates

if [ ! -x web/node_modules/.bin/redocly ]; then
  bad 'redocly is not installed'
  printf '    → cd web && npm ci\n'
else
  for view in full public; do
    if out=$(cd web && npx --no-install redocly lint "$view" --config ../redocly.yaml 2>&1); then
      printf '  ✓ %s validates\n' "$view"
    else
      bad "$view does not validate"
      printf '%s\n' "$out" | sed 's/^/    /'
    fi
  done
fi

# ------------------------------------------------------- 2. nothing internal leaks

if [ ! -f "$public" ]; then
  bad "$public is missing — run make gen"
else
  # "- name: internal" is the tag. filter-out drops the operations but leaves the
  # tag definition behind unless it carries the marker too, and an empty section
  # headed "internal" announces exactly what it is meant to hide.
  leaked=''
  for needle in /api/internal x-internal internalToken ProbeReport DeployReport '- name: internal'; do
    if grep -qF -- "$needle" "$public"; then
      leaked="$leaked $needle"
    fi
  done

  if [ -n "$leaked" ]; then
    bad "the public bundle leaks:$leaked"
    printf '    → the filter-out decorator in redocly.yaml did not apply; run make gen\n'
  else
    printf '  ✓ public bundle carries nothing internal\n'
  fi
fi

# --------------------------------------------------- 3. hidden means authenticated

# Six spaces is operation level: paths → /path → method → key. Anchoring there
# skips the rule's own explanation in the contract header and the tag definition,
# which carries the marker for the filter but has nothing to authenticate.
marked=$(grep -cE '^ {6}x-internal: true$' "$spec" || true)
secured=$(grep -cE '^ {8}- internalToken: \[\]$' "$spec" || true)

if [ "$marked" -ne "$secured" ]; then
  bad "$marked operations marked x-internal but $secured declare internalToken"
  printf '    → hiding an endpoint from the docs is not protecting it. Add:\n'
  printf '        security:\n          - internalToken: []\n'
else
  printf '  ✓ %s internal operations, all authenticated\n' "$marked"
fi

# --------------------------------------------------- 4. embedded copy is current

if [ ! -f "$embedded" ]; then
  bad "$embedded is missing — run make gen"
elif [ -f "$public" ] && ! cmp -s "$public" "$embedded"; then
  bad 'the embedded document differs from the bundle'
  printf '    → run make gen and commit the result\n'
else
  printf '  ✓ embedded document matches the bundle\n'
fi

[ "$fail" -eq 0 ] || exit 1
