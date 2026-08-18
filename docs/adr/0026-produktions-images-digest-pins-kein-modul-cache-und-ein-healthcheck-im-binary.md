# ADR 0026 — Produktions-Images: Digest-Pins, kein Modul-Cache, und ein Healthcheck im Binary

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** D1, D2, D3, E1, E2, E3, E4, F4
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

Bis hierher lief alles in Entwicklungs-Images: `api/Dockerfile.dev` baut air um
einen Bind Mount, `web/Dockerfile.dev` startet `next dev`. Beide sagen in ihrem
Kopf, dass sie nichts ausliefern.

D1 baut zum ersten Mal das Artefakt, das später deployed (D3, E4), gescannt (E2)
und signiert (E3) wird. Ab dieser Phase trägt die Kette aus Kapitel 25 des
Handbuchs: **was getestet wurde, ist was läuft.** Sie trägt nur, wenn zwei
Dinge stimmen — das Image entsteht reproduzierbar, und kein Geheimnis liegt in
seinen Layern.

Abnahme laut Bauplan: Go-Image unter 20 MB, beide Images non-root, Schriften und
Bilder laden im Container.

## Entscheidung

### 1. Basis-Images per Digest, nicht per Tag

Jedes `FROM` in `api/Dockerfile` und `web/Dockerfile` trägt `@sha256:…`.

Ein Tag ist ein Name, den der Eigentümer des Registry-Eintrags morgen woanders
hinzeigen lassen kann. Genau so lief der `tj-actions`-Angriff eine Lieferkette
weiter, und E2 schreibt aus demselben Grund vor, fremde Actions auf Commit-SHAs
zu pinnen. Ein Digest anzuheben ist damit ein Commit, den jemand liest.

Der Preis ist benannt: Digests altern, und ein Digest, den niemand anhebt, ist
ein Basis-Image ohne Sicherheitsupdates. **Dependabot für Docker (E2) ist die
Gegenmaßnahme, nicht Disziplin.**

Die `.dev`-Dateien sind ausgenommen. Was sie bauen, wird nie deployed, und ein
Digest an einer Stelle, die niemand prüft, ist Zeremonie.

### 2. Kein `go mod download`-Layer

