#!/bin/sh
# F2's acceptance, and it is two claims rather than one.
#
#   tools/check-observability.sh            metrics and logs arrive
#   tools/check-observability.sh --flood    ...and the limit trips first
#   tools/check-observability.sh --metrics  ...and they add up to the three
#                                              numbers the site shows        (F3)
#   tools/check-observability.sh --snapshots ...and a dead Prometheus leaves
#                                              the page honest              (F5)
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
# WHAT --metrics ADDS, and it is one level up rather than one more item. The
# first two modes ask whether the pipe carries anything. F3's question is
# whether what it carries adds up to Metrics.p95Ms, Metrics.errorRate and
# Metrics.uptime90d — six jobs up is necessary and not sufficient, because a job
# can be up and deliver nothing, and a recording rule can evaluate and cover the
# wrong services. Both of those look healthy from every angle except this one.
#
# It runs against the LAB, not against `make prod`: the traefik job needs a
# Traefik, and the only one this repository owns is compose.lab.yaml's. Hence
# OBS_FILES — `make check-metrics` passes the lab's three files.
#
# WHAT --snapshots ADDS, and it is the acceptance criterion of F5 rather than
# another measurement. --metrics asks whether Prometheus can answer; this asks
# what the SITE does when it cannot. The build plan states it as a sentence:
# "Prometheus-Container stoppen → die Seite zeigt weiter den letzten gültigen
# Wert mit Alter, statt zu brechen oder eine Null zu erfinden." Every word of
# that is a separate way to fail — break, invent a zero, or go blank — and only
# the first one would show up in any other check.
#
# It asks over the published port rather than from inside the network, on
# purpose and twice over: it is the path a visitor takes, and the container it
# would otherwise ask from is the one this run stops.
#
# NOT part of `make check`: it needs Docker and a running stack, like
# check-topology and check-db. `make check-compose` checks the recipe.
set -eu

flood=0
metrics=0
snapshots=0
case ${1-} in
  --flood) flood=1 ;;
  --metrics) metrics=1 ;;
  --snapshots) snapshots=1 ;;
  "") ;;
  *) printf 'usage: %s [--flood|--metrics|--snapshots]\n' "$0" >&2; exit 2 ;;
esac

COMPOSE="docker compose ${OBS_FILES:--f compose.yaml}"
fail=0
ok() { printf '  ✓ %s\n' "$1"; }
no() { printf '  ✗ %s\n' "$1"; fail=1; }

printf 'observability\n'

# An HTTP client that lives INSIDE the docker network, because that is the only
# place these services answer from. Using curl from the host would need a
# published port, which is the one thing this stack must never have. Defined
# before the branch below because both halves need it.
inside() { $COMPOSE exec -T prometheus wget -q -O - --timeout=10 "$1"; }

