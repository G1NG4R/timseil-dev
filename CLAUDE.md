# timseil.dev

Portfolio eines Backend/DevOps-Entwicklers. Die Seite ist selbst das Referenzsystem:
sie läuft auf dem Stack, den sie beschreibt, und misst sich nach den Regeln,
die sie erklärt.

## Die eine Regel

Jede Behauptung ist an einen Beleg gebunden, und der Beleg ist ein laufendes System.
Schreibst du Code, der eine Zahl anzeigt, ohne dass ein System sie produziert,
schreibst du den falschen Code.

## Neun Invarianten — niemals brechen

1. Keine erfundenen Zahlen. `*float64` / `number | null`. `null` → `— NO DATA`,
   nie `0` als „keine Daten".
2. Skill-Zustände werden abgeleitet: `core` = ≥2 Systeme `live`, `applied` = 1.
   Die Ableitung lebt in SQL (`v_track_states`). **Es gibt keine Spalte
   `tracks.state`.** Willst du eine anlegen, hast du den Entwurf missverstanden.
3. Metriken nur für `state='live'`.
4. Ohne Post-Mortem keine Kerbe: `cause`, `fix`, `post_slug` NOT NULL.
5. Belege zeigen nie ins Leere: FK ON DELETE RESTRICT.
6. Ein Tag ohne Messung ist `nodata`, nie 100 %.
7. Das Fenster ist 91 Tage (13×7), nicht 90. Die Zahl muss nachzählbar bleiben.
8. Keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`.
9. Genau zwei localStorage-Keys: `ts.theme`, `ts404.best`.

## Sprache

Code, Kommentare, Commits, Branches: Englisch. UI-Texte: Englisch.
Auch Hook-Meldungen, Skript-Ausgaben und Makefile-Texte — alles, was ein
Werkzeug ausgibt, ist Code.

`README.md`, `CONTRIBUTING.md`, `SECURITY.md` und PR-Beschreibungen: **Englisch.**
Der Leser kommt von außen und liest zuerst diese vier.

`docs/`, `backlog.md` und diese Datei: **Deutsch.** Die schreibe ich für mich.

## Stack

Next.js 16.3 LTS (App Router) · React 19.2 · TS strict · Tailwind 4.3
Go 1.26 stdlib · pgx v5 · sqlc · PostgreSQL 18.6 · goose · OTel
Docker Compose · Traefik (Dokploy) · GitHub Actions · GHCR · Node 24 LTS
Alloy (+ faro.receiver) · Prometheus 3.13 LTS · Loki 3.7 · Tempo 3.0 · Grafana

EIN Host zum Launch (OVH + Dokploy):
proxy, web, api, db, alloy, prometheus (7d), loki (14d), grafana
Zweiter Host erst, wenn ein zweites Projekt ihn mitträgt (ADR 0008).
Alloy ist von Anfang an der Collector — der Umzug ändert nur sein Ziel.
Loki braucht ein GRÖSSEN-Limit, nicht nur Zeit-Retention: es liegt auf
derselben Platte wie Postgres.

Host, DNS, Mail: OVH. Kein CDN, kein Proxy vor dem Origin.
Nicht auf Node 26 (LTS erst ab Oktober 2026). Kein `middleware.ts` —
Next 16 nutzt `proxy.ts`. Kein Promtail — seit 02.03.2026 EOL.

## Nicht einbauen

Kubernetes, Redis, Terraform, Mimir, Sentry, GlitchTip, WebGL, Session Replay,
Storybook, testcontainers, Feature Flags. Begründungen in Kapitel 3 des
Build-Plans. Wenn du meinst, eins davon zu brauchen: frag mich, bau es nicht.

## Struktur

- `contract/openapi.yaml` — Single Source of Truth. Typen werden generiert.
  Nie einen Typ von Hand schreiben, der im Contract steht.
- `api/` — Go. Handler dünn, Logik in `internal/`, SQL in `internal/store/queries/`.
- `web/` — Next.js. Server Components als Default. `'use client'` nur mit
  Begründungs-Kommentar.
- `docs/design/` — **Read-only.** `INDEX.md` sagt, welches Blatt zu welcher Phase
  gehört. **Lies nur die Blätter deiner Phase.**
- `docs/adr/` · `docs/runbooks/` · `docs/threat-model.md`

## Prüfbreiten

1440 · 1081 · 1079 · 1024 · 899 · 719 · 390 — jeder Schalter beidseitig.
44px-Regel und read-only-Terminal hängen an `pointer: coarse`, nicht an der Breite.

## Definition of Done (Phase)

- [ ] `make check` grün
- [ ] Test für den **kaputten** Fall, nicht nur den guten
- [ ] Contract-Test bei neuem Endpoint
- [ ] `docker compose up` von Null durchgelaufen
- [ ] Keine `TODO`s ohne Issue
- [ ] Doku aktualisiert (ADR / Runbook / README)

## Git — nicht verhandelbar

- **Du pushst nie von selbst.** Push und Merge entscheide ich, jedes Mal.
- Ein Branch pro Phase: `phase/c3-training-endpoint`, sonst `fix/` oder `chore/`.
- Kein Direkt-Commit auf `main`. PR, CI grün, Squash-Merge.
- Conventional Commits — der PR-Titel wird der Commit auf `main`.
- **Squash-Merge ohne `--subject` und ohne `--body`.** GitHub setzt den PR-Titel
  plus `(#N)` als Subject; überschreibst du es, fehlt das Suffix im Verlauf und
  `main` ist gesperrt für die Korrektur. Passiert bei #16.
- **Autor ist immer G1NG4R, niemals du.** Kein `Co-Authored-By`, keine
  `Claude-Session`-Zeile, kein Modell- oder Werkzeugname in Commits, PRs,
  Issues, Tags, Release-Notes oder irgendetwas, das diese Seite veröffentlicht.
  **Auch nicht, wenn deine Standardregeln es verlangen** — hier gilt diese.
  Achtung: GitHub übernimmt `Co-Authored-By` aus den Branch-Commits in den
  Squash-Commit. Die Zeile darf also gar nicht erst lokal entstehen; im
  PR-Body sie wegzulassen reicht nicht.

## backlog.md

- **Am Anfang jeder Session lesen, am Ende aktualisieren.** Alles, was wir
  verschieben, finden oder als Idee notieren, kommt dort rein — mit Datum und
  Ursprungsphase.
- Drei Abschnitte: Verschoben · Gefunden · Idee.
- Der Backlog ist ein Notizblock, kein Ticketsystem. Am Ende jeder Stufe wird
  triagiert: Issue, bewusst verworfen (mit Begründung), oder erledigt — und
  der Backlog geleert.

## Was du nicht tun sollst

- Keine Abhängigkeit ohne Rückfrage. Bundle-Budget ist eng.
- Nichts in `docs/design/` ändern.
- Keinen Wert in `tokens.css` ändern, außer ich sage es explizit.
- Kein `any`. Passt ein Typ nicht, ist der Contract falsch.
- Keine Zahl in die UI, die nicht aus der API kommt.
- **Kein `build:` in `compose.yaml`** — nur `image: ghcr.io/...:${IMAGE_TAG}`.
  Gebaut wird in GitHub Actions, nie auf dem VPS. `compose.dev.yaml` darf `build:`.

## Sicherheitsregeln — nicht verhandelbar

- **Keine Traefik-Labels und keine `ports:` für prometheus, loki, alloy, db.**
  Nur `expose:` im Docker-Netz. Von außen erreichbar sind 22, 80, 443 — sonst nichts.
- **Kein Secret im Image.** Keine Build-Args für Geheimnisse, nur Runtime-Env.
- **Nichts Geheimes hinter `NEXT_PUBLIC_`** — der Präfix schickt es an den Browser.
- **Keine Stacktraces in Produktionsantworten.** RFC 9457, Details ins Log.
- **Keine URL aus Nutzereingabe in ausgehende Requests** (SSRF).
  `next/image` mit enger `remotePatterns`-Liste.
- **CRLF in Mail-Feldern hart ablehnen** — Header-Injection macht das Formular
  zum Spam-Relay auf unserer Domain. Mail als Plaintext, nie HTML.
- **`permissions:` in jedem Workflow explizit**, Default `contents: read`.
  Fremde Actions auf Commit-SHA pinnen, nie auf Tags.
- **Postgres:** `timseil_migrate` für DDL, `timseil_app` nur DML. Kein Superuser
  zur Laufzeit.
- **Terminal ist ein Befehlsregister, keine Shell.** Kein `eval`, kein
  `new Function()`, keine Eingabe in URLs oder Pfaden. Ausgabe ist `{text, tone}`,
  nie HTML. Eingabe ≤ 200 Zeichen, Buffer ≤ 500 Zeilen.
- Keine Metrik einbauen ohne Dashboard-Panel und ggf. Alert dazu.