Der Reflex beim Go-Dockerfile ist `COPY go.mod go.sum` plus `go mod download`
vor dem Quelltext, damit der Modul-Layer cached. Hier ist das der falsche Tausch
(Issue #58): `go.mod` enthält den Werkzeug-Graphen — sqlc, oapi-codegen und die
41 indirekten Zeilen dahinter —, und nichts davon erreicht das Binary.

`go build ./cmd/api` lädt, was der Build wirklich braucht. Nachgemessen: neun
Module. Der Layer ist kleiner **und** er wird nicht in dem Moment ungültig, in
dem eine Werkzeugversion sich bewegt.

Aufgeschrieben, weil die Auslassung im Review wie ein Versehen aussieht.

### 3. Der Healthcheck ist eine Flagge am Binary

`distroless/static:nonroot` hat keine Shell, kein busybox, kein `wget`. Der
Healthcheck aus `compose.dev.yaml` würde einen gesunden Container als unhealthy
melden — und D2 hängt seine Startreihenfolge an genau diese Antwort.

Also beantwortet das Binary die Frage selbst: `/api -healthcheck` wählt das
`/readyz` des Servers, den dasselbe Binary fährt, und der Exit-Code ist die
ganze Nachricht (Issue #57).

Drei Eigenschaften, jede mit einem Grund:

- **`/readyz`, nicht `/healthz`.** Dass der Prozess existiert, weiß Docker
  bereits. `/readyz` sagt, dass er Postgres erreicht und noch annimmt — und es
  antwortet 503, während er drainiert, was genau das ist, was ein Container ist,
  der keinen Verkehr mehr bekommen soll.
- **Keine Konfiguration, kein Pool.** Die Flagge wird vor `config.Load`
  ausgewertet. Sonst machte ein kaputtes `GITHUB_TOKEN` einen laufenden
  Container unhealthy — und Docker startete ihn dafür neu.
- **Keine Ausgabe.** Der Exit-Code ist die Antwort; der Grund hinter einem 503
  steht bereits im Log des Prozesses, dort einmal statt alle fünf Sekunden.

`--retries=3`, nicht die 12 aus `compose.dev.yaml`. Die zwölf sitzen dort aus,
dass air auf einem kalten Clone die Welt neu übersetzt — ein Entwicklungsproblem,
das hier nicht existiert. Nach der Startphase sind drei Fehlschläge in fünfzehn
Sekunden ein Ausfall, und jede Reaktion, die auf diese Antwort wartet — D2s
Startreihenfolge, E4s Rollback-Tor —, wartet genau so lange darauf.

### 4. `CONTRIBUTIONS_TRANSPORT`, Default `github`

`config.Load` verweigerte den Start ohne `GITHUB_TOKEN`. Der Grund war gut: die
Homepage verspricht einen Contribution-Graph, und ein Prozess, der ihn nie holen
kann, zeigte für immer `— NO DATA` und nennte das eine Messung — Invariante 1 mit
Starthut.

Der Preis war, dass **kein Endpoint von Hand geprüft werden konnte, ohne einen
echten Token** — auch keiner, der mit GitHub nichts zu tun hat. Er fiel in jeder
Phase mit Handprüfung an, und D1 ist eine (Issue #59).

Die Lösung ist das Gegenstück zu `MAIL_TRANSPORT`: `github` holt stündlich,
`off` startet die Schleife nie. **Die Richtung des Defaults ist die ganze
Entscheidung.** `github` ist der Default, `off` muss man wählen — anders herum
würde eine vergessene Variable in Dokploy die Zusicherung stillschweigend
aufheben. Ein Tippfehler wird abgelehnt und nicht als „nicht github" gelesen.

Der Schalter schaltet den Refresher ab, **nie den Start und nie den Endpoint.**
Der Handler liest die zwischengespeicherte Zeile und sonst nichts, also antwortet
eine leere Ablage genau das, was ein Kaltstart antwortet: den 502 aus ADR 0020.
Kein erfundener Kalender.

### 5. Die zwei Kopien, die Next.js auslässt

`output: 'standalone'` schreibt einen Baum, der **weder `public/` noch
`.next/static`** enthält — Next.js nimmt an, dass ein CDN sie ausliefert. Diese
Seite hat kein CDN (ADR 0006), also liefert dieser Container sie aus oder
niemand.

Fehlt eine der beiden Zeilen, gelingt der Build, startet der Container, und jede
Seite kommt ohne Stylesheet, ohne Schrift und ohne Bild hoch. Der Bauplan nennt
das den häufigsten Self-Hosting-Fehler bei Next.js.

Deshalb liegt in `web/public/` ab dieser Phase eine echte Datei: eine Regel, die
gegen ein leeres Verzeichnis geprüft wurde, ist nicht geprüft. `make check-images`
ruft beide Beine ab.

### 6. Build-Args nur für Version und SHA

Genau zwei: `VERSION` und `GIT_SHA`. Beide sind öffentlich, beide stehen auf
`/api/health`.

Ein Build-Arg landet in den Image-Layern und bleibt dort, nachdem der Wert
rotiert wurde — `docker history` liest ihn auf einem öffentlichen Image zurück.
Geheimnisse sind Laufzeit-Umgebung, aus Dokploy. Nie anders.

### 7. Die Regeln sind ein Gate, keine Kommentare

`tools/check-dockerfiles.sh` lehnt ab: ein `FROM` ohne Digest, ein `ARG`/`ENV`
mit einem Namen, der nach Geheimnis klingt, eine letzte Stage ohne `USER`, ein
`go mod download` im API-Image. Die Geheimnis-Regel gilt auch für die
`.dev`-Dateien — eine Gewohnheit, die nur in Produktion gilt, ist keine.

Gehalten an ihren eigenen kaputten Fällen in `tools/selftest.sh`, wie jedes
andere Gate hier. Dabei fiel der erste Fehler auf: die Regel meldete den Satz,
der sie beschreibt. Kommentarzeilen werden übersprungen.

## Konsequenzen

**Gut.** Das API-Image ist 14 MiB, hat keine Shell und läuft als `nonroot`
(65532) mit `--read-only`, `--cap-drop ALL` und `no-new-privileges` — nachgemessen
gegen ein echtes Postgres, inklusive des Übergangs healthy → unhealthy → healthy,
als die Datenbank wegfiel und wiederkam. Das Web-Image läuft als `node` (1000)
und trägt beide Asset-Bäume. `/api/health` nennt Version und SHA aus dem Linker,
nicht `dev`/`unknown`.

**Teuer.** Vier Digests wollen gehoben werden. Bis E2 Dependabot bringt, ist das
ein Handgriff, den niemand tut — das ist die ehrliche Beschreibung, nicht eine
Warnung.

**Offen für D2.** Die API läuft read-only; **das Web-Image kann das nicht**,
`.next/cache` will beschrieben werden. Der `HEALTHCHECK` liegt im Image, also
erbt Compose ihn und muss ihn nicht wiederholen. Beides steht im Backlog.

## Verworfene Alternativen

**`node mod`-artiges Caching über `--mount=type=cache`.** Es macht den Build auf
einer Maschine schneller und in CI nicht, weil dort kein Cache überlebt, und es
bindet den Build an eine BuildKit-Eigenschaft. Der Build dauert 19 Sekunden.

**Ein `wget` ins API-Image legen** (`distroless/base` statt `static`, oder ein
statisch gelinktes busybox daneben). Löst dasselbe Problem, indem es die
Angriffsfläche zurückholt, die die Wahl des Basis-Images gerade entfernt hat.

**Den Healthcheck als eigenes Binary.** Zwei Binaries, zwei Versionen, zwei
Gelegenheiten, dass die Portnummer auseinanderläuft. Eine Flagge teilt sich
`listenAddr` mit dem Server, der sie beantwortet.

**`flag.Parse()` statt eines Argument-Scans.** Es müsste vor `config.Load`
laufen und beansprucht eine Kommandozeilen-Oberfläche, die dieses Programm nicht
hat: eine Flagge, keine Argumente, keine Unterbefehle.

**Einen Default, der den Refresher stillschweigend abschaltet** (Issue #59 nennt
es selbst als das, was nicht passieren darf). Die Zusicherung wäre weg, und
niemand merkte es, bis der Graph nicht mehr altert.

**`**/testdata` in `api/.dockerignore`.** Naheliegend und eine Falle:
`internal/httpx/assets` trägt das OpenAPI-Dokument, das `go:embed` ins Binary
legt, und ein Filter, der breit genug für das eine ist, ist breit genug für das
andere — ein Build, der lokal gelingt und im Container bricht.

## Belege

Build-Plan Zeile 1080 (D1), 1084 (D2), 1088 (D3), 1108 (E2), 1119 (E4),
Kapitel 25 des Handbuchs · ADR 0006 (kein CDN) · ADR 0014 (Lebenszyklus,
`/readyz` und der Drain) · ADR 0016 (der Werkzeug-Graph in `go.mod`) ·
ADR 0020 (der Kaltstart-502 und der siebte Problem-Typ) ·
Issues #57, #58, #59 · `api/Dockerfile` · `web/Dockerfile` ·
`api/cmd/api/healthcheck.go` · `tools/check-dockerfiles.sh` ·
`web/next.config.ts`
