# ops-data

Data branch for the uptime log written by the probe workflow in phase F4.
It has no shared history with `main` on purpose.

**Machines only.** Do not commit here by hand, do not merge this branch into
`main`, and do not merge `main` into it.

Why a separate branch: the probe commits on every state change. Branch
protection forbids direct commits to `main`, and an exception for automation
would be a hole in the lock. Writing here keeps the `main` history free of
machine commits and needs no exception at all — see build-plan 8.9.

The API reads the log from this branch.

---

## What is in `uptime-log.txt`

Two lines per outage, tab separated, UTC. The full grammar and the reasons
behind it are ADR 0038 in `main`; this is enough to read the file.

```
# uptime-log.txt — machine written by tools/probe.sh (F4).
# Grammar: docs/adr/0038. Two lines per outage, tab separated, UTC.
2026-08-24T09:15:00Z	down	connect timeout
2026-08-24T09:40:00Z	up
```

| Field | Rule |
|---|---|
| `observed_at` | RFC3339, UTC, whole seconds, literal `Z`. Strictly increasing. |
| state | `up` or `down`, alternating. The state before the first line is `up`, so the file opens with a `down`. |
| reason | On `down` only, out of a closed vocabulary. |

The reason is **mapped** from curl's exit code, never quoted from its error
text — that text carries the address it could not reach, and this branch is
public. The words are: `dns failure`, `connect refused`, `connect timeout`,
`tls failure`, `http 5xx`, `http 4xx`, `api unreachable`, `probe failed`.

**The file records outages, not uptime.** While the host answers, the prober
reports to the site's own API and writes nothing here. So an empty file means no
outage has ever been recorded, which is why it starts empty.

**What the API does with it:** it expands each closed pair onto the probe
interval — five minutes, the same number the cron and `ops.ProbeInterval` carry
— and writes one `ops_checks` row per instant, recovery exclusive. Every row
carries `origin='backfill'` and the commit it was read from, so a derived row
names something you can fetch and count yourself. A `down` whose `up` has not
been written yet is not expanded at all.
