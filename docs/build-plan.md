# Masterplan — timseil.dev

**Stand:** 16.08.2026 · **75 Phasen in 13 Stufen** — **66 im Launch-Pfad**, 8 danach, 1 Grenzfall

| | |
|---|---|
| **Frontend** | Next.js 16.3 LTS · React 19.2 · TypeScript strict · Tailwind 4.3 |
| **Backend** | Go 1.26 stdlib · pgx v5 · sqlc · PostgreSQL 18.6 |
| **Infrastruktur** | Ein OVH-VPS (12 GB RAM, 100 GB NVMe) mit Dokploy · Traefik · GitHub Actions · GHCR |
| **Observability** | Alloy (+ Faro) · Prometheus 3.13 LTS · Loki 3.7 · Tempo 3.0 · Grafana |
| **Kein** | CDN · Kubernetes · Redis · Mimir · Sentry · WebGL — Begründungen in Kapitel 3 |

**Zur Frage:** Ja, **Grafana Faro ist drin** — als Phase F11, ohne zusätzlichen Dienst, weil Alloy den `faro.receiver` mitbringt.

---

## Wie dieser Plan zu lesen ist

Eine Phase ist eine Claude-Code-Session: ein Branch, ein PR, ein abgeschlossener Gedanke. Jede Phase nennt **Ziel, Deliverables und ein prüfbares „fertig wenn"**. Das „fertig wenn" ist bewusst so formuliert, dass es scheitern kann — ein Kriterium, das immer erfüllt ist, ist keins.

Teil I liest du einmal ganz. Teil II arbeitest du der Reihe nach ab.

---

## Zwei Pfade — und der Test, der entscheidet

**Die Philosophie muss ab Tag 1 stimmen.** Das ist die härtere Regel als „schnell online", und sie hat Vorrang. Eine Seite, deren These „alles ist prüfbar" lautet und die am Launch-Tag eine Behauptung trägt, die nicht stimmt, hat mehr verloren als ein Monat Verzögerung kostet.

Daraus wird ein Test, der jede Phase entscheidet:

> **Kann ein Hiring Manager am Launch-Tag eine Behauptung der Seite prüfen — und sie stimmt nicht oder ist leer, weil diese Phase fehlt?**
> **Ja → Launch-Pfad. Nein → danach.**

Das ist strenger als „brauchen wir das zum Online-Gehen", und es ist der Grund, warum drei Phasen aus meiner ersten Verschiebe-Liste wieder zurückwandern.

### Der Test, angewendet

| Phase | Prüft ein Besucher das am Tag 1? | Ergebnis |
|---|---|---|
| **Trainings-Log aus Belegen abgeleitet** | Ja — er sieht Zustände und Belegzeilen | **Launch** |
| **Metriken echt oder ehrlich leer** | Ja — jede Kachel auf jeder Seite | **Launch** |
| **Messung läuft** (Logs, Traefik-Metriken, Probe, Snapshots) | Ja, indirekt — das Betriebsraster füllt sich ab Tag 1 und **lässt sich nicht rückwirkend erzeugen** | **Launch** |
| **API öffentlich prüfbar** | Ja — `curl /api/systems` ist der Prüfstein | **Launch** |
| **Deploy-Dauer echt gemessen** | Ja — steht als Zahl in der Fallstudie | **Launch** |
| **SLO benannt** | Ja, im Gespräch — „Was ist dein SLO?" darf nicht „hab ich nicht" ergeben | **Launch** (nur die Definition, nicht die Alarmierung) |
| **Visual Regression** | Nein — aber **dein eigener Konsistenzlauf fand 18 Abweichungen über 11 Seiten.** Genau beim Bauen vieler ähnlicher Seiten ist der Nutzen am höchsten | **Launch** |
| Traces (Tempo, OTel) | Nein — die Seite zeigt keine Traces | danach |
| Grafana-Dashboards | Nein — sieht nur du | danach |
| Burn-Rate-Alerts, Dead Man's Switch | Nein — betrieblich, nicht sichtbar | danach* |
| Faro (Frontend-Fehler) | Nein — die Seite zeigt keine Fehlerliste | danach |
| SBOM, Signatur, Provenance | Nein — die Seite behauptet es nicht | danach** |
| Error-Budget-Spiel (404) | Nein — die 404 funktioniert ohne es, **und es wird besser mit echtem Budget** | danach |
| Ambient-Ebene | Nein — 6 % Deckkraft | danach |
| Threat Model | Nein — ein Dokument | danach |

\* **Ausnahme:** ein einfacher Uptime-Alert per Mail bleibt im Launch-Pfad. Eine Seite, deren Ausfall du erst bemerkst, wenn du zufällig hinsiehst, widerspricht ihrer eigenen Erzählung.

\*\* **Grenzfall, deine Entscheidung:** E3 kostet ~15 Zeilen Workflow und zwei Sessions. Machst du es zum Launch, ist **jedes** Image ab dem ersten signiert und die Provenance-Kette hat keine Lücke. Machst du es später, steht in der Historie „ab Monat drei". Ich neige zu Launch, weil eine lückenlose Kette das bessere Argument ist — aber es ist vertretbar, es zu verschieben.

### Die eine Sache, die technisch nicht verschiebbar ist

**Messreihen lassen sich nicht rückwirkend erzeugen.** Uptime, p95 und Fehlerrate sind Zeitreihen. Startest du die Messung zwei Monate nach dem Launch, ist dein 91-Tage-Betriebsraster in Monat fünf noch halb leer — und dieses Raster ist das sichtbarste Versprechen der Seite.

Deshalb teilt sich Observability nicht in „wichtig / unwichtig", sondern in **Messen** und **Auswerten**:

| | Was | Wann |
|---|---|---|
| **Messen** | Strukturierte Logs · Traefik-Metriken · Prometheus + Loki lokal · externes Ausfallprotokoll · Snapshots nach Postgres | **Launch** — die Uhr muss laufen |
| **Auswerten** | OTel-Traces · Tempo · Dashboards · Burn-Rate-Alerts · Dead Man's Switch · Faro | danach — Dashboards für leere Zeitreihen sind Arbeit ins Nichts |

### Der ehrliche Gewinn

**Launch-Pfad: 66 Phasen, ~82 Sessions. Ausbau danach: 8 Phasen plus der Grenzfall E3.**

Gegenüber allen 75 Phasen und ~98 Sessions sind das **rund 18 % schneller online.** Nicht 50 %, und mit deinem strengeren Test auch nicht mehr die 20 % von vorhin. Das gehört gesagt.

Der Grund bleibt: **die Komplexität dieser Seite ist ihr Inhalt.** Terminal, Boot-Sequenz, Betriebsraster, abgeleiteter Trainings-Log, sieben Themes — daran lässt sich nichts kürzen, ohne das Argument zu beschädigen. Kürzen lässt sich nur die Betriebs-Raffinesse *um* die Seite herum.

### Was du trotzdem gewinnst

Die acht verschobenen Phasen ergeben Inhalt, den du sonst erfinden müsstest: **verteilte Traces auf einem VPS · SLO-Alerting und Fehlerbudgets · Threat Model · signierte Images mit Provenance · Monitoring auf einen eigenen Host trennen.** Fünf Blogeinträge für einen Blog, der am Launch-Tag leer ist.

**Ein Risiko dazu:** verschobene Arbeit an einem Privatprojekt hat eine hohe Sterblichkeit. Läuft die Seite und sieht gut aus, sinkt die Lust auf das Threat Model spürbar. Deshalb die Regel, nach der die Liste zusammengestellt ist: **jede verschobene Phase muss zu etwas Sichtbarem führen** — einem Blogeintrag, einer Metrik, einem Track, der auf `APPLIED` springt. Reine Pflichtphasen ohne Sichtbarkeit verschiebst du besser nicht.

---

## Inhalt

