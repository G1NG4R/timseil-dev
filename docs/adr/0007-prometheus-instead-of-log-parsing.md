# ADR 0007 — Prometheus misst, Postgres serviert — kein Log-Parsing

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** C4, F1–F5, D3, H2, K1
**Invarianten:** 1 (`null` → `— NO DATA`), 3, 6 (ein Tag ohne Messung ist `nodata`)

## Kontext

Der Handoff sah vor, die Betriebszahlen der Seite aus **Traefiks Access-Logs**
zu gewinnen, und das Blatt `Case Study .04 OPERATIONS` sagt ausdrücklich
„ohne Prometheus".

Drei Dinge sprechen dagegen, und alle drei sind betrieblicher Natur:

1. **Dokploy trunkiert Container-Logs nächtlich.** Ein Parser müsste Offsets
   verwalten und würde trotzdem Lücken produzieren.
2. **Traefik exportiert Metriken nativ.** Ein Parser würde aus Text
   rekonstruieren, was daneben als Zahl bereitliegt.
3. **Ein Parser produziert stillschweigend Nullen.** Genau das verbietet
   Invariante 1 — und ein Tag ohne Messung muss `nodata` heißen, nicht 100 %.

## Entscheidung

**Der Messweg läuft über Metriken, nicht über Text:**

```
Traefik ──(Metriken)──┐
Go API ──(OTel)───────┼→ Alloy ──→ Prometheus ─┐
Container-Logs ───────┘         └→ Loki        ├→ Grafana

Go API ──(alle 5 min: PromQL)──→ Postgres (Snapshots) ──→ Website
```

**Prometheus misst, Postgres serviert.** Die Go-API fragt Prometheus alle fünf
Minuten per PromQL ab und schreibt Snapshots nach Postgres. Die Website liest
niemals direkt aus Prometheus.

**Alloy ist von Anfang an der Collector.** Zieht die Observability später auf
einen zweiten Host um (ADR 0008), ändert sich nur sein Ziel — die Anwendung
merkt davon nichts.

## Konsequenzen

- **Fällt Prometheus aus, zeigt die Seite weiter den letzten gültigen Wert mit
  Zeitstempel** statt zu brechen oder eine Null zu erfinden. Abnahmekriterium von
  F5: Prometheus-Container stoppen, Seite bleibt ehrlich.
- Die Seite hat keine harte Laufzeitabhängigkeit zu Prometheus. Der
  Snapshot-Abruf hat kurzes Timeout und ist **nicht fatal**.
- Das 91-Tage-Raster (13×7, Invariante 7) füllt sich aus `ops_checks` →
  `ops_days`. Fehlt eine Messung, entsteht `nodata` — der Lückentest in C4 prüft
  genau das.
- Prometheus wird auf `3.13.x` **LTS** gepinnt: Bug-, Security- und Doku-Fixes
  über ein Jahr, Support bis 31.07.2027. Das ist die Wahl, die man in einem
  Betriebssystem trifft, nicht die höchste Zahl.
- **Promtail kommt nicht vor** — seit 02.03.2026 EOL, Alloy ist der Nachfolger.
- **Das Blatt ist an dieser Stelle überholt.** „ohne Prometheus" ist Korrektur #5
  aus Kapitel 7, Issue in A3, abgearbeitet in K1.

### Was das kostet

**Drei zusätzliche Container auf einem Host mit 40 GB Platte** — Prometheus,
Loki, Alloy. Das ist kein Nebeneffekt, sondern das größte Betriebsrisiko des
Setups: Loki liegt auf derselben Platte wie Postgres, und ein durchgedrehter
Log-Producer kann die Seite umbringen.

Deshalb ist die Retention hier eine harte Auflage und keine Empfehlung:
Prometheus 7 d **und** `retention.size=2GB`, Loki 14 d **und** ein
Größen-Limit von ~5 GB plus Stream-Limits, Disk-Alert ab 70 %.
Zeit-Retention allein reicht nicht — eine Fehlerschleife füllt in Stunden
Gigabytes, die 14-Tage-Regel greift erst in 14 Tagen.

Zweitens: Snapshots sind Momentaufnahmen im Fünf-Minuten-Takt. Was zwischen zwei
Snapshots passiert, sieht die Seite nicht. Das ist eine Einschränkung, die in die
Fallstudie gehört, nicht unter den Teppich.

## Verworfene Alternativen

**Access-Log-Parsing (der Handoff-Entwurf)** — siehe Kontext. Lücken durch
Log-Truncation, Offset-Verwaltung, und die Zahlen wären schwerer prüfbar als die
Metrik, aus der sie entstehen.

**Website liest direkt aus Prometheus** — koppelt jede Seitenansicht an einen
Dienst, der ausfallen darf. Und der Verlust wäre nicht „alter Wert", sondern
„kein Wert".

**Externer Monitoring-Dienst (UptimeRobot o. ä.)** — ein weiterer Anbieter für
das, was ADR 0008 mit einem GitHub-Actions-Probe und einem Datenbranch löst,
ohne Konto und öffentlich prüfbar.

**Mimir statt Prometheus** — horizontal skalierbarer Mehrmandanten-Speicher für
einen Host, einen Dienst, einen Nutzer. Kapitel 3.

## Belege

Build-Plan Kapitel 4.3, Kapitel 4.2, Kapitel 2.4, Kapitel 7 Korrektur #5,
Invariante 6, Invariante 7, Phase C4, Phase F2, Phase F5, Phase K1.
