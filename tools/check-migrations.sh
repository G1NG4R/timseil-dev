#!/bin/sh
# The migration rules that can be checked without a database.
#
# The real proof — up, down, up, three times, against Postgres 18.6 — lives in
# `make check-db`, because it needs a running database and `make check` must
# work on a machine with no Docker. This script covers what is greppable, and
# it covers it in `make check`, on every commit.
#
# Six rules:
#
#   1. Names are 00001_lower_snake.sql, numbered without gaps. The prefix is
#      what makes lexical order and apply order the same thing.
#
#   2. Every file has an Up and a Down, and the Down actually does something.
#      A Down containing only a comment is how an irreversible migration gets
#      merged without anyone noticing.
#
#   3. Constructs that break the second cycle are refused outright: enum types
#      (DROP TYPE fails on dependent columns), roles (DROP ROLE fails while a
#      grant exists), extensions, DROP ... CASCADE and IF EXISTS in a Down
#      (both hide a wrong drop order instead of failing on it), `timestamp`
#      without a time zone, and `serial`.
#
#   4. Every index carries the query that needs it, in a comment right above.
#      That is the acceptance criterion of phase B2, made mechanical instead of
#      promised.
#
#   5. tracks has no `state` column. Invariant 2 and ADR 0003: the state of a
#      track is derived in a view, never stored. This rule outlives the phase —
#      it still holds in stage G, when nobody is thinking about B2 any more.
#      It deliberately says nothing about v_track_states, which arrives in B3.
#
#   6. The CHECK lists match the enums in the contract. That is the price of
#      choosing text + CHECK over Postgres enum types (ADR 0010), and this is
#      where it gets paid: drift breaks the build instead of rejecting a valid
#      value at three in the morning.
set -eu

dir=api/migrations
spec=contract/openapi.yaml

if [ ! -d "$dir" ]; then
  printf '  – skip: %s does not exist yet\n' "$dir"
  exit 0
fi

files=$(find "$dir" -maxdepth 1 -name '*.sql' | sort)
if [ -z "$files" ]; then
  printf '  – skip: no migrations in %s yet\n' "$dir"
  exit 0
fi

fail=0

bad() {
  printf '  ✗ %s\n' "$1"
  fail=1
}

# Everything from `--` to end of line goes. Rules 3 and 5 look for SQL, and
# prose about a timestamp in a comment is not SQL.
strip_comments() {
  sed 's/--.*$//' "$1"
}

# ------------------------------------------------------------------ 1. names