**Teil I — Grundlagen**
[Phasenzuschnitt](#phasenzuschnitt--warum-so-und-nicht-anders) · [Zwei Pfade](#zwei-pfade--und-der-test-der-entscheidet) · [Revidierte Entscheidungen](#revidierte-entscheidungen)
1. [Leitidee & Invarianten](#1-leitidee--die-neun-invarianten) · 2. [Stack](#2-stack) · 3. [Was wir bewusst nicht bauen](#3-was-wir-bewusst-nicht-bauen) · 4. [Architektur](#4-architektur) · 5. [Qualitätsmodell](#5-qualitätsmodell) · 6. [Design-Ordner](#6-der-design-ordner-im-projekt) · 7. [Design-Korrekturen](#7-design-korrekturen) · 8. [Claude Code & Git-Workflow](#8-arbeiten-mit-claude-code) · 9. [Repo-Layout](#9-repo-layout) · 10. [Ressourcen & Kosten](#10-ressourcen--kosten) · 11. [Sicherheits-Grundlage](#11-sicherheits-grundlage) · 12. [Dokumentation](#12-dokumentation--was-automatisiert-wird-und-was-nicht)

**Teil II — 75 Phasen in 13 Stufen**
A Fundament · B Contract & Daten · C API · D Container · E CI/CD & Supply Chain · F Observability · G Frontend-Fundament · H Seiten · I Bewegung · J Terminal · K Inhalt · L Härtung · M Launch

**Teil III** — Post-Launch

**Anhänge** — A SLOs · B A11y · C Risiken · D Zeitplan & Sessiondauer · E Erste Session · F Sicherheits-Prüfliste

---

## Phasenzuschnitt — warum so und nicht anders

Der Maßstab ist **Kopplung, nicht Anzahl.** Eine Phase ist eine zusammenhängende Design-Entscheidung samt Tests, die einen PR ergibt, den du in einem Zug reviewen kannst — grob 2–5 Stunden Arbeit, ein Kontextfenster ohne Kompaktierung.

**Zu große Phasen scheitern mechanisch:** Claude Code läuft in die Kontext-Kompaktierung, und danach sind die Entscheidungen vom Anfang der Session weg. Eine Phase „Seiten, 5–7 Tage" bedeutet, dass beim Bau der 404-Seite die Header-Entscheidungen von der Homepage nicht mehr im Kontext sind.

**Zu kleine Phasen scheitern anders:** Fehlt der Zusammenhang, erfindet Claude Code eine Schnittstelle, gegen die du in der nächsten Session ankämpfst. „Middleware-Kette" ohne „Server-Skelett" ist keine Aufgabe, sondern eine Einladung zu Nacharbeit.

**Die zwei Prüffragen:**

| Zusammenlegen, wenn | Aufteilen, wenn |
|---|---|
| beide Phasen dieselben Dateien anfassen | die Phase mehr als ~15 Dateien anfasst |
| die zweite ohne die erste nicht testbar ist | sie mehr als zwei Design-Blätter braucht |
| eine Design-Entscheidung über beide reicht | das „fertig wenn" nicht in einen Satz passt |

**Der Plan ist eine Hypothese, kein Vertrag.** Läuft Claude Code mitten in einer Phase in die Kompaktierung, war sie zu groß — teil sie und notier es. Musst du in einer Session dreimal dieselbe Datei neu einlesen, weil die Vorphase sie schon angefasst hat, waren es zwei Phasen zu viel.

---

## Revidierte Entscheidungen

Dieser Plan ist über mehrere Runden entstanden, und ich habe unterwegs sechs eigene Empfehlungen zurückgenommen. Das gehört hier hin, weil es zeigt, wo die Fallen liegen:

| Ursprünglich | Jetzt | Warum |
|---|---|---|
| Cloudflare-Proxy mit WAF | **kein CDN** | Widersprach deiner Datenschutzseite. Mit OVH als Registrar, DNS, Host und Mail ist keine dritte Partei im Anfrageweg. |
| p95 aus In-Process-Histogramm | **Traefik-Metriken → Prometheus** | Übersteht Neustarts, misst auch Requests, die die App nie erreichen |
| Traefik-Access-Log parsen | **Prometheus Recording Rules** | Dokploy kürzt den Log nachts; der ganze Fehlerraum entfällt ersatzlos |
| Blog per Go-Embed | **MDX im Repo** | Dein Entwurf hatte das längst entschieden |
| GlitchTip für Error-Tracking | **Faro in Alloy** | Over-Engineering — derselbe Fehler, vor dem ich bei Mimir gewarnt hatte. Faro braucht null zusätzliche Container. |
| 81 Phasen, mechanisch geschnitten | **75 Phasen, nach Kopplung geschnitten** | Acht Stellen waren zu fein (F4/F5 war sogar ein kaputter Schnitt — das Abnahmekriterium von F4 brauchte F5), vier zu grob (Homepage, Case Study, 404-Spiel) |

---

# Teil I — Grundlagen

## 1. Leitidee & die neun Invarianten

> **Jede Behauptung der Seite ist an einen Beleg gebunden, und der Beleg ist ein System, das läuft.**

Mit der Observability-Stufe bekommt der Satz eine zweite Ebene: die Seite zeigt nicht nur Zahlen, sie **misst sich selbst nach den Regeln, die sie beschreibt.** Das Error-Budget auf der 404-Seite ist kein Spielkonzept mehr, sondern die Sichtbarmachung eines echten SLOs.

| # | Invariante | Durchgesetzt durch |
|---|---|---|
| 1 | Keine erfundenen Zahlen. `*float64` / `number \| null`, `null` → `— NO DATA` | Typsystem + Golden-Test |
| 2 | Skill-Zustände werden abgeleitet, nie gesetzt. **Keine Spalte `tracks.state`** | SQL-View + Property-Test |
| 3 | Metriken nur für `state='live'` | Golden-Test |
| 4 | Ohne Post-Mortem keine Kerbe: `cause`, `fix`, `post_slug` NOT NULL | Schema-Constraint |
| 5 | Belege zeigen nie ins Leere | FK `ON DELETE RESTRICT` |
| 6 | Ein Tag ohne Messung ist `nodata`, nie 100 % | Aggregations-Test |
| 7 | Das Fenster ist 91 Tage (13 × 7), nicht 90 | Konstante + Test |
| 8 | Keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css` | Lint-Regel |
| 9 | Genau zwei `localStorage`-Keys: `ts.theme`, `ts404.best` | Lint-Regel + E2E |

Kollidiert eine Phase mit einer Invariante, gewinnt die Invariante.

---

## 2. Stack

### 2.1 Frontend

| Ding | Pin | Warum |
|---|---|---|
| **Next.js** | `16.3.x` LTS | LTS seit 03.08.2026; Next 15 fällt am 21.10.2026 aus dem Support. Monatliche Security-Releases. |
| **TypeScript** | `5.x`, `strict` | Next.js ist vollständig auf TS ausgelegt: eigene Typen für Router, Metadata, Route Handler, Server Components; in 16 sind Routen typisiert. `strict` ist Pflicht — Invariante 1 lebt von `strictNullChecks`. |
| **React** | 19.2 (Canary-Kanal) | Nicht selbst pinnen, Next bestimmt. |
| **Tailwind** | `4.3.x` | CSS-first, Tokens über `@theme`. |
| **GSAP · Lenis · Motion** | aktuell | GSAP orchestriert, Lenis scrollt, Motion macht Zustandsübergänge. |
| **Playwright** | aktuell | E2E, Visual Regression, A11y. |

### 2.2 Backend

| Ding | Pin | Warum |
|---|---|---|
| **Go** | `1.26.x` | Green-Tea-GC standardmäßig aktiv. Natives Fuzzing, `testing/synctest`. |
| **HTTP** | `net/http` stdlib | Seit 1.22 mit Methoden und Pfad-Parametern. Kein Framework ist auf einer Backend-Seite ein Argument. |
| **PostgreSQL** | `18.6` | Seit 13.08.2026. **Nicht 19** — noch Beta, final ~Sept/Okt. |
| **pgx** | `v5` | Direkt, mit `pgxpool`. |
| **sqlc · goose** | aktuell | Generiertes SQL; Migrations als Init-Container. |
| **OTel Go SDK** | aktuell | Traces + Metriken. |

### 2.3 Infrastruktur

| Ding | Wahl |
|---|---|
| Host · DNS · Domain · Mail | **OVH** — zwei VPS, DNS-Zone, MX Plan |
| Orchestrierung | **Dokploy** auf beiden Hosts (bringt Traefik + Let's Encrypt) |
| Node-Runtime | `24.x` Active LTS bis April 2028. **Nicht 26** — LTS erst ab Oktober 2026. |
| Registry · CI/CD | GHCR · GitHub Actions |
| Zweiter Host | erst mit Projekt 2 — ADR 0008 |

### 2.4 Observability

| Komponente | Pin | Rolle | Wo |
|---|---|---|---|
| **Grafana Alloy** | aktuell | **Der eine Collector.** OTel-Distribution von Grafana: scrapt, tailt, empfängt OTLP **und Faro**. | beide Hosts |
| **Faro Web SDK** | aktuell | Frontend: Fehler mit Stacktrace, Web Vitals, Breadcrumbs. **Kein eigener Dienst.** | Browser |
| **Prometheus** | `3.13.x` **LTS** | Metriken, **7 d** zum Launch | lokal |
| **Loki** | `3.7.x` | Logs, **14 d** zum Launch, Größen-Limit Pflicht | lokal |
| **Tempo** | `3.0.x` | Traces, 7 d, monolithic | ⟶ nach Launch |
| **Grafana** | aktuell | Dashboards, Alerting — **hast du schon** | lokal |

**Prometheus LTS statt neuestes Minor:** Prometheus startet alle 6 Wochen einen neuen Minor-Zyklus, und danach bekommt ein Minor generell keine Bugfixes mehr. Die LTS-Releases bekommen Bug-, Security- und Doku-Fixes über ein Jahr; `3.13` läuft bis 31.07.2027. Das ist die Wahl, die man in einem Betriebssystem trifft, nicht die höchste Zahl.

**Promtail ist nicht dabei:** seit dem 2. März 2026 End-of-Life. Alloy ist der Nachfolger.

**Tempo monolithic:** Tempo 3.0 hat für den Microservices-Modus Lese- und Schreibpfad getrennt und einen Kafka-kompatiblen Puffer eingeführt. Das löst Skalierungsprobleme, die du nicht hast.

---

## 3. Was wir bewusst nicht bauen

Dieses Kapitel ist so wichtig wie der Stack. **Ein Portfolio, das jede Technologie einbaut, die es kennt, argumentiert schwächer als eins, das begründen kann, warum es sie weggelassen hat.** Jede Zeile hier ist ein Interview-Argument.

| Weggelassen | Warum | Wann doch |
|---|---|---|
| **CDN / WAF** | Widerspräche der Datenschutzseite. Härtung am Origin deckt das reale Risikoprofil ab; OVH filtert Netzebenen-DDoS. | wenn echter Angriffsdruck entsteht |
| **Mimir** | Das „M" in LGTM ist horizontal skalierbarer Mehrmandanten-Speicher. Ein Host, ein Dienst, ein Nutzer → ein Prometheus reicht. | nie, ohne echten Anlass |
| **Sentry self-hosted** | 40+ Container, 8–16 GB RAM. Und **BSL-lizenziert, kein OSI-Open-Source.** | nie |
| **GlitchTip** | Gruppierung löst „3000 Vorkommen desselben Fehlers". Bei deinem Traffic hast du über Monate drei bis fünf Fehler. | P9, wenn eine Grafana-Query nicht mehr reicht |
| **Kubernetes** | Vier Container auf einem Host. k3s vor dem Launch bringt null Leser; der Blogeintrag danach bringt welche. | P2 |
| **Redis** | Postgres und In-Process-Cache reichen bei diesem Traffic. | P3, dann als Beleg für den Track `Caching` |
| **Terraform** | Zwei VPS, die du einmal aufsetzt. | P4 |
| **WebGL / react-three-fiber** | ~150 KB gzip für eine Ambient-Ebene bei **6 % Deckkraft** — bricht Constraint 04 deiner eigenen Fallstudie („fast on a phone on mobile data"). Canvas-2D tut es. | nur wenn das Budget es hergibt |
| **Session Replay** | Auf einer Portfolioseite gibt es keine Nutzerflüsse zu rekonstruieren. | nie |
| **Mutation Testing** | Rigoros, aber die Rechenzeit steht in keinem Verhältnis. Property-based Tests decken die kritische Logik ab. | nie |
| **Storybook** | Die Route `/dev/components` leistet dasselbe ohne zweiten Build. | nie |
| **testcontainers** | Ein Postgres-Service in GitHub Actions ist simpler und tut dasselbe. | nie |
| **SIEM (Wazuh, Sentinel)** | fail2ban + Loki-Alerts decken das reale Bedrohungsprofil. | nie |
| **Feature Flags, A/B-Tests** | Ein Entwickler, eine Zielgruppe, kein Experimentbedarf. | nie |
| **Pyroscope** | Starkes Go-Argument, aber am Launch-Tag Ballast. | P5 |

**Zwei Dinge, die ich dennoch drin lasse, obwohl der Nutzen überwiegend demonstrativ ist** — und das gehört ehrlich gesagt:

**SBOM, Signierung und SLSA-Provenance** (E4) schützen einen Solo-Betrieb praktisch kaum. Sie kosten aber zusammen etwa 15 Zeilen Workflow, und „mein Image ist signiert und die Herkunft öffentlich prüfbar" ist ein Absatz in deiner Fallstudie, den fast kein Bewerber schreiben kann. Der Aufwand-Nutzen-Schnitt geht auf, der Nutzen liegt nur woanders, als man denkt.

**Chaos-Drills** (M1) sind für einen Portfolioseiten-Betrieb Overkill — außer dass dein Incident-Log auf der Fallstudie echten Inhalt braucht und du sonst auf einen echten Ausfall warten müsstest. Doppelter Zweck, deshalb drin.

---

## 4. Architektur

### 4.1 Topologie — ein Host zum Launch

**Alles auf einem VPS mit Dokploy** (`compose.yaml` + `compose.observability.yaml` im selben Stack):

| Container | Inhalt |
|---|---|
| **proxy** | Traefik (Dokploy): TLS, Routing, **Prometheus-Metrik-Endpoint** |
| **web** | Next.js: Seiten, Rendering, MDX-Blog. Keine Datenlogik. |
| **api** | Go: Datenmodell, Ableitungen, Contract, Validierung, Rate-Limit, Mail, Snapshots |
| **db** | PostgreSQL 18.6 |
| **alloy** | scrapt Traefik, API und Node lokal; tailt Container-Logs |
| **prometheus** | Metriken, 7 d |
| **loki** | Logs, 14 d |
| **grafana** | Dashboards + Alerting |

**Warum nicht gleich zwei Hosts:** Ein getrennter Observability-Host für **eine** Portfolioseite ist verfrüht. Sobald ein zweites Projekt dazukommt, trägt der zweite Host drei Projekte statt eins — dann ist er richtig, und dann baust du ihn einmal ordentlich statt zweimal halb. Das ist YAGNI korrekt angewendet: nicht „brauche ich nie", sondern „brauche ich noch nicht, und später besser".

**Die Aufteilung ist vorbereitet, nicht verbaut.** Alloy ist schon der Collector — beim Umzug ändert sich nur sein Ziel von `localhost` auf `remote_write` über den Tunnel. Die Anwendung merkt davon nichts.

→ **ADR 0008: ein Host zum Launch, Aufteilung wenn ein zweites Projekt sie rechtfertigt.**

### 4.2 Die zwei Risiken des Ein-Host-Betriebs

**1. Volle Platte legt die Datenbank lahm.** Loki und Prometheus liegen auf derselben Platte wie Postgres. Ein durchgedrehter Log-Producer kann die Seite umbringen — ein selbstgebauter Ausfall.
*Gegenmittel:* harte Retention **und** ein Größen-Limit in Loki (nicht nur zeitbasiert), eigenes Volume für Observability-Daten wenn möglich, Disk-Alert ab **70 %** (bei 100 GB bleiben dann 30 GB Vorlauf), kürzere Retention am Anfang: Prometheus 7 d + 2 GB, Loki 14 d + ~5 GB.

**2. Stirbt der Host, stirbt die Aufzeichnung mit.** Das ist das ernstere. Fällt der Host aus, notiert niemand den Ausfall — und deine Uptime-Zeile zeigt hinterher eine **Lücke** statt eines Ausfalls. Auf einer Seite, die Betriebsehrlichkeit zu ihrem Argument macht, ist das die falsche Art von Lücke.

**Das Gegenmittel passt zu deiner Erzählung: die Aufzeichnung des Ausfalls lebt außerhalb deiner Infrastruktur.**

Der GitHub-Actions-Probe prüft alle 5 Minuten. **Bei jedem Zustandswechsel** committet der Workflow eine Zeile in eine Datei im Repo:

```
2026-09-14T03:11:00Z  down  connect timeout
2026-09-14T03:26:00Z  up    200 in 142ms
```

Nur bei Wechseln — ein paar Zeilen im Monat, nicht 288 Commits am Tag. Kommt der Host zurück, liest die API die Datei und füllt `ops_checks` rückwirkend auf.

Drei Gewinne auf einmal: **der Ausfall wird aufgezeichnet, obwohl das aufzeichnende System tot war** · die Aufzeichnung liegt versioniert in Git und ist damit **öffentlich prüfbar**, was exakt die These der Seite ist · und du brauchst keinen dritten Anbieter.

### 4.3 Der Messweg

```
Traefik ──(Metriken)──┐
Go API ──(OTel)───────┼→ Alloy ──→ Prometheus ─┐
Container-Logs ───────┘         └→ Loki        ├→ Grafana
                                               ┘
Go API ──(alle 5 min: PromQL)──→ Postgres (Snapshots) ──→ Website

GitHub Actions (5 min, außerhalb) ─┬→ POST /api/internal/probe        (Host lebt)
                                   └→ commit bei Zustandswechsel       (Host tot)
```

1. **Traefik exportiert Metriken nativ** — kein Logdatei-Parsing, keine Offset-Verwaltung, kein Problem mit Dokploys nächtlicher Log-Truncation.
2. **Prometheus misst, Postgres serviert.** Die API zieht alle 5 Minuten Snapshots. Fällt Prometheus aus, zeigt die Seite weiter den letzten gültigen Wert mit Zeitstempel. Genau dafür ist Invariante 1 gebaut.
3. **Die Uptime-Wahrheit liegt außerhalb.** Der Actions-Cron ist unter Last ungenau; **die Einschränkung gehört in die Fallstudie, nicht unter den Teppich.**

### 4.4 Warum die API die Datenhoheit hat

Dein Handoff sah einen Go-Container vor, der nur Access-Logs parst, während Next.js-Route-Handler die Daten liefern. Das verlagert Datenmodell, Ableitungen und Contract nach TypeScript und reduziert deinen Go-Beleg auf „Log-Parser" — bei dem erklärten Ziel, Backend-Fähigkeit zu belegen, die falsche Richtung.

Deshalb: **Go besitzt Postgres, Contract und Ableitungen. Next.js rendert.** Die API ist öffentlich lesbar — `curl https://timseil.dev/api/systems` liefert dieselben Zahlen wie die Seite. **Das ist der Prüfstein der These.**

### 4.5 Kein CDN

Dein Handoff verlangt „DNS ohne Proxy davor, damit die Aussage der Datenschutzseite stimmt". Mit OVH als Registrar, DNS-Betreiber, Host und Mail-Anbieter ist keine dritte Partei im Anfrageweg.

Preis, benannt: kein WAF, VPS-IP sichtbar. Aufgefangen am Origin — Rate-Limit in Traefik **und** in der Go-API, fail2ban, Firewall nur 80/443, SSH per Key. Das argumentiert stärker als die Alternative, und es ist ein Blogeintrag.

### 4.6 Blog: MDX im Repo

`@next/mdx` in `web/content/posts/`, Frontmatter mit `systemId`, damit die Zuordnung Blog → System in den Daten steht und nicht an der Sektion hängt.

---

## 5. Qualitätsmodell

### 5.1 Testpyramide

| Ebene | Werkzeug | Umfang | Läuft |
|---|---|---|---|
| **Unit** | Go `testing` (table-driven), Vitest | > 70 % `internal/`, > 60 % `lib/` | jeder Commit |
| **Property-based** | `pgregory.net/rapid` | **nur** die Ableitungslogik und die Ops-Aggregation | jeder Commit |
| **Fuzzing** | Go native `FuzzXxx` | **zwei Ziele:** Kontakt-Validierung, MDX-Frontmatter | nächtlich, 5 min |
| **Integration** | Postgres-Service in Actions | Store gegen echtes Postgres 18.6 | jeder PR |
| **Contract** | OpenAPI-Validator, beidseitig | jede Antwort gegen `openapi.yaml` | jeder PR |
| **E2E** | Playwright | kritische Pfade **und kaputte Fälle** | jeder PR |
| **Visual Regression** | Playwright Screenshots | 7 Breiten, **Kernseiten** (Home, Case Study, 404) | jeder PR |
| **A11y** | axe-core in Playwright | alle Seiten, 0 Verstöße | jeder PR |
| **Performance** | Lighthouse CI | Budget aus L8 | jeder PR |
| **Load** | k6 | Baseline + Spike + 15-min-Soak | vor Release |
| **Chaos** | manuelle Drills | 6 Szenarien | Stufe M, dann quartalsweise |

**Zur Visual Regression, ehrlich:** Baselines für *alle* Seiten × 7 Breiten sind ein Wartungsklotz — jede Design-Anpassung bricht Dutzende Bilder. Deshalb: alle sieben Breiten, aber nur für die drei Seiten, auf denen es wirklich zählt. Der Rest wird per axe und manueller Sichtprüfung abgedeckt.

**Zum Soak-Test:** 15 Minuten reichen, um ein Speicherleck sichtbar zu machen. Eine Stunde ist bei diesem Traffic Ritual, keine Erkenntnis.

### 5.2 Quality Gates — Merge blockiert bei

Coverage unter Schwelle · Lint- oder Typfehler · Contract-Drift · bekannte Schwachstelle mit Fix (`govulncheck`, `npm audit`, Trivy) · gefundenes Secret (`gitleaks`) · SAST-Finding ≥ HIGH · Performance-Budget überschritten · A11y-Verstoß · Visual-Diff ohne bewusst aktualisierte Baseline.

### 5.3 Drei Definitionen von „fertig"

**DoD-1 (Phase)** — `make check` grün · Test für den kaputten Fall · keine `TODO`s ohne Issue · Doku aktualisiert · ein sauber beschriebener PR

**DoD-2 (Stufe)** — alle Phasen DoD-1 · Integrationstest über die Stufe · ADRs geschrieben · Runbook ergänzt falls betrieblich relevant · Dashboard/Alert vorhanden falls messbar

**DoD-3 (produktionsreif)** — DoD-2 · Load-Test bestanden · Chaos-Drill dokumentiert · **Alert erprobt** · **Rollback erprobt** · **Restore erprobt** · Threat-Model-Punkt adressiert

### 5.4 Konventionen

Conventional Commits → `release-please` erzeugt CHANGELOG und Tags · Branches `phase/c3-training-endpoint` · SemVer · Image-Tags `sha-<short>`, `v1.2.3`, `latest` · reproduzierbare Builds (`-trimpath`, `SOURCE_DATE_EPOCH`, Base-Images per Digest) · **Code Review auch solo:** nach dem PR `/clear`, dann Review in eigener Session.

---

## 6. Der Design-Ordner im Projekt

### 6.1 Ablage

```
docs/design/
├── INDEX.md          ← Phase A2
├── README.md         ← Original-Handoff
├── support.js        ← MUSS neben den HTML-Dateien liegen
├── doc-page.js       ← Laufzeit für CV und Handoff
├── *.dc.html         ← 29 Blätter
└── code/             ← tokens.css, globals.css, layout.css, tokens.ts, components/
```

`.gitattributes`: `docs/design/** linguist-documentation` — sonst verzerren 1,4 MB HTML deine Sprachstatistik.

### 6.2 Die Blätter sichtbar machen

Die Blätter laden `react@18.3.1`, `react-dom@18.3.1` und `@babel/standalone` zur Laufzeit von unpkg, dazu Google Fonts. **Ohne Netz bleibt die Seite schwarz:** `<x-dc>` wird nie ersetzt, es entsteht kein `#dc-root`. In A2 mit blockiertem unpkg nachgemessen.

**Korrektur gegenüber der ersten Fassung dieses Kapitels:** `file://` ist nicht die Ursache. Per Doppelklick geöffnet rendert ein Blatt vollständig — headless gegen `http://` geprüft, DOM strukturell identisch. Die CDN-Skripte kommen über klassische `<script src>`-Tags, die vom `file:`-Ursprung laden; der einzige `fetch()`-Pfad in `support.js` ist ein Nachlade-Zweig hinter `.catch()`, und `x-import` benutzt kein Blatt.

```bash
make design       # serve@14.2.5, Port 4000
```

**Wofür der Server dann gut ist:** für eine stabile, rechnerunabhängige URL. Daran hängt der Playwright-Vergleich ab H1 — ein Screenshot-Lauf soll keinen absoluten Pfad deines Rechners einbacken. Zwei Eigenheiten: `serve` schneidet `.html` in der URL ab, und sein `--no-port-switching` ist in 14.2.5 wirkungslos (bei belegtem Port bindet es wortlos einen anderen) — deshalb prüft das Make-Target den Port selbst.

**Was der Vergleich nicht leisten kann:** die Blätter sind Canvases mit **festen Artboards**. Gezeichnet sind 1440 und 390, mehr nicht — ein schmaleres Fenster löst keinen Reflow aus. Gegen die Referenz vergleichbar sind also zwei der sieben Prüfbreiten; die übrigen fünf laufen gegen die eigenen Baselines der Seite. Das ist trotzdem der produktivste Prompt der ganzen Stufe H.

### 6.3 `docs/design/INDEX.md`

29 Blätter mit 1,38 MB HTML sind zu viel Kontext für eine Session. **Claude Code liest pro Phase nur die Blätter dieser Phase** — so steht es auch im Session-Prompt aus 8.5.

**Die Zuordnung steht in `docs/design/INDEX.md`,** in beiden Richtungen (Phase → Blatt für den Prompt, Blatt → Phase zum Nachschlagen), mit gemessener Lesegröße je Blatt. Die Phasennummern dort folgen **Teil II**.

Sie steht hier bewusst **nicht** ein zweites Mal. Die frühere Fassung dieses Kapitels trug eine eigene Tabelle, und genau die ist gedriftet: sie nannte die Homepage H2, den Work Index H3 und den Blog H6, während Teil II inzwischen 13 H-Phasen hat. Zwei Kopien derselben Zuordnung sind der Fehler, den 12.2 verhindern soll.

---

## 7. Design-Korrekturen

Die Entwürfe tragen Angaben, die nach den Entscheidungen dieses Plans nicht mehr stimmen. **Auf einer Seite über Prüfbarkeit sind das keine Kosmetikfehler.** In A3 als Issues anlegen, in K1 abarbeiten:

| # | Wo | Steht da | Muss heißen | Schwere |
|---|---|---|---|---|
| 1 | Case-Study-Spec-Rail, Homepage-Systemzeile, Work Index, Terminal `stack` | `React Router 7` | `Next.js 16` | **kritisch** |
| 2 | Case-Study-Spec-Rail | `PostgreSQL 16` | `PostgreSQL 18` | **kritisch** |
| 3 | Handoff 4a | Health-Container mit SQLite | API-Container mit Postgres (ADR 0005) | hoch |
| 4 | Homepage, Case Study 02, About, 404 | deutsche Absätze in EN-Oberfläche | englische Fassung | hoch |
| 5 | Case Study `.04 OPERATIONS` | „ohne Prometheus" | Prometheus ist Teil des Stacks (ADR 0007) | hoch |
| 6 | `Homepage Themes` | `[FOLGT]` | `[SOON]` | mittel |
| 7 | Scroll-Choreografie | Pin „schaltet 5 Systeme" | 2 Systeme → Pin bis System 03 deaktivieren | mittel |
| 8 | Contribution-Graph | `[PLACEHOLDER DATA]` | entfällt beim API-Anschluss | mittel |
| 9 | Terminal-Inventar | Befehlsliste ohne `cv` | mit `cv` | niedrig |

**Zu #7:** Ein Pin, der zwei Zeilen durchschaltet, sieht nach ungenutzter Mechanik aus. Der große Moment ist am Launch-Tag die Boot-Sequenz.

---

## 8. Arbeiten mit Claude Code

### 8.1 Grundregeln

1. **Eine Phase = eine Session = ein Branch = ein PR.** Dazwischen `/clear`.
2. **Immer Plan Mode zuerst** (`Shift+Tab` ×2). Plan lesen, korrigieren, freigeben.
3. **Kontext-Budget:** nur die Blätter aus `INDEX.md` für diese Phase.
4. **Review in eigener Session:** `/clear`, dann „Review diesen Diff gegen CLAUDE.md und die neun Invarianten. Sei streng."
5. **Screenshots als Feedback** gegen `make design`.

### 8.2 `AGENTS.md`

Ab Next.js 16.3 liefert das Framework versionsgebundene Doku über `AGENTS.md`. Ohne das schreibt dir jedes Modell `middleware.ts` — das es in Next 16 nicht mehr gibt.

```bash
cd web && npx next-docs init
```

### 8.3 `CLAUDE.md` — direkt übernehmen

````markdown
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
`docs/` und diese Datei: Deutsch.

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
````

---

### 8.4 Git-Workflow — entschieden

**Trunk-based mit Phasen-Branches. Kein `dev`.**

```
main ──●──────────●──────────●─────────  Produktion, immer live
        ↖ PR       ↖ PR       ↖ PR
        phase/c3-…  fix/…      phase/c4-…

ops-data ─────────────────────────────   nur Automatik (Uptime-Log aus F4)
```

| Präfix | Wofür | Beispiel |
|---|---|---|
| `phase/` | eine Phase aus dem Plan | `phase/c3-training-endpoint` |
| `fix/` | Bug, der beim Bauen oder in Produktion auffällt | `fix/terminal-crlf` |
| `chore/` | Abhängigkeiten, Konfiguration, Aufräumen | `chore/bump-go-1.26.5` |

**Eine Phase = ein Branch = ein PR = ein Squash-Merge = ein Deploy.**

**Warum kein `dev`:** Git Flow löst Teamprobleme — mehrere Entwickler parallel, Release-Termine, mehrere gepflegte Versionen. Du hast keins davon. `dev` würde zwei PRs pro Änderung kosten (der zweite ist ein Abnicken), Rückmerge-Reibung bei Hotfixes erzeugen und die Deploy-Frequenz senken — die deine Fallstudie misst. Der Phasen-Branch leistet die Isolation bereits. **Wenn du später eine Staging-Umgebung baust, kommt `dev` zurück und zeigt darauf.** Vorher zeigt er auf nichts.

**Zwei Gates, eins menschlich, eins mechanisch:**

1. **Claude Code pusht nie.** Committen darf es lokal — das ist nützlich, und der Squash-Merge räumt die Historie ohnehin auf. **Push und Merge entscheidest du, jedes Mal.**
2. **Branch Protection auf `main`:** PR erforderlich, CI grün, kein Force-Push, keine Direkt-Commits. Eine Regel in `CLAUDE.md` ist eine Bitte — das hier ist der Riegel.

### 8.5 So arbeitest du — die Schleife pro Phase

**Vorher (30 Sekunden)**
```bash
git checkout main && git pull
git checkout -b phase/c3-training-endpoint
```

**Session starten** — Claude Code auf, `/clear`, dann:
```
Lies CLAUDE.md, backlog.md und docs/build-plan.md Phase C3.
Lies aus docs/design/INDEX.md nur die Blätter für C3. Sonst nichts.

Plan Mode: was baust du, in welcher Reihenfolge, wo bist du unsicher?
Schreib noch keinen Code.
```

**Plan lesen, korrigieren, freigeben.** Das sind die zehn wertvollsten Minuten der Session — hier kostet eine Korrektur nichts, im Code kostet sie eine Stunde.

**Bauen lassen.** Claude committet lokal, so oft es will.

**Wenn Claude fertig meldet:**
```
Prüfe gegen die Definition of Done in CLAUDE.md und die neun Invarianten.
Was fehlt? Sei streng.

Trag dann alles, was wir verschoben oder gefunden haben, in backlog.md ein.
```

**Dein Review.** `git diff main...HEAD` lesen. Das ist dein Job, nicht Claudes — und der eigentliche Grund, warum zwei Sessions pro Tag die Obergrenze sind.

**Dann erst du:**
```bash
make check                       # muss grün sein
git push -u origin phase/c3-training-endpoint
gh pr create --fill              # Titel = Conventional Commit
```

**CI abwarten.** Grün → Squash-Merge. Der Deploy läuft automatisch.

**Danach (30 Sekunden)**
```bash
git checkout main && git pull
git branch -d phase/c3-training-endpoint
curl -s https://timseil.dev/api/health | jq .sha    # zeigt den neuen Commit?
```

Der letzte Befehl ist kein Zierat: er ist die Bestätigung, dass das, was du gemergt hast, tatsächlich läuft. Auf dieser Seite ist das die passende Art, eine Phase abzuschließen.

**Wenn eine Phase nicht fertig wird:** Branch liegen lassen, Stand in `backlog.md` notieren, nächste Session dort weiter. **Läuft sie über vier Stunden oder kompaktiert Claude Code den Kontext — aufhören und aufteilen.**

**Wenn Produktion kaputt ist:** `fix/`-Branch von `main`, gleicher Ablauf, nur schneller. Ohne `dev` gibt es hier keine Sonderregel — genau deshalb fällt er weg.

### 8.6 Am Ende jeder Stufe — Triage

Nach A, B, C … eine kurze Sitzung, ~20 Minuten:

1. **`backlog.md` durchgehen.** Jeder Eintrag bekommt genau eins: **Issue** (entschiedene Arbeit), **verworfen mit Begründung**, oder **erledigt**.
2. **Backlog leeren.** Ein Eintrag, der zwei Stufen übersteht, ist entweder ein Issue oder unwichtig.
3. **ADRs prüfen:** Ist unterwegs eine nicht-offensichtliche Entscheidung gefallen, die keine hat?
4. **Runbook ergänzen**, falls die Stufe etwas Betriebliches gebracht hat.

### 8.7 `backlog.md` — Vorlage zum Kopieren

Claude Code **liest sie am Anfang jeder Session und aktualisiert sie am Ende.** Steht das nicht in `CLAUDE.md`, passiert es nicht — deshalb steht es dort.

```markdown
# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

## Verschoben — bewusste Entscheidung
| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-09-02 | H4 | Skill-Zeilen-Hover auf Touch prüfen | H-Abschluss |

## Gefunden — Bug oder Unklarheit
| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-09-02 | C4 | Belegzeile bricht bei 3 Systemen um | offen |

## Idee — noch nicht entschieden
| Datum | Was | Bewertung |
|---|---|---|
| 2026-09-05 | Terminal-Befehl `uptime` | erst wenn Messreihe > 30 d |
```

**Die Grenze zu Issues:** Backlog ist Unentschiedenes und Sessionnahes. Ein Issue ist entschiedene Arbeit mit einem Ziel. Ohne diese Trennung hast du zwei Ablagen, und beide verrotten.

### 8.8 PR-Vorlage

```markdown
## Phase
C3 · Training-Endpoint

## Was
<zwei bis drei Sätze>

## Definition of Done
- [ ] `make check` grün
- [ ] Test für den kaputten Fall
- [ ] Contract-Test (bei neuem Endpoint)
- [ ] `docker compose up` von Null durchgelaufen
- [ ] Keine TODOs ohne Issue
- [ ] backlog.md aktualisiert

## Invarianten berührt?
<welche, und wie eingehalten — oder "keine">
```

### 8.9 Eine Wechselwirkung, die du sonst erst später merkst

**Der Uptime-Log-Commit aus F4 kollidiert mit der Branch Protection.** Der Actions-Probe committet bei Zustandswechseln, aber Direkt-Commits auf `main` sind gesperrt.

Lösung: **der Workflow schreibt auf den Datenbranch `ops-data`**, nicht auf `main`. Die API liest von dort. Das hält die `main`-Historie frei von Automatik-Commits und braucht keine Ausnahme in der Protection.

---

## 9. Repo-Layout

```
timseil-dev/
├── CLAUDE.md · backlog.md · Makefile
├── compose.yaml · compose.dev.yaml
├── compose.observability.yaml     → gleicher Host, eigener Stack
├── .github/workflows/    ci · security · deploy · deploy-observability
│                         probe · heartbeat · nightly · release
├── contract/openapi.yaml
├── docs/
│   ├── build-plan.md · adr/ · runbooks/ · threat-model.md
│   ├── architecture/     C4 Context + Container (Mermaid)
│   └── design/           READ-ONLY + INDEX.md
├── api/
│   ├── cmd/api/main.go
│   ├── internal/  config httpx store training ops metrics ghgraph mail telemetry
│   ├── migrations/ · sqlc.yaml · Dockerfile
├── web/
│   ├── AGENTS.md · app/ · proxy.ts · components/ · content/posts/
│   ├── lib/api/ · styles/ · e2e/ · next.config.ts · Dockerfile
├── ops/
│   ├── alloy/            host-a.alloy · host-b.alloy
│   ├── prometheus/       rules/ (recording + alerting)
│   ├── loki/ · tempo/
│   ├── grafana/          provisioning/ (datasources + dashboards als Code)
│   ├── wireguard/        Vorlagen, keine Keys
│   ├── traefik/ · backup/ · k6/
└── tools/
```

---

## 10. Ressourcen & Kosten

**Deine Maschine: 12 GB RAM, 100 GB NVMe** — seit dem Upgrade vom 18.08.2026. Die vorherige Annahme „6–9 GB" hat nie gestimmt: gemessen wurden 3,7 GB, und das war der Anlass des Upgrades. RAM ist damit kein Engpass. **Die Platte bleibt der knappere Posten** — nicht weil sie klein ist, sondern weil Postgres, Loki und Prometheus auf derselben liegen.

### RAM — entspannt

| Posten | RAM |
|---|---|
| Dokploy (inkl. eigenem Postgres + Redis) | ~500 MB |
| Traefik · Next.js · Go API · PostgreSQL | ~600 MB |
| Alloy · Prometheus · Loki · Grafana | ~800 MB |
| Betriebssystem + Docker-Daemon | ~500 MB |
| **Belegt** | **~2,4 GB** |
| **Frei bei 6 GB** | ~3,6 GB · **bei 9 GB** ~6,6 GB |

Der freie Speicher ist nicht verschwendet — Postgres nutzt ihn als Page Cache. Mit 6 GB läuft alles, mit 9 GB hast du Luft für Tempo und den zweiten Systemstack später.

**Eine Bedingung: gebaut wird in GitHub Actions, nie auf dem VPS.** Drei Gründe, der dritte ist der wichtigste:

1. **RAM** — ein Next.js-Build zieht kurzzeitig 2–4 GB, genau während des Deploys, also wenn die Seite Reserven braucht.
2. **Disk** — der Build-Cache belegt mehrere GB auf einer 100-GB-Platte, die sich Postgres, Loki und Prometheus teilen. (Stand hier bis E4b als „40-GB-Platte" — die Zahl von vor dem Upgrade am 18.08.2026, die derselbe Abschnitt drei Absätze weiter oben schon widerlegt.)
3. **Verifizierbarkeit** — baust du auf dem VPS, ist das Artefakt, das du getestet hast, **nicht** das Artefakt, das läuft. Damit bricht die ganze Kette: der Contract-Test lief gegen ein anderes Image, und die Signatur aus E3 gilt für ein Image, das nie deployed wurde. Auf einer Seite, deren These „alles ist prüfbar" lautet, ist das kein Detail.

**Umgesetzt wird das durch genau eine Zeile im Compose** — `image:` statt `build:`, siehe D3. Steht dort ein `build:`, nützt dir die ganze CI-Pipeline nichts.

### Disk — hier liegt das Risiko

| Posten | Realistisch |
|---|---|
| OS + Docker-Daemon | ~4 GB |
| Docker-Images (App, Postgres, Prometheus, Loki, Grafana, Alloy, Traefik) | ~4 GB |
| Dokploy + eigenes Postgres/Redis | ~2 GB |
| App-Datenbank | < 1 GB, wächst langsam |
| Prometheus (7 d) | ~1 GB |
| Loki (14 d) | **1–3 GB — der Wildcard** |
| Backups im Zwischenlager | ~0,5 GB |
| **Belegt** | **~13–16 GB von 40** |

Klingt entspannt. Ist es nicht, denn **die zwei schnellsten Verbraucher stehen nicht in der Tabelle:**

**1. Alte Docker-Images.** Jeder Deploy legt ein neues Image an, und Docker räumt nicht von selbst auf. Bei täglichen Deploys sind das schnell mehrere GB pro Woche. **Das ist auf Dokploy-Maschinen die häufigste Ursache für volle Platten** — nicht die Logs.
*Pflicht:* Image-Retention in Dokploy auf die letzten 3–5 Stände begrenzen **und** `docker system prune -af --filter "until=168h"` als wöchentlicher Cronjob.

**2. Ein Log-Amoklauf.** Eine Fehlerschleife, die pro Sekunde eine Zeile schreibt, füllt in Stunden Gigabytes. Zeit-Retention hilft dabei nicht — die greift erst nach 14 Tagen.
*Pflicht:* **Größen-Limits zusätzlich zur Zeit:**

```
Prometheus:  --storage.tsdb.retention.time=7d
             --storage.tsdb.retention.size=2GB
Loki:        retention_period: 336h        # 14 d
             max_global_streams_per_user   # Kardinalität deckeln
             + Compactor mit Größen-Grenze ~5GB
```

**Disk-Alert bei 70 %**, nicht 75 oder 80. Bei 100 GB sind 70 % = 70 GB belegt, 30 GB frei — genug Vorlauf, um zu reagieren, bevor Postgres keine Schreibrechte mehr hat. Ein Alert, der erst bei 90 % feuert, lässt zu wenig Zeit für die Füllraten dieses Hosts: ein Image-Layer pro Deploy, und eine Fehlerschleife, die Loki in Stunden Gigabytes schreiben lässt.

**Backups gehen direkt nach S3**, nicht ins lokale Dauerlager.

### Was S3 löst — und was nicht

Dokploys S3-Anbindung ist eine **Backup-Funktion, kein Speicher-Backend.** Sie kopiert Daten weg; die Daten liegen weiterhin auf deinen 100 GB.

| | Hilft S3? |
|---|---|
| **Datenbank-Backups** (`pg_dump` → zip → rclone → S3) | **Ja** — genau dafür gebaut, in Dokploy eingebaut. Das ist L4. |
| **Volume-Backups** (Docker Named Volumes → S3) | **Ja** — aber **nur Named Volumes, keine Bind Mounts.** Siehe unten. |
| **Alte Docker-Images** | **Nein.** Liegen in `/var/lib/docker/overlay2`, sind kein Volume, werden nicht gesichert und lassen sich nicht auslagern. GHCR ist die Registry — die *gezogenen* Layer liegen trotzdem lokal. |
| **Prometheus-TSDB** | **Nein.** Prometheus hat kein natives Object-Storage-Backend, nur lokalen Block-Storage. (Thanos oder Mimir würden das ändern — und wären hier genau das Over-Engineering aus Kapitel 3.) |
| **Postgres-Livedaten** | **Nein.** Braucht ein lokales Blockgerät. Nur der Dump geht nach S3. |
| **Loki-Chunks** | **Ja, aber nicht über Dokploy** — das ist eine Loki-Konfiguration. Siehe unten. |

**Die Pointe:** die beiden schnellsten Verbraucher deiner Platte — alte Docker-Images und die Prometheus-TSDB — sind **beide immun gegen S3.** Der Prune-Cronjob und die Größen-Limits bleiben Pflicht, egal wie viele Buckets du anlegst.

**Konkrete Folge für dein Compose (D2/D3):** Dokploys Volume-Backups funktionieren **nur mit Docker Named Volumes**, nicht mit Bind Mounts. Also:

```yaml
volumes:
  - pgdata:/var/lib/postgresql          # ✅ sicherbar
  # - ./data:/var/lib/postgresql        # ❌ Bind Mount, nicht sicherbar
volumes:
  pgdata:
```

Der Pfad ist `/var/lib/postgresql`, nicht `…/data`: das Postgres-18-Image hat das Datenverzeichnis verschoben, und beide Compose-Dateien folgen ihm. Mit dem alten Pfad startet der Container nicht.

**Loki auf S3 — ein echter Hebel, aber später.** Loki kann seine Chunks nativ in Object Storage legen; dann wächst das Log-Volumen nicht mehr auf deiner Platte. Das ist eine legitime Option, aber:
- Bei 1–3 GB pro 14 Tagen löst es ein Problem, das du noch nicht hast
- Es kostet Requests bei OVH Object Storage (bei deinem Volumen Cent-Beträge, aber es ist nicht null)
- Es macht die Abfrage langsamer und die Konfiguration größer

**Der gute Zeitpunkt dafür ist P0b**, der Umzug auf einen zweiten Host: liegen die Chunks schon in S3, ist der Umzug trivial statt fummelig. Bis dahin: lokal mit Größen-Limit.

### Nach zwei Wochen nachmessen

```bash
docker system df                                    # Images, Volumes, Build-Cache
du -sh /var/lib/docker/volumes/*loki* /var/lib/docker/volumes/*prom*
df -h /
```

Dann weißt du, ob 30 Tage Loki-Retention reinpassen — statt es zu schätzen. Und du hast die Zahlen für die Fallstudie.

### Kosten

Domains ~2 €/Monat · OVH MX Plan ~1 € · Object Storage < 1 € · GHCR und Actions (public repo) 0 €. **Summe ~3–4 €/Monat.** Ein zweiter VPS kommt erst mit Projekt 2.

**Vor Phase 0 besorgen:** GitHub PAT (Scope `read:user`) · OVH MX Plan · S3-kompatibler Bucket.

---

## 11. Sicherheits-Grundlage

Ein Security-Durchgang über den ganzen Plan. Sechs Lücken, davon zwei ernst — eine davon ist beim Zusammenlegen auf einen Host entstanden.

### 11.1 Angriffsfläche

| Fläche | Exponiert? | Schutz |
|---|---|---|
| Next.js (443) | öffentlich | CSP, Header, Rate-Limit |
| Go API — Lese-Endpoints (443) | öffentlich **und gewollt** | read-only, keine PII, Rate-Limit |
| `POST /api/contact` | öffentlich | Honeypot, Dwell-Time, Rate-Limit, Origin-Prüfung |
| **Terminal** | öffentlich, aber **keine Shell** | Befehlsregister ohne `eval`; Ausgabe als Daten, nie HTML; feste Endpoints |
| `/api/internal/*` | **darf nicht öffentlich sein** | Traefik blockt den Pfad **plus** Token — zwei Schichten |
| **Dokploy-UI** | **muss zu** | siehe 11.2 |
| **Grafana** | Entscheidung nötig | siehe 11.2 |
| **Prometheus, Loki, Alloy** | **müssen zu** | siehe 11.2 |
| Postgres | nie | nur Docker-Netz, kein Port-Mapping |
| SSH | nur Key | fail2ban, kein Passwort, kein Root-Login |
| GitHub Actions → Deploy | Webhook-Secret | minimale Rechte, SHA-gepinnte Actions |
| OVH-Konto | — | **2FA — Totalkompromittierung, wenn nicht** |

### 11.2 Die zwei ernsten Lücken

**1. Die Dokploy-Oberfläche war im Plan nie geregelt.** Sie hat vollen Zugriff auf den Host, auf Deploys **und auf alle Env-Variablen — also auf sämtliche Secrets.** Das ist das lohnendste Ziel der ganzen Maschine.

Zwei Wege, ich empfehle den ersten:

| Weg | Bewertung |
|---|---|
| **Nur über SSH-Tunnel** (`ssh -L 3000:localhost:3000`), kein Traefik-Router, Port in der Firewall zu | **Empfehlung.** Null Angriffsfläche im Internet. Der Komfortverlust ist ein Kommando. |
| Eigene Subdomain hinter Traefik, starkes Passwort, 2FA, IP-Allowlist | Bequemer, aber eine Login-Seite, die permanent angegriffen wird |

**2. Prometheus, Loki und Alloy haben standardmäßig keine Authentifizierung.** Solange sie auf einem zweiten Host hinter WireGuard lagen, war das egal — sie lauschten nur auf der Tunnel-Schnittstelle. **Mit dem Zusammenlegen auf einen Host ist dieser Schutz weggefallen, und ich hatte ihn nicht ersetzt.**

Prometheus kann über die Admin-API Zeitreihen löschen, Loki liefert deine gesamten Logs inklusive allem, was das PII-Scrubbing durchgelassen hat.

*Regel:* **keine Traefik-Labels, keine `ports:`-Mappings** für diese drei. Nur `expose:` im Docker-Netz. Abnahme in M3: `nmap` von außen zeigt ausschließlich 22, 80, 443.

**Grafana** ist der Grenzfall: du willst es erreichen können. Wenn öffentlich, dann mit `GF_USERS_ALLOW_SIGN_UP=false`, starkem Passwort oder GitHub-OAuth, `cookie_secure`, und ohne Anonymous-Zugriff. Sonst denselben SSH-Tunnel wie Dokploy.

### 11.3 Vier kleinere Funde

**Backups sind löschbar, wenn die Maschine fällt.** Die S3-Zugangsdaten liegen auf dem Host. Wer den Host übernimmt, löscht auch die Sicherungen — das klassische Ransomware-Muster.
*Gegenmittel:* Bucket-Versionierung **und** Object-Lock oder ein Schlüssel mit `PutObject`/`ListBucket`, aber **ohne** `DeleteObject`. Kostet nichts und ist der Unterschied zwischen Vorfall und Totalverlust.

**GitHub-Actions-Rechte sind standardmäßig zu weit.** Jeder Workflow bekommt `permissions:` explizit — `contents: read` als Default, `packages: write` nur beim Push, `id-token: write` nur für cosign. **Fremde Actions auf Commit-SHA pinnen, nicht auf Tags** — ein Tag lässt sich verschieben, und genau so lief der `tj-actions`-Angriff. Kein `pull_request_target`. Keine Fremdeingabe (PR-Titel, Issue-Titel) direkt in `run:`-Blöcke.

**Mail-Header-Injection im Kontaktformular.** `Reply-To` wird aus der Besucheradresse gebaut. Enthält die ein `\r\n`, hängt der Angreifer eigene Header an und macht aus deinem Formular einen Spam-Relay — auf **deiner** Domain, mit deiner Reputation.
*Gegenmittel:* CRLF hart ablehnen, Adresse gegen strikte Regel prüfen, Mail als Plaintext bauen, nicht als HTML.

**Least Privilege in Postgres.** Ein Rollenpaar statt eines Superusers: `timseil_migrate` besitzt das Schema und darf DDL, `timseil_app` darf nur DML auf die Tabellen, die es braucht. Eine SQL-Injection in der API kann dann kein Schema löschen. `scram-sha-256`, kein `trust`.

### 11.4 Regeln, die durchgehend gelten

- **Kein Secret im Image.** Keine Docker-Build-Args für Geheimnisse — die landen in den Layern. Nur Runtime-Env aus Dokploy.
- **Nichts mit `NEXT_PUBLIC_`-Präfix, das geheim ist.** Der Präfix bedeutet: geht an den Browser. In E2 als Lint-Regel prüfen.
- **Keine Stacktraces in Produktionsantworten.** Fehler nach RFC 9457, Details ins Log, nicht in den Body.
- **Keine URL aus Nutzereingabe in ausgehende Requests** — SSRF. Die API ruft nur GitHub und Prometheus, beide fest verdrahtet. `next/image` mit enger `remotePatterns`-Liste.
- **`security.txt`** nach RFC 9116 unter `/.well-known/` — kostet zehn Minuten und passt zu einer Seite, die mit Betriebsdisziplin argumentiert.
- **Domain-Ebene:** 2FA auf OVH und GitHub, Registrar-Lock, **CAA-Record** (nur Let's Encrypt darf ausstellen), DNSSEC wenn OVH es für die Zone anbietet.
- **Der Uptime-Log-Commit aus F4** braucht Schreibrechte im Repo. Fein granulierter Token, nur auf diese eine Datei, nicht der Standard-`GITHUB_TOKEN` mit `contents: write` für alles.

### 11.5 Threat Model wandert nach vorn

L6 stand als Post-Launch-Phase im Plan. **Das war falsch herum:** ein Threat Model, das nach der Härtung entsteht, dokumentiert nur, was du ohnehin gebaut hast. Davor gebaut, steuert es die Härtung.

Deshalb: **eine schlanke Fassung vor L2** (eine Stunde, STRIDE über die sieben Container, jede Bedrohung → Maßnahme oder bewusst akzeptiert), die ausführliche Fassung als Blogeintrag danach.

---

## 12. Dokumentation — was automatisiert wird und was nicht

**Die ehrliche Antwort auf „automatische Doku": generieren lohnt sich fast nie, prüfen fast immer.** Generierte Dokumentation ist das, was am schnellsten verrottet — weil niemand sie liest und nichts sie kontrolliert.

### 12.1 Was ich nicht bauen würde

| Idee | Warum nicht |
|---|---|
| **godoc / TypeDoc als Doku-Seite** | Sinnvoll für Bibliotheken, die andere einbinden. Deine API wird von deinem eigenen, generierten Client konsumiert. Das liest niemand — auch du nicht. |
| **Abhängigkeitsgraphen aus dem Code** | Technisch korrekt, kognitiv wertlos: ein Knäuel. Deine handgeschriebenen C4-Diagramme sind mehr wert, weil sie **Absicht** kodieren, nicht Struktur. |
| **Eine eigene `/docs`-Systemseite** | Die Fallstudie **ist** die Systemdokumentation, öffentlich und datengetrieben. Eine zweite wäre eine Kopie, die driftet. |
| **Ein vierter Entscheidungs-Log** | Du hast ADRs, Backlog und CHANGELOG. Ein weiterer Ort heißt: zwei verrotten. |
| **Visueller Changelog aus Screenshots** | Nett, kostet Platte, liest niemand. |

Zwei Dinge sind ohnehin schon automatisch und reichen: **`/api/docs`** aus dem OpenAPI-Contract und der **CHANGELOG** aus `release-please`.

### 12.2 Was sich wirklich lohnt: Doku am Lügen hindern

Nicht generieren — **verifizieren.** Vier Prüfungen in CI, zusammen etwa zwei Stunden Arbeit:

| Prüfung | Verhindert |
|---|---|
| **OpenAPI ↔ Router-Parität** | Ein Endpoint existiert, steht aber nicht im Contract — oder umgekehrt |
| **Stack-Angaben ↔ echte Abhängigkeiten** | Genau der Fehler, den deine Entwürfe hatten: „React Router 7" und „PostgreSQL 16" auf einer Seite, die etwas anderes tut |
| **README-Quickstart läuft** | Die Anleitung, die seit vier Monaten nicht mehr funktioniert |
| **Referenzierte ADRs existieren** | Ein Codekommentar zeigt auf `ADR 0009`, das nie geschrieben wurde |

### 12.3 Der Stack-Manifest — Drift strukturell unmöglich machen

Die zweite Prüfung lässt sich noch besser lösen als durch einen Test: **man kann die Angabe so bauen, dass sie gar nicht driften kann.**

Dein Schema hat bereits `systems.stack text[]`. Statt den Stack in der Fallstudie als Text zu hinterlegen, kommt er aus einer gepflegten Datei ins Feld — und die Seite rendert aus dem Feld:

```yaml
# stack.yaml — kuratiert: was zeigenswert ist, nicht jede transitive Abhängigkeit
frontend:
  - { name: "Next.js", from: "web/package.json", key: "next" }
  - { name: "Tailwind", from: "web/package.json", key: "tailwindcss" }
backend:
  - { name: "Go",         from: "api/go.mod",     key: "go" }
  - { name: "PostgreSQL", from: "compose.yaml",   key: "services.db.image" }
```

**Die Arbeitsteilung ist der Punkt:** *du* entscheidest, was zeigenswert ist — CI prüft, dass die **Versionen** mit `go.mod`, `package.json` und `compose.yaml` übereinstimmen. Niemand tippt je wieder eine Versionsnummer in eine Seite.

Damit ist die These der Seite an dieser Stelle nicht mehr Vorsatz, sondern erzwungen: **eine falsche Stack-Angabe bricht den Build.**

### 12.4 Live-Badges im README, ohne einen einzigen Commit

Ein Hiring Manager, der dein Repo aufmacht, soll dieselben Zahlen sehen wie auf der Seite. Über **Shields.io-Endpoint-Badges**, die `/api/health` lesen:

```markdown
![uptime](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/uptime)
![version](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/version)
![systems](https://img.shields.io/endpoint?url=https://timseil.dev/api/badge/systems)
```

Ein kleiner Handler in der Go-API liefert das Badge-JSON. **Kein geplanter Job, kein Commit, keine Kollision mit der Branch Protection** — die Badges sind live, weil sie bei jedem Aufruf die API fragen. Und `— NO DATA` gilt auch hier: liegt keine Messreihe vor, zeigt das Badge das, nicht eine Null.

### 12.5 Die Regel für alles unter `docs/`

**Jede Datei hat einen Zweck und einen Leser.** Kannst du nicht sagen, wer sie liest, gehört sie gelöscht.

| Datei | Leser |
|---|---|
| `README.md` | Fremder, der das Repo aufmacht — meist ein Hiring Manager |
| `CLAUDE.md` | Claude Code |
| `docs/build-plan.md` | du, jede Session |
| `docs/adr/` | du in sechs Monaten, wenn du dich fragst „warum eigentlich?" |
| `docs/runbooks/` | du um drei Uhr nachts |
| `docs/threat-model.md` | du beim Härten — und ein Interviewer |
| `backlog.md` | Claude Code am Anfang jeder Session |
| `docs/design/` | Claude Code, phasenweise nach `INDEX.md` |

Alles andere ist Ballast.

---

# Teil II — Die 75 Phasen (66 im Launch-Pfad)

## Stufe A — Fundament · 4 Phasen

**A1 · Repo & Werkzeuge** — Monorepo-Skelett, `.gitignore`, `.editorconfig`, `.nvmrc` (24), `Makefile` (`dev check gen migrate e2e design`), Pre-commit-Hooks, PR-Template, `CODEOWNERS`, **Branch Protection auf `main`** (PR erforderlich, CI grün, kein Force-Push, keine Direkt-Commits), Squash-Merge als Default, PR-Vorlage aus 8.8, `backlog.md` aus 8.7 angelegt, leerer Branch `ops-data` für den Uptime-Log aus F4.
*Fertig wenn:* `make check` läuft, Hooks greifen.

**A2 · Design-Ordner integrieren** — Handoff nach `docs/design/`, `.gitattributes`, `make design` auf Port 4000, `INDEX.md` aus 6.3.
*Fertig wenn:* `make design` rendert die Homepage **sichtbar**, nicht schwarz.

**A3 · Entscheidungen & Dokumentation** — acht ADRs (`0001` Next.js · `0002` MDX-Blog · `0003` Zustände als View · `0004` API öffentlich · `0005` Container-Schnitt · `0006` kein CDN · `0007` Prometheus statt Log-Parsing · `0008` ein Host zum Launch, Ausfallprotokoll außerhalb), die neun Issues aus Kapitel 7, `README.md` (für Menschen, mit den Live-Badges aus 12.4), `CONTRIBUTING.md`, `SECURITY.md`, C4 Context + Container als Mermaid.
*Fertig wenn:* ADRs und Issues liegen vor; ein Fremder versteht aus dem README in 2 Minuten, was das ist und wie er es startet.

**A4 · Lokale Entwicklungsumgebung** — `compose.dev.yaml`: Postgres 18.6, API mit `air`, Web mit `next dev`. `.env.example` dokumentiert.
*Fertig wenn:* `make dev` startet alles, Hot Reload beidseitig.

---

## Stufe B — Contract & Daten · 4 Phasen

**B1 · Contract & Codegen** — `openapi.yaml` 3.1: alle Endpoints, nullable Metriken, Fehlermodell (RFC 9457 Problem Details), Cache-Header. Dazu die Generatoren: `oapi-codegen` (Go) + `openapi-typescript` (TS) über `make gen`, CI-Drift-Check.
*Der Contract ohne seinen Generator ist nur ein Dokument — deshalb eine Phase.*
*Fertig wenn:* Spec validiert, `/api/docs` (Scalar) rendert sie **öffentlich** lesbar, `make gen` ist idempotent.

**B2 · Schema & Migrations** — goose: `systems`, `modules`, `tracks`, `track_evidence`, `ops_checks`, `ops_days`, `incidents`, `deploys`, `metric_snapshots`, `contact_messages`. Constraints aus Invarianten 4 und 5. `source`-Achse mit Check. Indizes mit `EXPLAIN` begründet.
*Fertig wenn:* `up → down → up` läuft dreimal sauber; jeder Index hat einen Kommentar, welche Query ihn braucht.

**B3 · Die Ableitung** — `v_track_states` als View:
```sql
CASE WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state='live') >= 2 THEN 'core'
     WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state='live')  = 1 THEN 'applied'
     WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state='in_build') > 0 THEN 'learning'
     ELSE 'queued' END
```
Property-based Test gegen `skillState()` aus `docs/design/code/tokens.ts`.
*Fertig wenn:* 1000 generierte Belegkonstellationen stimmen auf beiden Seiten überein.

**B4 · Seed, Fixtures & Stack-Manifest** — `stack.yaml` als kuratierte Quelle, aus der `systems.stack` befüllt wird (Kapitel 12.3) — damit steht keine Versionsnummer je wieder als Text auf einer Seite. Dann genau **zwei** Systeme: `vat-check` (`queued`, ohne Metriken), `timseil-dev` (`live`). 5 Module, 22 Tracks, 13 Belege. Fixture-Sets: leer, Tag 1, ein Incident, zwei Systeme.
*Fertig wenn:* 13× `applied`, 9× `learning`, **0× `core`**, `EVIDENCE: 01 SYSTEM`.

---

## Stufe C — API · 7 Phasen

**C1 · Server-Fundament: Lebenszyklus & Middleware** — Config aus Env mit Validierung beim Start (fail fast), `pgxpool` mit begründeter Größe, `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`, **Graceful Shutdown** auf SIGTERM. Middleware-Kette: Request-ID → `slog` JSON → Recovery → Timeout → CORS → Rate-Limit.
*Skelett und Middleware sind eine Design-Entscheidung — die Shutdown-Logik und die Timeout-Middleware greifen ineinander.*
*Fertig wenn:* Fehlende Env-Variable verhindert den Start mit klarer Meldung; SIGTERM beendet ohne abgeschnittene Requests; ein Panic bringt den Server nicht um und erzeugt eine Logzeile mit Request-ID.

**C2 · Systems-Endpoints** — `GET /api/systems`, `/{slug}`.
*Fertig wenn:* **Golden-Test:** jedes System mit `state != 'live'` hat in *jedem* Metrikfeld `null`.

**C3 · Training-Endpoint** — Belegzeilen aus `track_evidence` (`SHIPPED IN → 02 TIMSEIL.DEV (BUILD + DEPLOY)` / `NO SYSTEM YET → SELF-STUDY`), Kopfzeile aus distinkten Systemen. API liefert lowercase, UI zeigt UPPERCASE.
*Fertig wenn:* Ein System auf `live` setzen lässt Tracks von `learning` auf `applied` springen — als Test.

**C4 · Ops-Endpoints** — 91-Tage-Raster, Incidents, Deploys. Aggregation `ops_checks` → `ops_days`. Tag 1 ist vollständig `nodata`.
*Fertig wenn:* Lückentest — fehlende Messungen erzeugen `nodata`, niemals `ok`.

**C5 · GitHub-Contributions** — **GraphQL, nicht REST** (die REST-API liefert den Kalender nicht). Token `read:user`, nie zum Client. Cache 1 h. Circuit Breaker + Backoff mit Jitter. GitHubs `color`-Werte **nicht** verwenden — der Entwurf hat eigene Stufen `--l0`…`--l4`.
*Fertig wenn:* Simulierter GitHub-Ausfall liefert Cache mit korrektem Alter statt Fehler.

**C6 · Kontakt & Mail** — Validierung, Honeypot `company`, `dwellMs ≥ 3000`, Idempotenz über `ts`+`email`+Hash, Rate-Limit 3/IP/10 min, IP nur als Hash, **Origin-Prüfung**. Versand über OVH-SMTP.
**Mail-Header-Injection abwehren:** `Reply-To` wird aus der Besucheradresse gebaut. Enthält sie `\r` oder `\n`, hängt ein Angreifer eigene Header an und macht aus deinem Formular einen Spam-Relay — auf **deiner** Domain, mit deiner Reputation. CRLF hart ablehnen, Adresse strikt prüfen, **Mail als Plaintext bauen, nicht als HTML.**
*Fertig wenn:* Alle fünf Antwortpfade (202/400/429/502/Honeypot) getestet; Rate-Limit greift vor der OVH-Quote.

**C7 · Interne Endpoints** — `/api/internal/probe`, `/api/internal/deploy`, token-authentifiziert mit konstantzeitigem Vergleich. **Zusätzlich am Traefik blocken** (L3) — Token allein ist eine Schicht, zwei sind besser. Nicht in `/api/docs` dokumentieren.
*Fertig wenn:* Falsches Token → 401 ohne Informationsleck, ohne messbaren Timing-Unterschied.

---

## Stufe D — Container · 3 Phasen

**D1 · Images** — **API:** Multi-Stage, `CGO_ENABLED=0`, `-trimpath`, Ldflags mit Version + SHA, `distroless/static:nonroot`, read-only rootfs, Base-Image per Digest, `no-new-privileges:true`, `cap_drop: ALL`. **Keine Build-Args für Geheimnisse** — die landen in den Image-Layern. **Web:** `output: 'standalone'`, `node:24-alpine`, non-root.
**Die Standalone-Falle:** `.next/standalone` enthält **weder `public/` noch `.next/static`** — beide explizit kopieren, sonst fehlen im Container alle Assets und Fonts. Häufigster Self-Hosting-Fehler bei Next.js.
*Fertig wenn:* Go-Image < 20 MB, beide non-root, Fonts und Bilder laden im Container.

**D2 · Compose-Topologie** — `db` (pg_isready) → `migrate` (Init-Container) → `api` (Healthcheck) → `web`. Ressourcen-Limits pro Service. **Alle persistenten Daten als Docker Named Volumes, keine Bind Mounts** — Dokploys Volume-Backups nach S3 funktionieren nur mit Named Volumes. **Muss mit dem Compose-Ausschnitt in Case Study 02 wörtlich übereinstimmen.**
*Fertig wenn:* `down -v && up` reproduziert den Zustand ohne Handgriff.

**D3 · Dokploy-Anbindung** — *(danach L1 vorziehen — siehe Anhang D, externe Uhr)*
 Compose-App (nicht Swarm-Application — vier Container mit Startreihenfolge passen dort nicht rein). Traefik gehört Dokploy, keine zweite Instanz. **Traefik-Prometheus-Metriken aktivieren.** Env in der Dokploy-UI. Dokploys eigenes Postgres/Redis nicht mitbenutzen.

**Die eine Zeile, die entscheidet, ob auf dem VPS gebaut wird:**

```yaml
services:
  api:
    image: ghcr.io/g1ng4r/timseil-api:${IMAGE_TAG}   # ✅ zieht das fertige Image
    # build: ./api                                    # ❌ baut auf dem VPS
```

**Nie `build:` im Produktions-Compose.** Steht dort ein `build:`, baut Dokploy auf deiner Maschine — und dann hilft dir die ganze CI-Pipeline nichts. `IMAGE_TAG` ist der Commit-SHA und kommt als Env-Variable aus Dokploy; die Deploy-Pipeline setzt ihn und startet neu. `compose.dev.yaml` darf `build:` verwenden, das Produktions-Compose nicht.

Falls die GHCR-Pakete privat sind: Registry-Credential in Dokploy hinterlegen. Bei öffentlichem Repo und öffentlichen Paketen entfällt das.
**Auch bei 100 GB Pflicht:** Image-Retention auf die letzten 3–5 Stände begrenzen und `docker system prune -af --filter "until=168h"` als wöchentlichen Cronjob. Alte Image-Layer sind auf Dokploy-Maschinen die häufigste Ursache für volle Platten — häufiger als Logs.
*Fertig wenn:* Deploy läuft; `traefik_*`-Metriken sind abrufbar.

---

## Stufe E — CI/CD & Supply Chain · 5 Phasen

**E1 · CI-Grundpipeline** — Lint, Typecheck, Unit + Integration (Postgres-Service), `make gen`-Drift, Build beider Images. Caching, Matrix, Parallelität.
*Fertig wenn:* PR-Feedback unter 5 Minuten.

**E2 · Statische Analyse, Abhängigkeiten & Secrets** — `golangci-lint` streng, `gosec`, CodeQL, ESLint mit `typescript-eslint` strict, Komplexitätsgrenzen. Dazu `govulncheck`, `npm audit`, Trivy auf Images, `gitleaks` auf History **und** Diff, Dependabot für Go/npm/Actions/Docker.
**Die Pipeline selbst härten:** jeder Workflow bekommt `permissions:` explizit (`contents: read` als Default, `packages: write` nur beim Push, `id-token: write` nur für cosign). **Fremde Actions auf Commit-SHA pinnen, nicht auf Tags** — ein Tag lässt sich verschieben, genau so lief der `tj-actions`-Angriff. Kein `pull_request_target`, keine Fremdeingabe direkt in `run:`-Blöcke.
Lint-Regel: **nichts Geheimes hinter `NEXT_PUBLIC_`** — der Präfix bedeutet, es geht an den Browser.
**Vier Doku-Drift-Prüfungen** (Kapitel 12.2): OpenAPI ↔ Router-Parität · `stack.yaml`-Versionen ↔ `go.mod`/`package.json`/`compose.yaml` · README-Quickstart läuft durch · im Code referenzierte ADRs existieren. **Eine falsche Stack-Angabe bricht damit den Build** — genau der Fehler, den die Entwürfe hatten.
*Alles derselbe Handgriff — Scanner in dieselbe Workflow-Datei, ein Satz Gates.*
*Fertig wenn:* Findings ≥ HIGH blockieren; ein absichtlich eingecheckter Testschlüssel wird geblockt.

**E3 · SBOM, Signatur, Provenance** ⟶ *Grenzfall — siehe Kapitel „Zwei Pfade"* — Syft (CycloneDX), cosign keyless über Sigstore, GitHub-Actions-Attestation für SLSA-Provenance.
*Fertig wenn:* `cosign verify` bestätigt das Image; die Provenance ist öffentlich prüfbar. **Das ist ein Absatz in deiner Fallstudie wert.**

**E4 · Deploy-Pipeline** — die sieben Schritte aus dem Design: `PUSH → LINT → TEST → BUILD → PUSH IMG → DEPLOY → VERIFY`, Rollback bei ausbleibendem 200 nach 60 s.
**Gebaut wird ausschließlich in Actions**, nie auf dem VPS: `docker buildx` mit GitHub-Actions-Cache → Push nach GHCR mit dem Tag `sha-<short>` → die Pipeline setzt `IMAGE_TAG` über Dokploys API durch einen SSH-Tunnel und startet den Deploy.
*Korrigiert in E4b, drei Angaben.* `latest` ist **verboten** und `tools/deploy.sh` weist es ab: ein Rollback braucht einen Namen, den niemand umhängen kann (ADR 0033 §7). `v1.2.3` kommt mit `release-please` in E5, nicht hier. Und es ist kein Webhook — Dokploy besitzt die Umgebung, also wird sie über seine API geschrieben, sonst sagt das Panel danach etwas anderes als der laufende Stack (ADR 0033 §2).
*Fertig wenn:* Auf dem VPS läuft, was veröffentlicht wurde — `tools/check-deployed.sh --host` hält den `RepoDigest` der laufenden Container gegen den Digest, den GHCR unter demselben Tag ausliefert. Abwärtskompatible Migrations (expand/contract). Am Ende `POST /api/internal/deploy` mit gemessener Dauer.
*Korrigiert in E4b.* Hier stand „`docker system df` zeigt 0 B unter Build Cache". Das Kriterium war für eine Maschine geschrieben, auf der nur dieser Stack läuft; die Maschine trägt weitere Dienste, gemessen 50 Einträge / 782,9 MB, die ihnen gehören — daraus folgt über diesen Stack nichts. Dieselbe Klasse wie „nur 22, 80, 443". Der Digest-Vergleich misst dieselbe Behauptung direkt statt über ein Indiz: ein auf dem Host gebautes Image hat diesen Digest nicht — und überhaupt keinen `RepoDigest`.
*Fertig wenn:* Absichtlich kaputter Healthcheck löst Rollback aus — **einmal wirklich provozieren.**

**E5 · Zero-Downtime & Release-Automatik** — Compose kann kein Rolling Update.
*Korrigiert in E5b, und die Korrektur ist der Punkt.* Hier stand ein Zweizeiler mit `--scale api=2` und `--scale api=1`. **Beide Hälften sind falsch, im Labor gemessen:** die erste meldet `Container timseil-api-1 Recreate` — der bestehende Container geht mit runter, der Rollout tut also genau das, was er verhindern soll — und die zweite entfernt den **höchsten** Index, also den gerade gestarteten.

Was trägt, sind vier Schritte über **Dienstnamen**, weil Container-Indizes bei jedem Rollout wandern und Dokploys Command-Feld nur `docker compose`-Aufrufe annimmt. Zwei Schattendienste tragen die Router, während `api` und `web` neu angelegt werden:
```bash
docker compose up -d --remove-orphans --wait api2   # db, migrate, seed über depends_on
docker compose up -d --no-deps --wait web2
docker compose up -d --no-deps --wait api web
docker compose rm -s -f api2 web2
```
`tools/rollout.sh` hält sie an einer Stelle, `tools/deploy.sh` prüft vor jedem Deploy, dass das Panel sie fährt. Setzt Graceful Shutdown aus C1 voraus **und zwei Pausen mit einem Leser**: `SHUTDOWN_DELAY` schickt `/readyz` auf 503, während der Listener noch annimmt, und erst ein `loadbalancer.healthcheck` an Traefik liest das — ohne ihn ist die Pause ein Knopf ohne Wirkung (#65). ADR 0035. Plus `release-please`, das nach E5b als **E5c** kommt.
*Fertig wenn:* Ein Deploy, von außen über den öffentlichen Namen mitgeschrieben, zeigt **keine einzige Antwort, die nicht 200 ist** — eine Anfrage je Sekunde über die ganze Dauer. Falls nicht: ehrlich die **gemessene** Downtime in die Fallstudie schreiben statt „Zero-Downtime" zu behaupten.
*Korrigiert nach E4b, und die Korrektur ist der Punkt.* Hier stand „zeigt **null** 5xx" und „~3 s". Beides gemessen am 22.08.2026 beim Rollback-Drill: **rund zehn Sekunden je Container-Wechsel, und es sind keine 5xx, sondern 404.** Die Router sind Labels auf den Containern; verschwindet der Container, entfernt Traefik den Router ganz und antwortet mit seiner Standard-404. **Die alte Abnahme wäre also grün gewesen**, während jeder Besucher „diese Seite gibt es nicht" gelesen hätte — und ein Crawler die URL aus dem Index genommen hätte, was eine 502 nicht auslöst. Eine Abnahme, die 5xx zählt, misst an diesem Fehler vorbei. Die drei Sekunden waren geschätzt; zehn sind gemessen. [#143](https://github.com/G1NG4R/timseil-dev/issues/143)
*Stand nach E5b, im Labor.* Grundlinie auf derselben Anlage: 13×`404` auf `/`, 8×`404` auf `/api/health`. Nach der Reparatur, drei Läufe: `110 requests, 110×200` auf beiden Pfaden.
*Und in Produktion, 22.08.2026, 19:19 UTC — die Abnahme verfehlt:* 10×`404` auf `/api/health`, 1× auf `/`. Die Kette lief, aber der Deploy änderte acht Traefik-Labels, und dann beschreiben der alte Container und sein Zwilling denselben Router verschieden: Traefik verwirft beide (`defined multiple times with different configurations`). **Damit ist die Reichweite gemessen statt behauptet** — ein Deploy, der nur das Image tauscht, ist sauber; einer, der ein Routing-Label ändert, kostet einen Trichter. ADR 0035 nennt die Grenze, statt sie wegzubauen. Eine im Labor gemessene Zahl ist eine Zahl über Compose und den Docker-Provider, nicht über die Produktion — dieser Deploy hat genau das vorgeführt.

---

## Stufe F — Observability · 5 im Launch-Pfad, 6 danach

> Kommt **vor** dem Frontend. Wer erst instrumentiert, wenn die UI steht, baut Monitoring als Nachrüstung. „Pipeline before polish" steht in deiner eigenen Fallstudie.
>
> **F1–F5 sind Messen — die Uhr muss ab Tag 1 laufen. F6–F11 sind Auswerten und kommen nach dem Launch.**

### Launch-Pfad

**F1 · Strukturierte Logs & Korrelation** — `slog` JSON, Request-ID und Trace-ID in jeder Zeile, über den Web→API-Hop durchgereicht. PII-Scrubbing: keine E-Mail-Adressen, keine rohen IPs — **das ist keine Kür, deine Datenschutzseite verspricht es.**
*Fertig wenn:* Eine Request-ID findet **alle** zugehörigen Zeilen aus beiden Diensten.

**F2 · Observability-Stack lokal** — Prometheus (7 d **und** `retention.size=2GB`) und Loki (14 d **und** Compactor-Grenze ~5 GB, Stream-Limits) im selben Dokploy-Stack, bestehende Grafana-Instanz einbinden, Alloy als Collector. Eigene Volumes, damit die Größe messbar bleibt.
**Zeit-Retention allein reicht nicht:** eine Fehlerschleife füllt in Stunden Gigabytes, die 14-Tage-Regel greift erst in 14 Tagen. Auf einer Platte, die Postgres mitbenutzt, ist das der wahrscheinlichste selbstgebaute Ausfall.
*Alloy ist von Anfang an der Collector — beim späteren Umzug auf einen zweiten Host ändert sich nur sein Ziel. Die Anwendung merkt nichts.*
*Fertig wenn:* Metriken und Logs laufen ein; ein künstlich erzeugtes 5-GB-Log löst das Limit aus, statt die Platte zu füllen.

**F3 · Metriken & Recording Rules** — Traefik-Metriken scrapen, Recording Rules für p95, Fehlerrate und Verfügbarkeit. Node-Exporter, Postgres-Exporter. Loki-Labels **sparsam** — hohe Kardinalität ist der klassische Loki-Fehler und frisst auf einem Host direkt die Platte.
*Fertig wenn:* `histogram_quantile(0.95, ...)` liefert einen p95, der zu einem k6-Lauf passt.

**F4 · Externes Ausfallprotokoll & Uptime-Alarm** — GitHub-Actions-Probe alle 5 Minuten: `POST /api/internal/probe` wenn der Host lebt, **und bei jedem Zustandswechsel ein Commit** in `uptime-log.txt` auf dem **Datenbranch `ops-data`** (nicht `main` — sonst kollidiert es mit der Branch Protection und verschmutzt die Historie). Kommt der Host zurück, liest die API die Datei und füllt `ops_checks` rückwirkend auf. Dazu ein einfacher Uptime-Alert per Mail aus dem Workflow.
*Das löst das Kernproblem des Ein-Host-Betriebs: **der Ausfall wird aufgezeichnet, obwohl das aufzeichnende System tot war** — und die Aufzeichnung liegt öffentlich prüfbar in Git.*
*Fertig wenn:* Host abschalten → Mail kommt an, der Zustandswechsel steht im Repo, und nach dem Hochfahren erscheint der Ausfall als **Kerbe im Betriebsraster**, nicht als Lücke.

**F5 · SLO-Definition & Metrik-Snapshots** — SLIs und SLOs aus Anhang A **schriftlich festlegen** (nur die Definition, die Alarmierung folgt in F10). Der Go-Dienst fragt Prometheus über den Tunnel alle 5 Minuten per PromQL ab und schreibt Snapshots nach Postgres. Timeout kurz, Fehler nicht fatal.
*Die SLO-Definition kostet eine halbe Stunde und beantwortet die Frage „Was ist dein SLO?" ab Tag 1 mit einer Zahl statt mit „hab ich nicht".*
*Fertig wenn:* Prometheus-Container stoppen → die Seite zeigt weiter den letzten gültigen Wert mit Alter, statt zu brechen oder eine Null zu erfinden.

### Nach dem Launch

**F6 · OpenTelemetry im Backend** ⟶ *nach Launch* — Traces über HTTP-Handler, DB-Queries (`otelpgx`), ausgehende Calls. Semantic Conventions. Sampling: 100 % bei Fehlern, sonst rate-limitiert.

**F7 · OpenTelemetry im Frontend (serverseitig)** ⟶ *nach Launch* — Server-Traces aus Next.js, Verkettung mit der API über Trace-Kontext.

**F8 · Tempo & Trace-Log-Verknüpfung** ⟶ *nach Launch* — Tempo 3.0 monolithic, 7 d. Aus einem Trace per Klick auf die zugehörigen Logzeilen in Loki.

**F9 · Dashboards als Code** ⟶ *nach Launch* — vier Dashboards, provisioniert statt geklickt: **Service** (RED) · **Infrastruktur** (beide Hosts) · **Datenbank** · **Business**. Datasources ebenfalls provisioniert.
*Fertig wenn:* Den Observability-Stack von Null neu aufsetzen stellt alle Dashboards automatisch wieder her.

**F10 · Burn-Rate-Alerts, Infra-Alerts & Dead Man's Switch** ⟶ *nach Launch* — Burn-Rate nach Google-SRE-Muster (1 h/14,4× → sofort; 6 h/6× → Ticket). **Zu jedem Alert ein Runbook.** Infra: **Disk > 70 %** (Loki liegt auf derselben Platte wie Postgres, und alte Docker-Images wachsen schneller als die Logs), RAM, Zertifikatsablauf, Backup-Fehlschlag, Scrape-Ausfall.
**Dead Man's Switch:** Grafana macht das Alerting und läuft auf demselben Host — stirbt der Host, meldet Grafana nichts mehr. Der Actions-Probe aus F4 deckt den Grundfall ab; der Dead Man's Switch ergänzt ihn um alles, was *teilweise* kaputt ist (Grafana läuft, aber der Scrape steht).
*Fertig wenn:* Alloy anhalten, ohne den Host zu stoppen → du wirst benachrichtigt. Ein Alert ohne erprobtes Runbook zählt nicht.

**F11 · Frontend-Telemetrie mit Faro** ⟶ *nach Launch* — **kein zusätzlicher Dienst.** Faro Web SDK → `faro.receiver` in Alloy auf Host A → Logs nach Loki, Traces nach Tempo. Source Maps in der Pipeline erzeugen, **nicht öffentlich ausliefern**; Alloy löst sie über `location`-Blöcke auf. Release über den Commit-SHA. PII-Scrubbing wie F1, CORS auf deine Domain begrenzen. **Alerts nur auf neue Fingerprints**, nie auf jedes Vorkommen.
*Fertig wenn:* Ein absichtlich geworfener Frontend-Fehler erscheint mit **lesbarem TypeScript-Stacktrace** und korrekter Release-Zuordnung.

---

## Stufe G — Frontend-Fundament · 7 Phasen

**G1 · Tokens & Tailwind** — `tokens.css`, `globals.css`, `layout.css` nach `web/styles/`, **in dieser Reihenfolge** (`layout.css` zuletzt, damit seine Media Queries gewinnen). Tokens über `@theme inline`, **Tailwind-Default-Palette abschalten.**
*Fertig wenn:* `bg-blue-500` funktioniert **nicht** mehr; Lint verbietet Hex außerhalb `tokens.css`.

**G2 · Fonts & Themes** — `next/font/google` für Chakra Petch, Geist, JetBrains Mono → auf `--display`, `--body`, `--mono`. Sieben Paletten als `[data-theme]`. Anti-Flash-Snippet im `<head>` **vor jedem CSS**, mit CSP-Nonce.
*Fertig wenn:* Kein Request an fonts.gstatic.com, kein Flash, CSP blockt das Snippet nicht.

**G3 · Chrome** — Header (66/52 px, Logo, vier Einträge, `EN ▾`, Uhr), Footer in zwei Fassungen, mobiles Vollbild-Menü mit 44×44-Knopf. Aktiv = weiß, Cyan bleibt Hover und Aktion, auf `/` nichts aktiv.
**Die Uhr ist eine Hydration-Falle:** Server und Client rendern verschiedene Zeiten. Platzhalter serverseitig, `suppressHydrationWarning`, Befüllung im `useEffect`.
*Fertig wenn:* **Null** Hydration-Warnungen in der Konsole.

**G4 · API-Client & Caching** — Client aus generierten Typen. Serverseitig `http://api:8080`, clientseitig `/api`. Request-ID durchreichen. Next 16 Cache Components: statische Hülle geprerendert, Metriken über `use cache` mit Tags; Deploy invalidiert.
*Fertig wenn:* Ein Trace zeigt den ganzen Weg; Cache-Invalidierung beim Deploy getestet.

**G5 · i18n & SEO** — `/de`, `/fr` als Routen, `hreflang`, `<html lang>`, Switcher funktionsfähig — **nur EN befüllt**. `sitemap.ts`, `robots.ts`, RSS, OG über `next/og`, JSON-LD (`Person`, `WebSite`).
*Fertig wenn:* Rich-Results-Test grün; Switcher funktioniert auch mit leeren Sprachen.

**G6 · Zustandssprache** — die Bauteile aus STATE.05 zentral: Leerzustände, Fehlerpanels, DEGRADED, `— NO DATA`, Retry-Zähler, `StatusDot` (2,6 s Puls).
*Fertig wenn:* Jeder Zustand hat ein zweites Merkmal neben der Farbe.

**G7 · Komponenten-Galerie** — Route `/dev/components`, nur in Development: jedes Bauteil × jeder Zustand. Entwicklungswerkzeug **und** Ziel für Visual Regression.
*Fertig wenn:* Alle 15 Bauteile aus dem Handoff-Inventar mit allen dokumentierten Zuständen sichtbar.

---

## Stufe H — Seiten · 13 Phasen

Pro Phase: bauen, **Leerzustand zuerst**, Visual-Regression-Baselines, axe-core grün. Trefferflächen **nachmessen, nicht greppen** — dein eigener Konsistenzlauf hat genau diesen Fehler gefunden.

**Vor H1 einmalig einrichten:** Playwright-Vergleich gegen `make design` bei 1440 · 1081 · 1079 · 1024 · 899 · 719 · 390. Das ist kein Nice-to-have — **dein eigener Konsistenzlauf fand 18 Abweichungen über 11 Seiten, drei davon kritisch.** Genau beim Bauen vieler ähnlicher Seiten ist der Nutzen am höchsten, und genau dort entsteht die Drift.

**H1 · Case Study: Hero, Spec-Rail, Metriken** — zuerst gebaut, weil sie am Launch-Tag dein stärkstes Argument ist. Spec-Rail sticky bei `top: 96px`, Metrik-Kacheln mit `— NO DATA`, Problem-Abschnitt, Constraints.

**H2 · Case Study: Architektur, Operations, Incidents** — Compose-Ausschnitt, Phasen-Liste, 91-Tage-Betriebsraster mit anklickbaren Kerben, Incident-Log, Ergebnis.

**H3 · Homepage: Hero & Chrome-Integration** — Hero, Verfügbarkeits-Zeile, Terminal-Platzhalter (Bauteil kommt in Stufe J), Sektionsgerüst mit den vier Markern. **Reihenfolge ist in HOME.01 verbindlich**, die Marker müssen aufsteigend stehen.

**H4 · Homepage: SYS.01 Trainings-Log** — fünf Module, 22 Tracks, Belegzeilen aus `track_evidence`, Skala-Legende. Ruhezustand 28 %, Hover 100 % — **die Information darf nie nur in der Deckkraft liegen.**

**H5 · Homepage: SYS.02–04 & Fuß** — Systemliste, Contribution-Graph, 30-Tage-Betriebsstreifen (reine Anzeige), LOG-Sektion, Bio, Kontaktblock.

**H6 · Work Index** — Filter, Zähler, Live-Preview, Leerzustand bei 0 Treffern. Kein `source`-Filter (bei zwei Systemen filtert er von zwei auf zwei).

**H7 · About** — Trajectory-Rail, der große interaktive Moment: Jahre klickbar, ← → per Tastatur. Nur zwei belegte Jahre.

**H8 · Contact** — Formular mit Live-TX-Spur. Validierung **erst beim Absenden**, dann pro Feld. 8 s Client-Timeout. **Text bleibt nach Erfolg stehen** — die Message-ID ist der Beleg. Honeypot per CSS versteckt, nie `display:none` am Label.

**H9 · Blog Index & Post** — MDX, Filter, Suche, Lesemaß 68 Zeichen. Zwei Leerzustände im Index, einer im Beitrag.

**H10 · 404-Seite** — Router-Trace, montierte Routen, Rückwege. Der eine Alert-Rot-Moment.

**H11 · Error-Budget-Spiel** ⟶ *nach Launch* — `<canvas>`, vier Spuren (API, DB, QUEUE, CACHE), `A S D F`/Pfeile, Trefferfenster ±10 %, HUD mit SERVED, live gerechnetem p95, Uptime, fünf Budget-Kästchen, Ende `PAGED`. Zustand in **Instanzfeldern**, nicht React-State. Canvas fokussierbar, `role="application"`, Ergebnis zusätzlich als Text in `aria-live`. Bei `prefers-reduced-motion` nur auf ausdrückliche Eingabe.
*Eigenständiges Bauteil mit eigener Spielschleife — deshalb eine eigene Phase.*

**H12 · Legal, Privacy, Imprint** — muss mit dem übereinstimmen, was der Code tut. Nicht umgekehrt.

**H13 · 500 & globale Fehlerbehandlung** — Error Boundaries, `error.tsx`, `global-error.tsx`.
*Fertig wenn:* Ein absichtlicher Fehler zeigt die gestaltete Seite und erzeugt einen Trace.

---

## Stufe I — Bewegung · 3 Phasen

**I1 · Boot-Sequenz** — 2400 ms, 6 Frames, `sessionStorage`-Flag, abbrechbar per Klick/Taste/Scroll, **kein Layout-Shift**.
**Die dokumentierte Falle:** der dekodierte Text muss der Komponente gehören, die ihn anzeigt. Teilt die Headline den Render-Zyklus mit dem Init-Log, wird ihr Textknoten mitten im Scramble ersetzt und der Endzustand erscheint nie. **Verbindlich bleiben die 640 ms**, nicht der Prototyp-Workaround bei 1700 ms.
*Fertig wenn:* CLS = 0, zweiter Besuch startet im Ruhezustand.

**I2 · Scroll-Choreografie, Lenis & Fallbacks** — Header-Wipes `entry 12%`, Row-Stagger 60 ms, Graph-Fill 12 ms/Spalte, Parallax 0.4×/0.15×, Sticky Spec-Rail. Scroll-gekoppelte Moves laufen rückwärts, zeitbasierte nicht. `animation-timeline: view()` in `@supports` gekapselt (Firefox unterstützt es nicht), `animation-fill-mode: both` für den Endzustand, GSAP ScrollTrigger als Pin-Fallback. **Lenis muss ScrollTrigger füttern** (`ScrollTrigger.update` im Lenis-Callback), sonst kämpfen beide um die Scroll-Position.
*Das ist ein einziges Integrationsproblem — getrennt gebaut, garantiert es Nacharbeit.*
*Fertig wenn:* Firefox zeigt alles vollständig und benutzbar; `prefers-reduced-motion` schaltet Lenis und alle Bewegung ab.

**I3 · Ambient-Ebene** ⟶ *nach Launch* — CSS/Canvas-2D bei 6 %. Kein WebGL (Kapitel 3).
*Fertig wenn:* 60 fps auf gedrosseltem Mittelklasse-Handy.

---

## Stufe J — Terminal · 2 Phasen

**J1 · Kern, Befehle & API-Anbindung** — `help whoami stack projects work blog about cv contact clear` + das undokumentierte `matrix`.

**Was es ist:** ein **Befehlsregister**, keine Shell. Eine statische Map `Befehl → Handler`, jeder Handler gibt Zeilen zurück. **Simulierte Oberfläche, echte Daten** — die Ausgaben kommen aus derselben API wie der Rest der Seite, ausgeführt wird nichts.

**Die sieben Sicherheitsregeln — gelten auch ohne echte Shell:**

1. **Kein `eval`, kein `new Function()`, kein dynamischer Import aus Eingabe.** Unbekannter Befehl → fester Text. Die Map ist zur Bauzeit vollständig.
2. **Ausgabe ist Daten, nie HTML.** Zeilen sind `{ text, tone }` mit `tone` als Enum auf einen Token. **Nie `dangerouslySetInnerHTML`** — sonst ist der Echo eines unbekannten Befehls ein XSS-Vektor.
3. **Längen deckeln:** Eingabe max. ~200 Zeichen, Buffer max. ~500 Zeilen. Ein 100-KB-Paste darf weder rendern noch den Tab lahmlegen.
4. **Jeder Befehl zeigt auf einen festen Endpoint.** Keine Eingabe fließt in eine URL, keinen Pfad, keinen Query-Parameter. **Kein `curl`-artiger Befehl** — das wäre ein offener Proxy und bringt nichts.
5. **`cv` lädt einen festen Pfad.** Nie ein Pfadsegment aus Eingabe — Path Traversal.
6. **Keine Debug-Befehle.** Kein `env`, kein `version` mit Build-Details über das hinaus, was `/api/health` ohnehin öffentlich zeigt. Genau hier leaken solche Spielereien.
7. **`matrix` respektiert `prefers-reduced-motion`** und lässt sich jederzeit abbrechen.

*Fertig wenn:* Track-Zustand ändern → `stack`-Ausgabe ändert sich mit (als Test). **Und:** `<img src=x onerror=alert(1)>` als Befehl erzeugt eine Textzeile, kein Popup.

**J2 · Bedienung, A11y & CV-Weg** — History (↑/↓), Tab-Completion, `Ctrl+L`. `aria-label` an der Eingabe, `aria-live="polite"` an der Ausgabe, Terminal **zuletzt** in der Tab-Reihenfolge. **Lange Ausgaben nicht komplett vorlesen lassen** — bei mehr als ~10 Zeilen eine Zusammenfassung in die Live-Region, den Rest als normalen Text darunter. Mobil read-only mit sichtbarer Befehlsliste. `cv` lädt die PDF direkt — keine CV-Seite, kein Knopf, kein Nav-Eintrag, keine Route; mobil verlinkt die Fußzeile `CV → cv.pdf` als echtes `<a href download>` mit ≥ 44 px Trefferfläche.
*Fertig wenn:* Vollständig per Tastatur bedienbar, Screenreader liest die Ausgaben.

---

## Stufe K — Inhalt · 2 Phasen

**K1 · Korrekturen & englische Fassung** — die neun Issues aus Kapitel 7, insbesondere #1, #2 und #5. Dazu ~6 deutsche Absätze übersetzen und Platzhalter auf `[SOON]` · `[PLACEHOLDER]` · `[ASSET]` vereinheitlichen.
*Fertig wenn:* Keine deutschen Absätze in der EN-Fassung, alle neun Issues geschlossen.

**K2 · Blogeintrag, CV & Bilder** — erster Blogeintrag: der Bau dieser Seite (Material für fünf: Supply-Chain-Signierung, SLOs auf einem VPS, „kein CDN, und warum", das Ausfallprotokoll in Git). CV einseitig A4, helles Theme, Nachweis-Spalte; Größe, sha256, Stand beim Build. Portrait oder sichtbar leerer Slot. Trajectory mit den zwei belegten Jahren. **LinkedIn/X-Zeile nur rendern, wenn eine URL existiert.**

---

## Stufe L — Härtung & Betrieb · 8 Phasen, alle im Launch-Pfad

**L1 · Mail & DNS über OVH** ⟶ **vorziehen: direkt nach Stufe D bauen**, nicht am Ende. DMARC braucht `p=none` plus zwei Wochen Berichte, bevor du verschärfst — und ohne funktionierende Mail kannst du das Kontaktformular in C6 und H8 nicht end-to-end testen.
MX Plan, SMTP `ssl0.ovh.net`, SSL/TLS, Benutzername = vollständige Adresse.
**Die Regel, die sonst alles kippt:** `From:` muss dem SMTP-Konto entsprechen — also immer `From: contact@timseil.dev`, Besucheradresse in `Reply-To`. Quote ~200 Mails/h.
DNS in der OVH-Zone: `MX` auf `mx*.mail.ovh.net` · **genau ein** `v=spf1` mit `include:mx.ovh.com` (**OVHs Standard-SPF enthält teils `ptr` — per RFC 7208 abgekündigt, gehört raus**) · DKIM per Klick (Web Cloud → MX Plan → Domain → rotes DKIM-Abzeichen; Voraussetzung: OVH-Nameserver) · DMARC `p=none`, nach zwei Wochen `quarantine`.
*Postfach und Records sind eine Phase — ohne die Records ist der erste Formular-Test wertlos und schadet der Domain-Reputation.*
*Fertig wenn:* mail-tester ≥ 9/10.

**L2 · Threat Model (schlank)** — eine Stunde STRIDE über die sieben Container aus Kapitel 11.1. Jede Bedrohung bekommt eine Maßnahme oder wird bewusst akzeptiert, mit Begründung. **Steuert L3–L5** — deshalb steht es davor.
*Fertig wenn:* `docs/threat-model.md` liegt vor, und jede Zeile daraus hat einen Adressaten in L3–L5.

**L3 · Zugänge dichtmachen** — die zwei ernsten Funde aus Kapitel 11.2:
- **Dokploy-UI nur über SSH-Tunnel**, kein Traefik-Router, Port in der Firewall zu
- **Prometheus, Loki, Alloy: keine Traefik-Labels, keine `ports:`** — nur `expose:` im Docker-Netz
- **Grafana:** SSH-Tunnel oder öffentlich mit `GF_USERS_ALLOW_SIGN_UP=false`, GitHub-OAuth, `cookie_secure`, kein Anonymous-Zugriff
- **`/api/internal/*` zusätzlich am Traefik blocken**, nicht nur per Token — zwei Schichten
- Postgres ohne Port-Mapping, Rollenpaar `timseil_migrate` / `timseil_app`, `scram-sha-256`
*Fertig wenn:* `nmap` von außen zeigt **ausschließlich 22, 80, 443.**

**L4 · Security-Header, CSP & Container-Härtung** — CSP mit Nonce über `proxy.ts` (das Theme-Snippet braucht ihn), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `security.txt` nach RFC 9116. Container: `no-new-privileges:true`, `cap_drop: ALL`, read-only rootfs mit tmpfs für `/tmp`.
*Fertig wenn:* securityheaders.com = A oder besser, ohne dass die Seite bricht.

**L5 · Origin-Härtung & Konten** — Rate-Limit in Traefik, fail2ban auf dem Access-Log, Firewall nur 22/80/443, SSH per Key ohne Passwort, kein Root-Login, automatische Sicherheitsupdates.
Dazu die Konto-Ebene, die technisch nichts kostet und alles rettet: **2FA auf OVH und GitHub**, Registrar-Lock, **CAA-Record** (nur Let's Encrypt darf ausstellen), DNSSEC wenn OVH es für die Zone anbietet.
*Ein kompromittiertes OVH-Konto macht jede andere Maßnahme wertlos — Domain, DNS, Host und Mail hängen daran.*

**L6 · Backups mit Löschschutz** — nächtlicher `pg_dump` → S3 über Dokploys Backup-Ziel (rclone), 30 Tage, verschlüsselt. Volume-Backups für die Observability-Volumes. **Backups direkt nach S3, nicht ins lokale Dauerlager.**
**Der Zugangsschlüssel darf nicht löschen dürfen:** Bucket-Versionierung **und** Object-Lock, oder ein Schlüssel mit `PutObject`/`ListBucket` ohne `DeleteObject`. Die S3-Zugangsdaten liegen auf dem Host — wer den Host übernimmt, löscht sonst auch die Sicherungen.
**Wöchentliche automatische Restore-Verifikation in CI:** Dump in einen Wegwerf-Container zurückspielen, Zeilen zählen.
*Fertig wenn:* Restore-Drill durchgeführt, RPO und RTO dokumentiert — **und** ein Löschversuch mit dem Produktionsschlüssel scheitert.

**L7 · Datenschutz-Umsetzung** — Retention automatisiert (Access 14 d, Anwendung 7 d, Rate-Limit-IP 10 min) — **der Code muss einhalten, was die Datenschutzseite verspricht.** Absatz zum Formular: Name, E-Mail, Nachricht, Zeitpunkt, IP-Hash, Auftragsverarbeiter. Löschprozess.

**L8 · Performance-Budget & Lasttest** — Budget in CI: LCP < 2,0 s auf 4G, Initial JS < 150 KB gzip, CLS = 0, Lighthouse ≥ 90. k6: Baseline, Spike, 15-min-Soak.
*Fertig wenn:* Soak zeigt kein Speicherleck; Budget-Verstoß bricht den Build.

---

## Stufe M — Pre-Launch & Launch · 6 Phasen

**M1 · Chaos-Drills** — sechs Szenarien, jedes dokumentiert: DB-Container killen · **Disk mit Logs füllen** (der wahrscheinlichste selbstgebaute Ausfall) · API sättigen · Netz zwischen Web und API kappen · OVH-SMTP-Ausfall · **den ganzen Host neustarten und prüfen, ob das Ausfallprotokoll aus F4 den Ausfall korrekt nachträgt**.
*Fertig wenn:* Jedes Szenario hat Ergebnis, Behebung und Runbook-Eintrag. **Nebeneffekt: dein Incident-Log bekommt echten Inhalt** — die Seite braucht ihn.

**M2 · Accessibility-Audit** — manuell, nicht nur axe: Screenreader über Homepage, Fallstudie, Formular; Tastatur-only über alle Seiten; WCAG 2.2 AA dokumentiert. Prüfliste in Anhang B.

**M3 · Sicherheits-Review** — Prüfliste aus Anhang F abarbeiten. Kern: **`nmap` von außen zeigt ausschließlich 22, 80, 443** · Dokploy-UI und Prometheus/Loki/Alloy sind von außen nicht erreichbar · `/api/internal/*` gibt 404 statt 401 · öffentliche API liefert **keine** PII · CRLF in der Kontakt-Mail wird abgelehnt · Löschversuch auf dem Backup-Bucket scheitert · Fehlerantworten enthalten keine Stacktraces · 2FA auf OVH und GitHub aktiv.

**M4 · Inhalts-Endabnahme** — jede Zahl gegen ihre Quelle prüfen. Jede `[KLAMMER]` bewusst entschieden. Alle Links geprüft.

**M5 · Betriebsbereitschaft** — alle Alerts erprobt · alle Runbooks gelesen · Rollback erprobt · Restore erprobt · Uptime-Probe läuft ≥ 7 Tage.
**Am Tag 1 keine Uptime-Zahl zeigen** — bis 7 Tage Messung vorliegen, steht dort `— NO DATA`. Genau die Disziplin, die die Seite behauptet.

**M6 · Launch** — `timseil.com` → 301 · TLS und HSTS · Sitemap, RSS, OG, Favicon · 404 und 500 geprüft · **`curl https://timseil.dev/api/systems` liefert öffentlich dieselben Zahlen wie die Seite** · Repo öffentlich mit lesbarem README.

---

# Teil III — Post-Launch

| | Inhalt | Ergibt |
|---|---|---|
| **P0** | **Die 8 verschobenen Phasen** (siehe Kapitel „Zwei Pfade") | Traces, Tempo, Dashboards, Burn-Rate-Alerts, Faro, Threat Model, Error-Budget-Spiel, Ambient-Ebene — **fünf Blogeinträge** |
| **P0b** | **Observability auf einen zweiten Host** — Alloy auf `remote_write`, WireGuard-Tunnel, Firewall, Tempo dazu, **Loki-Chunks nach S3** (macht den Umzug trivial) | Kommt mit Projekt 2, das den Host mitträgt. **Blogeintrag: „Wann ich Monitoring getrennt habe — und warum nicht am ersten Tag"** |
| **P1** | **`vat-check` live bringen** | Zweites System → **erste `core`-Tracks werden möglich.** Der stärkste Hebel von allen. |
| **P2** | k3s statt Compose | Blogeintrag „Kubernetes auf einem nackten VPS" |
| **P3** | Redis für Cache + Rate-Limit | Track `Caching` → `applied` |
| **P4** | Terraform für DNS + VPS | Neues Modul im Log |
| **P5** | Pyroscope | Continuous Profiling, starkes Go-Argument |
| **P6** | DE/FR-Inhalte | Der Switcher wird eingelöst |
| **P7** | System 03 | Zweite Fallstudie, SYS.02-Pin wird sinnvoll |
| **P8** | Mimir | **nur mit echtem Anlass** |
| **P9** | GlitchTip | **nur wenn eine Grafana-Query die Fehler nicht mehr überblickt** |

---

## Anhang A — SLO-Definition

In **F9** festlegen und auf der Fallstudie zeigen:

| SLI | Messung | SLO | Fehlerbudget/30 d |
|---|---|---|---|
| **Verfügbarkeit** | Externer Probe (GitHub Actions), 5-min-Takt | 99,5 % | 3 h 39 min |
| **Latenz Seiten** | Traefik p95 | < 300 ms bei 99 % | — |
| **Latenz API** | Traefik p95, `/api/*` | < 150 ms bei 99 % | — |
| **Fehlerrate** | 5xx / alle Requests | < 0,1 % | — |
| **Zustellbarkeit** | erfolgreiche Formular-Sendungen | > 99 % | — |

Burn-Rate-Alerts: schnelles Fenster (1 h, 14,4×) → sofort; langsames (6 h, 6×) → Ticket.

**Der inhaltliche Gewinn:** Das Fehlerbudget auf der 404-Seite ist damit kein Spielkonzept mehr. Die fünf Kästchen im HUD können den echten Stand zeigen.

---

## Anhang B — A11y-Prüfliste

- [ ] Kontrast AA überall; 28-%-Ruhezustände sind dekorativ — Information steht zusätzlich als Zustandswort
- [ ] Fokus `outline: 1px solid #00E5FF; outline-offset: 3px`, nur `:focus-visible`, überall gleich
- [ ] Skip-Link zuerst in der Tab-Reihenfolge; Reihenfolge = Leserichtung, Terminal zuletzt
- [ ] Terminal: `aria-label` an der Eingabe, `aria-live="polite"` an der Ausgabe
- [ ] Kein Zustand nur über Farbe — jeder hat ein zweites Merkmal
- [ ] Touch: kein Hover; auf Mobil **ist** der Hover-Zustand der Ruhezustand; Ziele ≥ 44 px, **nachgemessen**
- [ ] Formular: `<label for>`, `aria-describedby`, `aria-invalid`, Fokus aufs erste Fehlerfeld, Status in `aria-live`
- [ ] Honeypot: `aria-hidden="true"` + `tabindex="-1"`
- [ ] Theme: `role="radiogroup"`, `aria-checked`, aktiv = volle Deckkraft **und** Akzentrahmen
- [ ] CV mobil: echtes `<a download>`, ≥ 44 px über Innenabstand mit negativem Außenabstand
- [ ] 404-Canvas: `tabindex="0"`, `role="application"`, Ergebnis als Text in `aria-live`
- [ ] `<html lang="en">`; Mono 9 ist die Untergrenze für Inhalt

---

## Anhang C — Die dreizehn Risiken

| Risiko | Warum es weh tut | Gegenmittel |
|---|---|---|
| **Design läuft dem Inhalt davon** | Filter für 10 Systeme, es gibt 2 | P1 hat Vorrang vor allem anderen Post-Launch |
| **Erfundene Zahlen** | Zerstört die These, in 30 s prüfbar | Golden-Test, nullable Typen, öffentliche API |
| **Entwürfe bleiben falsch** | Die Fallstudie beschreibt ihren eigenen Stack falsch | Neun Issues, Gate in K1 |
| **Loki wächst still** | Kardinalität ist der Haupttreiber | Labels sparsam, kurze Retention am Anfang, nach zwei Wochen nachmessen |
| **Monitoring stirbt mit dem Host** | Ausfall erscheint als Lücke statt als Ausfall — die falsche Art von Lücke auf dieser Seite | Externes Ausfallprotokoll: Actions-Probe committet Zustandswechsel ins Repo, API füllt rückwirkend auf (F4) |
| **Volle Platte legt Postgres lahm** | Loki liegt auf derselben Platte wie die Datenbank — ein selbstgebauter Ausfall | Größen-Limit zusätzlich zur Zeit-Retention, eigenes Volume, Disk-Alert ab 70 %, Docker-Prune-Cron (F2, Kap. 10) |
| **Alert-Müdigkeit** | Ein Werkzeug, dessen Meldungen man wegklickt, ist wertlos | Alerts nur auf neue Fingerprints und Ratenausschläge |
| **Mail nie eingerichtet** | Einziger Konversionspunkt schweigt | L1/L2 sind Launch-Blocker |
| **Dokploy-UI öffentlich** | Vollzugriff auf Host, Deploys **und alle Secrets** — das lohnendste Ziel der Maschine | Nur SSH-Tunnel, kein Traefik-Router (L3) |
| **Observability-Dienste ohne Auth** | Prometheus und Loki haben keine; der Tunnel-Schutz entfiel mit dem Zusammenlegen auf einen Host | Keine Labels, keine `ports:` — Abnahme per `nmap` (L3) |
| **Backups löschbar bei Kompromittierung** | Klassisches Ransomware-Muster: Schlüssel liegt auf dem Host | Object-Lock oder Schlüssel ohne `DeleteObject` (L6) |
| **Build landet auf dem VPS** | Getestetes und laufendes Artefakt sind nicht dasselbe — die Signatur gilt für ein Image, das nie lief | `image:` statt `build:` im Produktions-Compose (D3); Abnahme: laufender Digest = veröffentlichter Digest (`make check-deployed-host`, E4b) |
| **Bundle wächst unbemerkt** | „Schnell auf dem Handy" ist Constraint 04 | Budget in CI, Build bricht |

---

## Anhang D — Zeitplan & Sessiondauer

### Wie lange eine Session wirklich dauert

Eine Session ist nicht nur „Claude Code baut". Sie besteht aus: **Plan Mode lesen und korrigieren (~10 min) · bauen und testen · deinen Diff-Review (10–25 min) · nachbessern, was der Review gefunden hat (oft nochmal 15–30 min) · PR und Merge (~5 min).** Deshalb liegt selbst eine kleine Phase selten unter einer Stunde.

| Phasentyp | Phasen | Realistisch |
|---|---|---|
| **Dokumente & Entscheidungen** | A3, L2 | **1–1,5 h** |
| **Setup & Konfiguration** | A1, A2, A4, D1–D3, E1, E2, F2 | **1–2 h** — mit dickem Ende: eine Dokploy- oder DNS-Eigenheit frisst auch mal einen Abend |
| **Backend mit Tests** | B1–B4, C1–C7, F1, F3, F5 | **2–3 h** — hier ist Claude Code am stärksten: klarer Contract, alles testbar |
| **CI/CD** | E3, E4, E5 | **2–4 h** — Deploy-Debugging ist schlecht vorhersagbar |
| **Frontend-Fundament** | G1–G7 | **2–4 h** |
| **Seiten gegen hi-fi Design** | H1–H13 | **3–5 h** — die am meisten unterschätzte Kategorie |
| **Bewegung** | I1, I2 | **4–6 h** — Timings sind spezifiziert, das *Gefühl* nicht |
| **Terminal** | J1, J2 | **2–4 h** |
| **Inhalt** | K1, K2 | **1–2 h** — Engpass ist dein Review, nicht das Schreiben |
| **Härtung & Ops** | L1, L3–L8 | **1,5–3 h** plus externe Wartezeiten |
| **Launch & QA** | M1–M6 | **2–4 h** |

**Warum die Seiten-Phasen so teuer sind:** Pixelgenau gegen ein hi-fi Design bei sieben Breiten heißt bauen → screenshotten → vergleichen → nachziehen → wieder screenshotten. Jede Schleife kostet Minuten, und du brauchst viele. Das ist keine Schwäche des Werkzeugs, das ist die Aufgabe.

**Gesamt: ~82 Sessions, im Schnitt ~2,75 h → rund 225 Stunden.**

### Mehrere Sessions pro Tag

**Zwei pro Tag sind realistisch. Drei meistens nicht — und der Engpass bist du, nicht Claude Code.** Ein Diff sorgfältig zu reviewen ist kognitiv teuer, und in der dritten Session eines Abends fällt die Reviewqualität spürbar ab. Eine schlecht reviewte Phase kostet dich später mehr, als die eingesparte Session bringt.

Drei Regeln, die sich bewähren:

1. **Review von Session 1 abschließen, bevor Session 2 startet.** Reviews stapeln funktioniert nicht — du verlierst den Kontext beider.
2. **Gleiche Typen paaren.** Zwei Backend-Phasen hintereinander laufen gut, gleicher Denkmodus. Backend dann Frontend heißt Kontextwechsel auch für dich.
3. **Keine Bewegungs- oder Seiten-Phase als zweite Session des Abends.** Die brauchen die meiste Geduld, und Geduld ist abends zuerst alle.

**Bei zwei Sessions an vier Abenden pro Woche** (~18 h) landest du bei **~13 Wochen bis online**. Bei Vollzeit mit zwei bis drei Sessions täglich: **9–10 Wochen**.

**Das Risiko ist nicht die Schätzung, sondern ihr Ausreißer.** Phasen überziehen nicht um 20 %, sie überziehen um 200 % — wenn eine Dokploy-Eigenheit, ein Next.js-Cache-Verhalten oder ein Font-Rendering nicht so ist wie dokumentiert. Rechne mit zwei bis drei solchen Abenden über das Projekt.

**Die Abbruchregel:** Läuft eine Phase über ~4 Stunden oder kompaktiert Claude Code mitten drin den Kontext, war sie zu groß. Aufhören, aufteilen, notieren — nicht durchziehen.

### Phasen mit externer Uhr

Zwei Dinge im Plan hängen an Fristen, die du nicht beschleunigen kannst:

| Was | Vorlauf | Konsequenz |
|---|---|---|
| **Uptime-Messung** (F4) | **≥ 7 Tage vor Launch** | Sonst zeigt die Seite am Tag 1 keine ehrliche Uptime-Zahl |
| **DMARC** (L1) | `p=none` → **2 Wochen Berichte** → `quarantine` | Sonst verschärfst du die Regel erst nach dem Launch |

**Deshalb eine Sequenzierungs-Korrektur: L1 (Mail & DNS) gehört nicht ans Ende, sondern direkt nach Stufe D.** Sobald ein deploybarer Stack steht, richtest du Postfach und Records ein. Zwei Gewinne: die DMARC-Uhr läuft früh genug, **und** du kannst das Kontaktformular in C6 und H8 überhaupt end-to-end testen, statt auf gut Glück zu bauen.

### Stufenübersicht

| Stufe | Launch-Pfad | Nach Launch | Sessions bis Launch |
|---|---|---|---|
| A Fundament | 4 | — | 5 |
| B Contract & Daten | 4 | — | 6 |
| C API | 7 | — | 9 |
| D Container | 3 | — | 4 |
| **L1 vorgezogen** | 1 | — | 1 |
| E CI/CD & Supply Chain | 4 (+1 Grenzfall) | 1 | 6–8 |
| F Observability | 5 | 6 | 6 |
| G Frontend-Fundament | 7 | — | 9 |
| H Seiten | 12 | 1 | 16 |
| I Bewegung | 2 | 1 | 5 |
| J Terminal | 2 | — | 3 |
| K Inhalt | 2 | — | 4 |
| L Härtung (Rest) | 7 | — | 9 |
| M Launch | 6 | — | 7 |
| **Summe** | **66** | **8 (+1)** | **~82** |

Stufe H und I ziehen erfahrungsgemäß über — die Sessions-Spalte hat das eingepreist.

---

## Anhang E — Erste Session

```bash
mkdir timseil-dev && cd timseil-dev && git init -b main
mkdir -p docs/design docs/adr docs/runbooks docs/architecture
cp -r /pfad/zu/design_handoff_timseil_dev/* docs/design/
cp /pfad/zu/timseil-dev-masterplan.md docs/build-plan.md
git add -A && git commit -m "chore: import design handoff and build plan"
# Remote anlegen, pushen, dann auf GitHub: Branch Protection für main setzen
```

Dann Claude Code, `/clear`:

```
Lies docs/build-plan.md Teil I vollständig und docs/design/README.md.
Sieh dir docs/design/code/tokens.css und tokens.ts an.

Leg dann an:
1. CLAUDE.md — Inhalt steht in Abschnitt 8.3
2. docs/design/INDEX.md — die Zuordnung Phase ↔ Blatt, Regel in Abschnitt 6.3
3. backlog.md — Vorlage aus Abschnitt 8.7
4. .github/pull_request_template.md — Vorlage aus Abschnitt 8.8

Danach Plan Mode für Phase A1. Wo bist du unsicher?
Schreib noch keinen Code, und pushe nichts.
```

**Ab Phase A2 gilt die Schleife aus 8.5:** Branch von `main`, Session, Plan Mode, bauen, dein Review, du pushst, PR, CI grün, Squash-Merge.

---

## Anhang F — Sicherheits-Prüfliste (M3)

**Exposition**
- [ ] `nmap` von außen: **nur 22, 80, 443**
- [ ] Dokploy-UI von außen nicht erreichbar (SSH-Tunnel)
- [ ] Prometheus, Loki, Alloy von außen nicht erreichbar
- [ ] Grafana: kein Anonymous-Zugriff, Signup aus, `cookie_secure`
- [ ] Postgres ohne Port-Mapping

**Anwendung**
- [ ] `/api/internal/*` gibt von außen 404, nicht 401
- [ ] Öffentliche API liefert **keine** PII — Kontaktnachrichten nirgends lesbar
- [ ] Fehlerantworten ohne Stacktraces, ohne DB-Fehlertexte
- [ ] `/api/docs` dokumentiert keine internen Endpoints
- [ ] CRLF in Name/E-Mail des Formulars wird abgelehnt
- [ ] Rate-Limit greift (Lasttest), IP nur als Hash gespeichert
- [ ] Token-Vergleich konstantzeitig (Timing-Test)
- [ ] Kein `NEXT_PUBLIC_`-Wert enthält ein Geheimnis
- [ ] Terminal: `<img src=x onerror=alert(1)>` als Befehl erzeugt Text, kein Popup
- [ ] Terminal: kein Befehl nimmt einen Pfad oder eine URL aus der Eingabe

**Lieferkette**
- [ ] Alle Workflows mit explizitem `permissions:`
- [ ] Fremde Actions auf Commit-SHA gepinnt
- [ ] `gitleaks` über die volle History grün
- [ ] `cosign verify` bestätigt das laufende Image
- [ ] Laufender Digest = veröffentlichter Digest (`make check-deployed-host`) — ersetzt „kein Build-Cache auf dem VPS", das auf einer geteilten Maschine nichts mehr über diesen Stack aussagt (E4b)

**Betrieb & Konten**
- [ ] Löschversuch auf dem Backup-Bucket mit dem Produktionsschlüssel **scheitert**
- [ ] Restore-Drill durchgeführt, RPO/RTO dokumentiert
- [ ] 2FA auf OVH **und** GitHub aktiv
- [ ] Registrar-Lock gesetzt, CAA-Record vorhanden
- [ ] SSH: kein Passwort-Login, kein Root-Login, fail2ban aktiv
- [ ] `security.txt` unter `/.well-known/` erreichbar

**Header & Transport**
- [ ] securityheaders.com ≥ A
- [ ] CSP ohne `unsafe-inline` (Nonce für das Theme-Snippet)
- [ ] HSTS aktiv, TLS-Konfiguration geprüft

---
