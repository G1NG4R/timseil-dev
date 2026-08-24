#!/bin/sh
# F2's acceptance, and it is two claims rather than one.
#
#   tools/check-observability.sh            metrics and logs arrive
#   tools/check-observability.sh --flood    ...and the limit trips first
#
# The build plan asks for "Metriken und Logs laufen ein; ein künstlich erzeugtes
# 5-GB-Log löst das Limit aus, statt die Platte zu füllen". The second half is
# separate because it writes gigabytes: it belongs in a run somebody chose,
# never in `make check`.
#
# WHAT THE FLOOD ACTUALLY PROVES, stated before it runs so the number is not
# read as more than it is. Loki has no size-based retention — ops/loki/loki.yaml
# carries that correction in full. What trips is the per-stream ingestion limit,
# and that is the mechanism the build plan's own sentence is about: a loop that
# "füllt in Stunden Gigabytes" is a RATE, and a rate limit is what answers it.
# A flood sustained for days is a different threat and belongs to F10's disk
# alert. This run measures the first and says nothing about the second.
#
# NOT part of `make check`: it needs Docker and a running stack, like
# check-topology and check-db. `make check-compose` checks the recipe.
set -eu

flood=0
case ${1-} in
  --flood) flood=1 ;;
  "") ;;
  *) printf 'usage: %s [--flood]\n' "$0" >&2; exit 2 ;;
esac

COMPOSE="docker compose -f compose.yaml"
fail=0
ok() { printf '  ✓ %s\n' "$1"; }
no() { printf '  ✗ %s\n' "$1"; fail=1; }

printf 'observability\n'

# The three containers. Named here rather than derived, because the point of the
# list is that it is the one this phase promised.
for s in prometheus loki alloy; do
  cid=$($COMPOSE ps -q "$s" 2>/dev/null || true)
  [ -n "$cid" ] || { no "$s is not running — start it with: make prod"; exit 1; }
done

# An HTTP client that lives INSIDE the docker network, because that is the only
# place these three answer from. Using curl from the host would need a published
# port, which is the one thing this stack must never have.
inside() { $COMPOSE exec -T prometheus wget -q -O - --timeout=10 "$1"; }

# ------------------------------------------------------------------ the shape
#
# Written down, then measured — the same order ADR 0027 §3a used. A limit in a
# file is an intention; docker inspect is where it becomes a fact.
for s in prometheus loki alloy; do
  cid=$($COMPOSE ps -q "$s")
  mem=$(docker inspect "$cid" --format '{{.HostConfig.Memory}}')
  cpu=$(docker inspect "$cid" --format '{{.HostConfig.NanoCpus}}')
  [ "$mem" != "0" ] && [ "$cpu" != "0" ] \
    || no "$s has no memory or cpu limit applied"
  ports=$(docker inspect "$cid" --format '{{json .NetworkSettings.Ports}}')
  case "$ports" in *'"HostPort"'*) no "$s publishes a port: $ports" ;; esac
done
[ "$fail" = 0 ] && ok "limits applied, no published port, on all three"

# The trust boundary, measured. prometheus and loki are reachable from the
# borrowed Grafana and from nowhere else; alloy is reachable from neither.
for s in prometheus loki; do
  nets=$(docker inspect "$($COMPOSE ps -q $s)" \
    --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
  case " $nets" in *" observability-network "*) ;;
    *) no "$s is not in observability-network — grafana cannot reach it: $nets" ;; esac
  case " $nets" in *" dokploy-network "*)
    no "$s is in dokploy-network — that one is shared with every app on the host" ;; esac
done
nets=$(docker inspect "$($COMPOSE ps -q alloy)" \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
case " $nets" in *" observability-network "*|*" dokploy-network "*)
  no "alloy reaches past the default network: $nets" ;; esac
ok "prometheus and loki are in the grafana seam, alloy is in neither"

# ---------------------------------------------------------------- the metrics
targets=$(inside 'http://localhost:9090/api/v1/targets?state=active')
printf '%s' "$targets" | python3 -c '
import json, sys
d = json.load(sys.stdin)["data"]["activeTargets"]
want = {"prometheus", "alloy", "loki"}
have = {t["labels"]["job"]: t["health"] for t in d}
missing = want - set(have)
down = {j: h for j, h in have.items() if h != "up"}
if missing: print("missing:", ", ".join(sorted(missing))); sys.exit(1)
if down:    print("not up:", ", ".join(f"{j}={h}" for j, h in sorted(down.items()))); sys.exit(1)
' >/tmp/obs.$$ 2>&1 && ok "prometheus scrapes itself, alloy and loki — all up" \
  || no "scrape targets: $(cat /tmp/obs.$$)"
rm -f /tmp/obs.$$

# ------------------------------------------------------------------- the logs
#
# The service label is the whole label set that names a producer, so its values
# answer two questions at once: did anything arrive, and did the project filter
# in ops/alloy/config.alloy hold. A neighbouring app's container showing up here
# is not noise — it is our disk paying for somebody else's logs.
#
# api2 AND web2 ARE OURS, and the first run against production said otherwise.
# They are the rollout twins: they exist only while a deploy is overlapping, they
# log while they serve, and their lines stay for the retention window after the
# containers are gone. Calling them foreign would point at the neighbouring stack
# for something this repository does on purpose — and their lines are precisely
# what one wants to read when a rollout goes wrong.
#
# loki IS ALLOWED TO BE ABSENT, which is why `need` does not ask for it. Our
# loki.yaml sets log_level: warn on purpose (see the comment there — a chattier
# Loki would have Alloy shipping Loki's account of storing Alloy's lines). A
# healthy, quiet Loki therefore writes nothing for hours, and this endpoint only
# looks back six. Requiring it here would go red for being well behaved.
labels=$(inside 'http://loki:3100/loki/api/v1/label/service/values')
printf '%s' "$labels" | python3 -c '
import json, sys
vals = set(json.load(sys.stdin).get("data") or [])
ours = {"db", "migrate", "seed", "api", "web", "prometheus", "loki", "alloy", "flood", "api2", "web2"}
need = {"api", "web", "db"}
if not vals: print("no service labels at all — alloy discovered nothing"); sys.exit(1)
if need - vals: print("no lines from:", ", ".join(sorted(need - vals))); sys.exit(1)
if vals - ours: print("foreign services in our loki:", ", ".join(sorted(vals - ours))); sys.exit(1)
print(" ".join(sorted(vals)))
' >/tmp/obs.$$ 2>&1 && ok "loki holds $(cat /tmp/obs.$$)" \
  || no "loki labels: $(cat /tmp/obs.$$)"
