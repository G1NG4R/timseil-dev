# ADR 0004 — Die Lese-API ist öffentlich

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B1, C2–C5, C7, L3
**Invarianten:** 1 (`null` → `— NO DATA`), 3 (Metriken nur für `live`)

## Kontext

Die Seite behauptet Zahlen: Uptime, p95, Deploy-Frequenz, Anzahl der Systeme.
Jeder Portfoliobetreiber kann solche Zahlen in eine Datei schreiben. Was die
Behauptung von einem Beleg unterscheidet, ist die Möglichkeit, sie **ohne den
Betreiber** nachzuprüfen.

## Entscheidung

**Die lesenden Endpoints sind ohne Authentifizierung öffentlich erreichbar und
im Contract dokumentiert.**

```
curl https://timseil.dev/api/systems
```

liefert dieselben Zahlen, die die Seite rendert. `/api/docs` (Scalar) rendert
den OpenAPI-Contract **öffentlich lesbar**.

Ausgenommen und ausdrücklich nicht öffentlich: `/api/internal/*`
(Probe, Deploy-Hook). Sie sind token-authentifiziert **und** zusätzlich am
Traefik geblockt (L3) — zwei Schichten, nicht eine — und stehen nicht in
`/api/docs`.

## Konsequenzen

- Das ist der Prüfstein der These. Eine Zahl auf der Seite, die die API nicht
  hergibt, ist ab jetzt öffentlich als Erfindung erkennbar — und genau darauf
  ruht Invariante 1: fehlt die Messreihe, antwortet die API `null` und die Seite
  zeigt `— NO DATA`, nicht `0`.
- Golden-Test in C2: jedes System mit `state != 'live'` hat in **jedem**
  Metrikfeld `null`. Ein `0` an dieser Stelle wäre eine erfundene Zahl mit
  Beweiskraft nach außen.
- Die API-Antworten dürfen keine personenbezogenen Daten enthalten.
  `contact_messages` ist kein Lese-Endpoint; IPs werden nur als Hash gespeichert
  (C6), Logs werden PII-gescrubbt (F1).
- Rate-Limit ist Pflicht, nicht Kür: in Traefik **und** in der Go-API. Ohne CDN
  gibt es keine Schicht davor (ADR 0006).
- Cache-Header gehören in den Contract, nicht in den Handler-Kopf.

### Was das kostet

Eine offene API ist eine offene Angriffsfläche: Scraping, Lastspitzen,
Enumeration von Slugs. Das ist der Preis und er wird bezahlt, nicht wegdiskutiert
— read-only, keine PII, Rate-Limit, RFC-9457-Fehler ohne Stacktrace.

Zweitens bindet uns die Öffentlichkeit an den Contract: eine Feldumbenennung ist
ab Launch ein Breaking Change für jeden, der `curl` in ein Skript geschrieben
hat. Deshalb steht der Contract in B1 vor der Implementierung, nicht daneben.

## Verworfene Alternativen

**API nur für das eigene Frontend, Token im Server Component** — technisch
bequem, aber die Nachprüfbarkeit fällt weg, und mit ihr das Argument. Dann wäre
die Seite eine hübsche Behauptungsmaschine.

**Öffentlich, aber mit API-Key auf Anfrage** — eine Hürde, die niemand nimmt.
Ein Beleg, den man beantragen muss, ist keiner.

**Nur ein statisches JSON-Snapshot veröffentlichen** — driftet gegenüber der
Datenbank und wäre wieder eine Datei, die jemand schreibt.

## Belege

Build-Plan Kapitel 4.4, Kapitel 11.1, Invariante 1, Invariante 3,
Phase B1, Phase C2, Phase C7, Phase L3, Phase M6.