expected=1
for f in $files; do
  base=${f##*/}

  if ! printf '%s' "$base" | grep -qE '^[0-9]{5}_[a-z0-9]+(_[a-z0-9]+)*\.sql$'; then
    bad "$base is not 00001_lower_snake.sql"
    continue
  fi

  n=$(printf '%s' "$base" | cut -c1-5)
  # Strip leading zeros without letting the shell read them as octal.
  n=$(printf '%s' "$n" | sed 's/^0*//')
  [ -n "$n" ] || n=0

  if [ "$n" -ne "$expected" ]; then
    bad "$base is number $n, expected $expected — the sequence has a gap or a duplicate"
  fi
  expected=$((expected + 1))
done

[ "$fail" -eq 0 ] && printf '  ✓ %s migrations, numbered without gaps\n' "$((expected - 1))"

# ------------------------------------------------------- 2. up and a real down

for f in $files; do
  base=${f##*/}

  grep -q '^-- +goose Up' "$f"   || bad "$base has no '-- +goose Up'"
  grep -q '^-- +goose Down' "$f" || bad "$base has no '-- +goose Down'"

  # Count statement-bearing lines after the Down marker: not blank, not a
  # comment, not the marker itself.
  body=$(awk '
    /^-- \+goose Down/ { down = 1; next }
    down && !/^[[:space:]]*$/ && !/^[[:space:]]*--/ { n++ }
    END { print n + 0 }
  ' "$f")

  [ "$body" -gt 0 ] || bad "$base has an empty Down — the migration is not reversible"
done

# --------------------------------------------------- 3. constructs that do not undo

for f in $files; do
  base=${f##*/}
  sql=$(strip_comments "$f")

  printf '%s\n' "$sql" | grep -qiE 'CREATE[[:space:]]+TYPE.*AS[[:space:]]+ENUM' \
    && bad "$base creates an enum type — use text with a CHECK (ADR 0010)"

  printf '%s\n' "$sql" | grep -qiE 'CREATE[[:space:]]+EXTENSION' \
    && bad "$base creates an extension — none is needed, and it wants superuser"

  printf '%s\n' "$sql" | grep -qiE '(CREATE|DROP|ALTER)[[:space:]]+ROLE' \
    && bad "$base touches a role — roles are cluster-wide, they belong in ops/postgres/initdb (ADR 0011)"

  printf '%s\n' "$sql" | grep -qiE '^[[:space:]]*DROP[[:space:]].*CASCADE' \
    && bad "$base uses DROP ... CASCADE — it hides a wrong drop order instead of failing on it"

  printf '%s\n' "$sql" | grep -qE '\b([a-z]*)serial\b' \
    && bad "$base uses a serial type — use bigint GENERATED ALWAYS AS IDENTITY"

  # \b fails between "timestamp" and the "t" of "timestamptz", so this matches
  # the bare type and not the one we want.
  printf '%s\n' "$sql" | grep -qE '\btimestamp\b' \
    && bad "$base uses timestamp without a time zone — use timestamptz"

  # IF EXISTS is fine going up (a guard), corrosive coming down (a lie).
  #
  # This one reads the raw file, not $sql: the goose markers ARE comments, and
  # stripping them would leave nothing to tell Up from Down. Comments are cut
  # per line instead.
  awk '
    /^-- \+goose Down/ { down = 1; next }
    down {
      line = $0
      sub(/--.*$/, "", line)
      if (line ~ /IF[[:space:]]+EXISTS/) found = 1
    }
    END { exit !found }
  ' "$f" && bad "$base uses IF EXISTS in its Down — a drop that may silently do nothing is not a rollback"
done

# --------------------------------------------- 4. every index names its query

for f in $files; do
  base=${f##*/}

  # Walk the file keeping the run of comment lines directly above each
  # statement. When a CREATE INDEX turns up, that run has to mention a SELECT.
  missing=$(awk '
    /^[[:space:]]*--/          { block = block $0 " "; next }
    /^[[:space:]]*$/           { next }
    /CREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX/ {
      if (block !~ /SELECT/) { print NR }
    }
    { block = "" }
  ' "$f")

  for line in $missing; do
    bad "$base:$line creates an index with no comment naming the query that needs it"
  done
done

[ "$fail" -eq 0 ] && printf '  ✓ every index carries its query, every Down does something\n'

# ------------------------------------------------------------- 5. no tracks.state

for f in $files; do
  base=${f##*/}
  sql=$(strip_comments "$f")

  printf '%s\n' "$sql" | awk '
    /CREATE[[:space:]]+TABLE[[:space:]]+tracks[[:space:]]*\(/ { inside = 1; next }
    inside && /^\)/                                           { inside = 0 }
    inside && $1 == "state"                                   { found = 1 }
    END { exit !found }
  ' && bad "$base gives tracks a state column — states are derived, never stored (invariant 2, ADR 0003)"

  printf '%s\n' "$sql" | grep -qiE 'ALTER[[:space:]]+TABLE[[:space:]]+tracks\b.*\bstate\b' \
    && bad "$base alters tracks towards a state column — see invariant 2 and ADR 0003"
done

[ "$fail" -eq 0 ] && printf '  ✓ tracks has no state column\n'

# ------------------------------------------------ 6. CHECK lists match the contract

# Contract schema name -> the constraint that carries the same values.
enum_pairs='SystemState:systems_state_ck
DayState:ops_days_state_ck
DeployResult:deploys_result_ck
SourceReason:systems_source_reason_ck'

# Both sides come out as a sorted, comma-separated list so the comparison does
# not care about order or whitespace.
normalise() {
  tr -d "' " | tr ',' '\n' | grep -v '^$' | sort | paste -sd, -
}

if [ ! -f "$spec" ]; then
  printf '  – skip: %s does not exist, cannot compare enum values\n' "$spec"
else
  # The loop runs in a subshell, so it reports by exiting non-zero rather than
  # by setting fail — a variable set in there would not survive the pipe.
  printf '%s\n' "$enum_pairs" | while IFS=: read -r schema constraint; do
    # enum: [live, in_build, queued] on the line after the schema name.
    want=$(awk -v s="    $schema:" '
      $0 == s      { inside = 1; next }
      inside && /^    [A-Za-z]/ { inside = 0 }
      inside && /enum:/ { sub(/.*enum:[[:space:]]*\[/, ""); sub(/\].*/, ""); print; exit }
    ' "$spec" | normalise)

    # ... CONSTRAINT foo_ck CHECK (col IN ('a', 'b')) — take the last IN (...)
    # so that a leading "IS NULL OR" does not confuse it.
    have=$(grep -h "CONSTRAINT $constraint " $files 2>/dev/null \
      | sed 's/.*[Ii][Nn][[:space:]]*(//; s/).*//' | normalise)

    if [ -z "$want" ]; then
      printf '  ✗ %s has no enum in %s\n' "$schema" "$spec"
      exit 1
    fi

    # A constraint that is not there yet is not drift, and it is not this
    # script's job: `make check-db` proves each one exists by feeding it a value
    # it has to refuse. Here we only compare what is present.
    [ -n "$have" ] || continue

    if [ "$want" != "$have" ]; then
      printf '  ✗ %s drifted: contract says [%s], %s says [%s]\n' "$schema" "$want" "$constraint" "$have"
      exit 1
    fi
  done || fail=1

  [ "$fail" -eq 0 ] && printf '  ✓ four enum lists match the contract\n'
fi

[ "$fail" -eq 0 ] || exit 1