rm -f /tmp/obs.$$

# -------------------------------------------------- and the timestamp, twice
#
# THE OPEN POINT FROM F1a, closed here. Go writes RFC 3339 with nanoseconds,
# Node with milliseconds; the pipeline has to store BOTH as the time in the line
# rather than the time of ingest. Without stage.timestamp both containers'
# accounts of one request drift apart by however long the collector took.
#
# Measured against the real producers rather than a fixture: whatever the api
# and the web actually wrote is what has to come back.
#
# One request first, because web logs what web DOES. It writes no access line —
# proxy.ts runs before the response exists — so on an idle stack its most recent
# lines are Next.js's own startup banner, which is not JSON and carries no time
# field. Without this the run would be green or red depending on whether anybody
# had visited, and a test that depends on that measures the visitor.
inside 'http://web:3000/' >/dev/null 2>&1 || true
sleep 8

since=$(( $(date +%s) - 3600 ))000000000
for s in api web; do
  q="http://loki:3100/loki/api/v1/query_range?limit=5&direction=backward&start=$since&query=%7Bservice%3D%22$s%22%7D"
  inside "$q" | python3 -c '
import json, sys, datetime
svc = sys.argv[1]
streams = json.load(sys.stdin)["data"]["result"]
for st in streams:
    for ts, line in st["values"]:
        try:
            written = json.loads(line).get("time")
        except ValueError:
            continue
        if not written: continue
        want = int(datetime.datetime.fromisoformat(written.replace("Z", "+00:00")).timestamp() * 1e9)
        # Nanosecond parity is not the claim — RFC 3339 with milliseconds cannot
        # carry it. Within a second of the written time proves the stored value
        # came from the LINE and not from the clock at ingest.
        if abs(int(ts) - want) < 1_000_000_000:
            print(written); sys.exit(0)
        print(f"stored {ts} for a line written at {written}"); sys.exit(1)
print("no json line with a time field"); sys.exit(1)
' "$s" >/tmp/obs.$$ 2>&1 && ok "$s: the stored timestamp is the one in the line ($(cat /tmp/obs.$$))" \
    || no "$s timestamp: $(cat /tmp/obs.$$)"
  rm -f /tmp/obs.$$
done

[ "$flood" = 1 ] || { [ "$fail" = 0 ] && printf '  ✓ tools/check-observability.sh\n'; exit "$fail"; }

# ------------------------------------------------------------------ the flood
#
# Five gigabytes of log line, written as fast as the shell can write it, from a
# container that carries this project's compose labels so that alloy discovers
# it the way it discovers everything else.
#
# --log-opt caps the LOCAL json-file at 20 MB. Without it this run would fill
# the very disk it exists to prove is protected, which would be a funny way to
# fail. The lines still stream past alloy live; rotation does not interrupt a
# follower.
project=$(docker inspect "$($COMPOSE ps -q api)" \
  --format '{{index .Config.Labels "com.docker.compose.project"}}')
net="${project}_default"
before=$(inside 'http://loki:3100/metrics' | awk '/^loki_discarded_samples_total/ {s+=$2} END {printf "%d", s+0}')

printf '  · flooding — 5 GB from one stream, alloy is watching\n'
start=$(date +%s)
docker run --rm --network "$net" \
  --label com.docker.compose.project="$project" \
  --label com.docker.compose.service=flood \
  --log-opt max-size=10m --log-opt max-file=2 \
  alpine:3 sh -c 'yes "$(head -c 900 /dev/zero | tr "\0" "x")" | head -c 5000000000' \
  >/dev/null 2>&1 || true
elapsed=$(( $(date +%s) - start ))

# The counters need a scrape and a push cycle to catch up with what just
# happened; asking immediately measures the question, not the answer.
sleep 30

after=$(inside 'http://loki:3100/metrics' | awk '/^loki_discarded_samples_total/ {s+=$2} END {printf "%d", s+0}')
discarded=$(( after - before ))
[ "$discarded" -gt 0 ] \
  && ok "the limit tripped: $discarded samples discarded in ${elapsed}s" \
  || no "5 GB went in and loki discarded nothing — the limit did not hold"

size=$(docker run --rm -v timseil_loki-data:/d alpine:3 du -sm /d | awk '{print $1}')
[ "$size" -lt 512 ] \
  && ok "loki-data is ${size} MB after 5 GB of input" \
  || no "loki-data grew to ${size} MB — the rate limit did not bound the disk"

# The process this whole file exists to protect. A disk guard that lets the
# database stop accepting writes has guarded nothing.
$COMPOSE exec -T db pg_isready >/dev/null 2>&1 \
  && ok "postgres still accepts connections" \
  || no "postgres stopped answering during the flood"

[ "$fail" = 0 ] && printf '  ✓ tools/check-observability.sh --flood\n'
exit "$fail"