# ------------------------------------------------------------- F5, --snapshots
#
# Its own path, before --metrics, because it is the only mode that CHANGES the
# stack: it stops Prometheus on purpose and puts it back. Everything it needs is
# api, prometheus and the lab proxy.
if [ "$snapshots" = 1 ]; then
  base=${LAB_URL:-http://127.0.0.1:8080}

  for s in prometheus api; do
    cid=$($COMPOSE ps -q "$s" 2>/dev/null || true)
    [ -n "$cid" ] || { no "$s is not running — start it with: make rolling-lab"; exit 1; }
  done

  # Prometheus goes back up whatever happens below, including a Ctrl-C. A check
  # that can leave the stack half-stopped is a check nobody runs twice.
  restore() { $COMPOSE start prometheus >/dev/null 2>&1 || true; }
  trap restore EXIT INT TERM

  # The site's own numbers, over the published port. `ops` in the health
  # response is OpsSummary, which is Metrics flattened — so the four fields are
  # at the top level of it rather than nested.
  ops() {
    curl -sS --max-time 10 "$base/api/health" | python3 -c '
import json, sys
o = json.load(sys.stdin)["ops"]
print(json.dumps([o["uptime90d"], o["p95Ms"], o["errorRate"], o["measuredAt"]]))
'
  }

  # A run is forced by restarting the api rather than by waiting out a tick:
  # internal/snapshots runs once at startup, and five minutes is not a unit a
  # check can be written in.
  force_run() {
    $COMPOSE restart api >/dev/null 2>&1 || return 1
    n=0
    while [ "$n" -lt 60 ]; do
      curl -sf --max-time 2 "$base/api/health" >/dev/null 2>&1 && return 0
      n=$((n + 1))
      sleep 1
    done
    return 1
  }

  force_run || { no "the api did not come back after a restart"; exit 1; }

  before=$(ops 2>/dev/null || true)
  printf '%s' "$before" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    print("the health endpoint answered nothing"); sys.exit(1)
uptime, p95, rate, at = json.loads(raw)
if at is None:
    print("measuredAt is null — nothing has been snapshotted. Run: make load"); sys.exit(1)
# Either number is enough to prove the copy happened; a snapshot is written
# when at least one of the two rules measured something.
if p95 is None and rate is None:
    print("both proxy numbers are null at " + at); sys.exit(1)
def show(v):
    return "null" if v is None else v
note = ""
# NOT a failure here, and saying so beats a green tick the reader has to
# interpret. uptime90d is derived from ops_days, which the external probe in F4
# fills from GitHub Actions -- a laboratory has never been probed, so the
# honest answer is null. Against production it carries a number, and the
# acceptance there is the one that proves it.
if uptime is None:
    note = "   (uptime90d comes from ops_days; a lab has no external probe)"
print("uptime90d=%s p95Ms=%s errorRate=%s at %s%s"
      % (show(uptime), show(p95), show(rate), at, note))
' >/tmp/obs.$$ 2>&1 && ok "the site serves its own measurement — $(cat /tmp/obs.$$)" \
    || { no "no snapshot to age: $(cat /tmp/obs.$$)"; rm -f /tmp/obs.$$; exit 1; }
  rm -f /tmp/obs.$$

  # THE BROKEN CASE. Stop the container the numbers come from, then force
  # another run against it.
  $COMPOSE stop prometheus >/dev/null 2>&1 \
    || { no "prometheus would not stop"; exit 1; }
  ok "prometheus stopped"

  force_run || { no "the api did not come back with prometheus down"; exit 1; }
  ok "the api starts and answers without prometheus"

  after=$(ops 2>/dev/null || true)
  if [ -z "$after" ]; then
    no "the health endpoint broke when prometheus went away"
  elif [ "$after" != "$before" ]; then
    no "the numbers changed with prometheus down"
    printf '    before %s\n' "$before"
    printf '    after  %s\n' "$after"
    printf '    a failed run wrote a row and pushed the last good measurement off the page\n'
  else
    # measuredAt is unchanged and the wall clock is not, so the age the page
    # renders has grown. That is the whole sentence: the last valid value, with
    # its age, instead of a break or an invented zero.
    ok "the same values, the same measuredAt — the page ages instead of going blank"
  fi

  # And the run said so, at WARN, once. The absence of this line would mean the
  # values survived because nothing ran at all.
  if $COMPOSE logs --tail 200 api 2>/dev/null | grep -q '"state":"not measured"'; then
    ok "the failed run is in the log"
  else
    no "no line reports the failed run — did the loop run at all?"
  fi

  $COMPOSE start prometheus >/dev/null 2>&1 || no "prometheus would not start again"
  trap - EXIT INT TERM
  ok "prometheus back up"

  [ "$fail" = 0 ] && printf '  ✓ tools/check-observability.sh --snapshots\n'
  exit "$fail"
fi

# --------------------------------------------------------------- F3, --metrics
#
# Its own path rather than three more lines at the end. The questions below are
# about Prometheus alone: loki and alloy need not be running for them, and the
# lab does not start them.
if [ "$metrics" = 1 ]; then
  cid=$($COMPOSE ps -q prometheus 2>/dev/null || true)
  [ -n "$cid" ] || { no "prometheus is not running — start it with: make rolling-lab"; exit 1; }

  # 1. EVERY job up. Not "the ones I remember": the list is read from the
  #    config, so a job added to prometheus.yml and forgotten here cannot pass
  #    by being unmentioned.
  inside 'http://localhost:9090/api/v1/targets?state=active' | python3 -c '
import json, sys
d = json.load(sys.stdin)["data"]["activeTargets"]
have = {}
for t in d:
    have.setdefault(t["labels"]["job"], t["health"])
if not have:
    print("no active targets at all"); sys.exit(1)
down = {j: h for j, h in have.items() if h != "up"}
if down:
    print("not up: " + ", ".join(f"{j}={h}" for j, h in sorted(down.items()))); sys.exit(1)
print(str(len(have)) + " jobs: " + " ".join(sorted(have)))
' >/tmp/obs.$$ 2>&1 && ok "all scrape jobs up — $(cat /tmp/obs.$$)" \
    || no "scrape targets: $(cat /tmp/obs.$$)"
  rm -f /tmp/obs.$$

  # 2. UP IS NOT DATA. A target answers 200 with an empty body and Prometheus
  #    calls that healthy. This asks each job for a series count instead, which
  #    is the difference between "the endpoint exists" and "the endpoint has
  #    something to say".
  for job in prometheus alloy loki traefik node postgres; do
    n=$(inside "http://localhost:9090/api/v1/query?query=count(%7Bjob%3D%22$job%22%7D)" \
        | python3 -c 'import json,sys
r=json.load(sys.stdin)["data"]["result"]
print(int(float(r[0]["value"][1])) if r else 0)' 2>/dev/null || echo 0)
    [ "$n" -gt 0 ] && ok "job=$job carries $n series" || no "job=$job is up and carries no series"
  done

  # 3. THE THREE NAMES F5 WILL ASK FOR. Queried exactly as F5 will query them,
  #    because a rule that evaluates is not the same claim as a rule that
  #    evaluates to something. An empty result here means the site is measured
  #    by nothing while every job is green.
  for rule in timseil:request_duration_seconds:p95_5m \
              timseil:requests:error_ratio_5m \
              timseil:service:availability_5m; do
    enc=$(printf '%s' "$rule" | sed 's/:/%3A/g')
    inside "http://localhost:9090/api/v1/query?query=$enc" | python3 -c '
import json, sys, math
res = json.load(sys.stdin)["data"]["result"]
if not res:
    print("no series — has the proxy seen a request in the last 5 minutes?"); sys.exit(1)
# 4. THE FILTER, FROM THE OTHER END. Our Prometheus scrapes the HOST proxy,
#    which routes every app on this machine. A rule series naming somebody
#    else`s service means the filter in ops/prometheus/rules/ did not hold, and
#    F5 would write a stranger`s latency onto a page claiming self-measurement.
foreign = [r["metric"].get("service", "?") for r in res
           if not r["metric"].get("service", "").startswith("timseil-")]
if foreign:
    print("foreign services in the rule: " + ", ".join(sorted(set(foreign)))); sys.exit(1)
out = []
for r in res:
    v = float(r["value"][1])
    out.append(r["metric"].get("service", "?") + "=" + ("NaN" if math.isnan(v) else format(v, ".4g")))
print(" ".join(sorted(out)))
' >/tmp/obs.$$ 2>&1 && ok "$rule → $(cat /tmp/obs.$$)" \
      || no "$rule: $(cat /tmp/obs.$$)"
    rm -f /tmp/obs.$$
  done

  [ "$fail" = 0 ] && printf '  ✓ tools/check-observability.sh --metrics\n'
  exit "$fail"
fi

# The three containers. Named here rather than derived, because the point of the
# list is that it is the one this phase promised.
for s in prometheus loki alloy; do
  cid=$($COMPOSE ps -q "$s" 2>/dev/null || true)
  [ -n "$cid" ] || { no "$s is not running — start it with: make prod"; exit 1; }
done

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
ours = {"db", "migrate", "seed", "api", "web", "prometheus", "loki", "alloy", "flood", "api2", "web2",
        # F3. Two more services this project defines, so two more producers.
        "node-exporter", "postgres-exporter",
        # LAB ONLY, and it cannot appear in production. compose.lab.yaml defines
        # a traefik; the one on the VPS belongs to Dokploy, which is a different
        # compose project, and ops/alloy/config.alloy filters on that. So a
        # `traefik` here means the lab. A production run that showed one would
        # mean the project filter had stopped working, and the label it arrived
        # under would be the least of it.
        "traefik"}
need = {"api", "web", "db"}
if not vals: print("no service labels at all — alloy discovered nothing"); sys.exit(1)
if need - vals: print("no lines from:", ", ".join(sorted(need - vals))); sys.exit(1)
if vals - ours: print("foreign services in our loki:", ", ".join(sorted(vals - ours))); sys.exit(1)
print(" ".join(sorted(vals)))
' >/tmp/obs.$$ 2>&1 && ok "loki holds $(cat /tmp/obs.$$)" \
  || no "loki labels: $(cat /tmp/obs.$$)"
rm -f /tmp/obs.$$

# HOW MANY STREAMS THAT IS, which is the other half of the same question and the
# one the build plan names for F3: "Loki-Labels sparsam". Cardinality is how a
# log store eats a disk that Postgres shares, and every distinct label
# combination is a stream with its own chunks. ops/alloy/config.alloy keeps the
# set at two labels on purpose; this is the number that says whether it held.
#
# Read from Loki's own gauge rather than counted here: it is the same number
# ops/loki/loki.yaml bounds with max_global_streams_per_user, so a threshold
# invented here would be a second opinion about a limit that already exists.
# Reported, not enforced — the limit does the enforcing, and a check that
# duplicates it would be a rule without an incident behind it.
inside 'http://localhost:9090/api/v1/query?query=loki_ingester_memory_streams' \
  | python3 -c '
import json, sys
r = json.load(sys.stdin)["data"]["result"]
if not r: print("no reading yet"); sys.exit(0)
print(int(float(r[0]["value"][1])))
' >/tmp/obs.$$ 2>&1 && ok "loki holds $(cat /tmp/obs.$$) streams — the ceiling in loki.yaml is 100" \
  || ok "stream count unavailable: $(cat /tmp/obs.$$)"
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
