#!/bin/sh
# Invariant 8: no colour, no radius and no duration outside tokens.css.
#
# This is the half of the G1 acceptance criterion that reads the source. The
# other half is styles/tailwind.test.ts, which compiles the stylesheet and shows
# that `bg-blue-500` produces nothing — but no theme setting can stop someone
# writing `bg-[#ff0000]` or `style={{ color: "#0f0" }}`, and that is what this
# catches. Neither half alone is the rule.
#
# What counts as a value: a hex literal, an rgb()/hsl() literal, a border-radius
# that is not a var(), a transition or animation duration in ms or s.
#
# Comments are stripped before anything is matched. A rule that cannot be
# explained in the file it governs is a rule that gets deleted.
set -eu

# The one file that holds values. It is the definition of the invariant, not an
# exception to it.
TOKENS='web/styles/tokens.css'

# Strip /* */ across lines and whole-line // comments, keep file:line prefixes.
strip_comments() {
  awk '
    FNR == 1 { inblock = 0 }
    {
      line = $0; out = ""; i = 1
      while (i <= length(line)) {
        if (inblock) {
          p = index(substr(line, i), "*/")
          if (p == 0) { i = length(line) + 1 } else { i = i + p + 1; inblock = 0 }
        } else {
          p = index(substr(line, i), "/*")
          if (p == 0) { out = out substr(line, i); i = length(line) + 1 }
          else { out = out substr(line, i, p - 1); i = i + p + 1; inblock = 1 }
        }
      }
      sub(/^[ \t]*\/\/.*$/, "", out)
      if (out ~ /[^ \t]/) print FILENAME ":" FNR ":" out
    }
  ' "$@"
}

# Tracked files only, which is how every other check in tools/ reads the tree.
#
# *.test.ts is out: a test that proves a colour is absent has to name the
# colour, and styles/tailwind.test.ts does exactly that.
files=$(git ls-files -- web \
  | grep -E '\.(css|ts|tsx)$' \
  | grep -v -F "$TOKENS" \
  | grep -v -E '\.test\.ts$' || true)

[ -n "$files" ] || { printf '  ✓ nothing to read\n'; exit 0; }

# shellcheck disable=SC2086
body=$(strip_comments $files)

fail=0
report() {
  hits=$1
  [ -n "$hits" ] || return 0
  fail=1
  printf '  ✗ %s\n' "$2"
  printf '%s\n' "$hits" | sed 's/^/    /'
}

# A colour, written out. #fff, #0A0E14, rgb(), rgba(), hsl().
colours=$(printf '%s\n' "$body" \
  | grep -E '#[0-9a-fA-F]{3,8}([^0-9a-zA-Z]|$)|(rgba?|hsla?)\(' || true)
report "$colours" "colour outside $TOKENS — use a token, or add one to tokens.css"

# A radius that is a number rather than a token.
radii=$(printf '%s\n' "$body" \
  | grep -E 'border-radius[[:space:]]*:[[:space:]]*[^v;}]' \
  | grep -v -E 'border-radius[[:space:]]*:[[:space:]]*(0|inherit|initial)[[:space:]]*[;}]?' || true)
report "$radii" "hard-coded radius — tokens.css has --radius and --radius-dot"

# A duration that is a number rather than a token. Keyframe percentages and
# grid figures are not durations, so only the two properties that take one.
durations=$(printf '%s\n' "$body" \
  | grep -E '(transition|animation)(-duration|-delay)?[[:space:]]*:[^;}]*[0-9](ms|s)\b' || true)
report "$durations" "hard-coded duration — tokens.css has nine, --d-row to --d-decode"

[ "$fail" -eq 0 ] || {
  printf '    → invariant 8: no colour, no radius, no duration outside tokens.css.\n'
  exit 1
}

printf '  ✓ every colour, radius and duration comes from tokens.css\n'
