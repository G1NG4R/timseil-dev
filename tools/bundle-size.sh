#!/bin/sh
# What a visitor downloads to run the site, in three numbers.
#
#   tools/bundle-size.sh [repo-root]     default: .
#
# THE BUDGET IS TWO NUMBERS, NOT ONE, and that is the point of this file. The
# build plan asks for "Initial JS < 150 KB gzip" (L8), and when that was
# measured for the first time in G7 the answer was 143 KB — of which 134 KB is
# React, ReactDOM, the RSC client and the App Router runtime. Framework we do not
# write and cannot shrink. A budget that mixes the two cannot be acted on: it
# goes red for a reason nobody here caused, and it stays green while our own half
# doubles. So this prints both, and ADR 0050 gives each its own limit.
#
# WHY IT MEASURES RATHER THAN GUESSES. The numbers come out of Next's own
# bookkeeping, never out of a filename pattern:
#
#   build-manifest.json  polyfillFiles  the noModule polyfill, which a browser
#                                       that understands modules never fetches
#                        rootMainFiles  the framework bootstrap chunks
#   page_client-reference-manifest.js   which client MODULE sits in which chunk,
#                                       written by the compiler itself
#
# A chunk is ours if at least one module in it is not under node_modules. A chunk
# that holds both is not classified but REFUSED — see the mixed case below.
#
# IT BUILDS EVERY TIME, and there is no flag to skip it. A stale `.next` is older
# than the tree that produced it, and a quietly outdated number here is worse
# than twenty seconds of waiting. G2, G3 and G7 all measured this by hand with
# `rm -rf .next` in front, and two of the three still produced a wrong number
# once — that is the incident this file exists for.
#
# NOT part of `make check`: it needs a build, and `check` does not build.
set -eu

root=${1:-.}
web=$root/web
next=$web/.next

# Budgets, from ADR 0050. Bytes, gzip, per file — the same shape the numbers are
# measured in below. They are CONSTANTS on purpose: deriving the own-code limit
# from `TOTAL - framework` at run time would let a Next release quietly widen or
# narrow what we are allowed to write, which is the coupling the split removes.
BUDGET_TOTAL=150000
BUDGET_OWN=15903

fail=0
say()  { printf '  %s\n' "$1"; }
die()  { printf '  ✗ %s\n' "$1"; exit 1; }

for cmd in npm gzip jq; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed"
done
[ -d "$web/node_modules" ] || die "$web/node_modules is missing — run: make deps"

# ---------------------------------------------------------------- the build
printf '  building (this is not cached, on purpose)\n'
( cd "$web" && rm -rf .next && NEXT_TELEMETRY_DISABLED=1 npm run build >/dev/null 2>&1 ) \
  || die "npm run build failed — run it yourself to see why"

# `/` never has a document of its own: proxy.ts rewrites it onto `/en`, because
# English carries no prefix while the route tree lives under app/[lang]/
# (ADR 0046). So the prerendered HTML for the home page is en.html, and anyone
# measuring [lang].html is measuring the wrong one.
html=$next/server/app/en.html
manifest=$next/build-manifest.json
rsc="$next/server/app/[lang]/page_client-reference-manifest.js"

for f in "$html" "$manifest" "$rsc"; do
  [ -f "$f" ] || die "$f is missing — the build did not produce what this reads"
done

# ---------------------------------------------------------------- the inputs
# Every script the document asks for, as a path under .next/.
srcs=$(grep -o '<script[^>]*src="/_next/[^"]*"' "$html" \
       | sed 's/.*src="\/_next\///; s/"$//' | sort -u)
[ -n "$srcs" ] || die "no <script src> found in $html"

polyfills=$(jq -r '.polyfillFiles[]?' "$manifest")
roots=$(jq -r '.rootMainFiles[]?' "$manifest")

# The RSC manifest is one assignment on one line. Two cuts make it JSON — no
# `eval` and no `new Function()`, for the same reason the terminal refuses them:
# there is no need to execute a file to read a value out of it.
# Cut at the first `{` rather than matching the assignment: the route key is
# `["/[lang]/page"]`, whose own brackets defeat the obvious pattern — which cost
# one run to notice.
modules=$(grep 'clientModules' "$rsc" \
          | sed 's/^[^{]*//; s/;[[:space:]]*$//' \
          | jq -r '.clientModules | to_entries[] | .value.chunks[]? as $c | "\(.key)\t\($c)"' \
          | sed 's|\t/_next/|\t|')

# ---------------------------------------------------------------- classify
framework_total=0
own_total=0
framework_files=0
own_files=0

for src in $srcs; do
  case "$polyfills" in *"$src"*) continue ;; esac    # a modern browser skips it

  file=$next/$src
  [ -f "$file" ] || die "$src is referenced by the document and not on disk"
  size=$(gzip -9 -c "$file" | wc -c)

  kind=""
  case "$roots" in *"$src"*) kind=framework ;; esac

  if [ -z "$kind" ]; then
    owned=0; vendored=0
    for mod in $(printf '%s\n' "$modules" | awk -F'\t' -v c="$src" '$2 == c { print $1 }'); do
      case "$mod" in
        *node_modules/*) vendored=1 ;;
        *)               owned=1 ;;
      esac
    done
    # A chunk carrying both would make either answer a lie. Stage H can produce
    # one by putting a page component next to a framework import; better loud
    # here than a quietly wrong total.
    if [ "$owned" = 1 ] && [ "$vendored" = 1 ]; then
      die "$src holds framework and our own modules — the split no longer holds"
    fi
    [ "$owned" = 1 ] && kind=own
    [ "$vendored" = 1 ] && kind=framework
  fi

  [ -n "$kind" ] || die "$src is in no manifest — it cannot be attributed"

  if [ "$kind" = own ]; then
    own_total=$((own_total + size)); own_files=$((own_files + 1))
  else
    framework_total=$((framework_total + size)); framework_files=$((framework_files + 1))
  fi
done

total=$((framework_total + own_total))

# ---------------------------------------------------------------- the report
say "framework    $(printf '%7d' "$framework_total") B  $framework_files files — watched, never budgeted"
say "our code     $(printf '%7d' "$own_total") B  $own_files file(s)"

if [ "$own_total" -le "$BUDGET_OWN" ]; then
  say "✓ our code   $own_total B of $BUDGET_OWN B ($((BUDGET_OWN - own_total)) B left)"
else
  say "✗ our code   $own_total B of $BUDGET_OWN B — over by $((own_total - BUDGET_OWN)) B"
  fail=1
fi

if [ "$total" -le "$BUDGET_TOTAL" ]; then
  say "✓ total      $total B of $BUDGET_TOTAL B ($((BUDGET_TOTAL - total)) B left)"
else
  say "✗ total      $total B of $BUDGET_TOTAL B — over by $((total - BUDGET_TOTAL)) B"
  fail=1
fi

[ "$fail" -eq 0 ] || {
  printf '    → ADR 0050: the framework is watched, our own code is the budget.\n'
  exit 1
}
