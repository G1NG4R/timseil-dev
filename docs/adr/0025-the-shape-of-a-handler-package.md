# ADR 0025 — Die Form eines Handler-Pakets, und warum sie bleibt

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C1–C7, alle künftigen Endpoints
**Invarianten:** 1 (`null` → `— NO DATA`), 3 (Metriken nur für `live`)

## Kontext

Dieser ADR wird nachgetragen, und der Anlass ist die Triage nach Stufe C —
Schritt 3 aus Kapitel 8.6 fragt, ob unterwegs eine nicht-offensichtliche
Entscheidung gefallen ist, die keinen ADR hat. Zwei sind es.

Sieben Handler-Pakete tragen dieselbe Form: `health`, `systems`, `training`,
`contributions`, `contact`, `badge`, `intake`. Alle sieben haben ein schmales
`Queries`-Interface, eine Methode in der Signatur von
`httpx.StrictServerInterface`, und einen dünnen Adapter davor. **Keine Zeile im
Repository sagt, dass das die Form ist.** Sie ist durch Nachahmung entstanden:
C1 hat `health` geschrieben, C2 hat es abgeschaut, und ab C3 war es die Art, wie
man hier einen Endpoint baut.

Das allein wäre kein ADR wert — eine Konvention, die sich sieben Mal von selbst
durchsetzt, ist gesund. Der Grund für diesen hier ist ein anderer: **die
Begründung, die zwei Drittel dieser Form trug, ist in C7 weggefallen.**

ADR 0016 hat die strict-Signatur und den Adapter ausdrücklich als Übergang
begründet:

> „Die Handler werden trotzdem in der Form des Strict-Servers geschrieben. […]
> Ein Adapter von fünfzehn Zeilen verbindet das mit der Route. Die Phase, die den
> letzten Handler liefert, tauscht `internal/server` auf `HandlerWithOptions` um."

ADR 0024 hat diesen Umbau abgesagt. Die Form ist geblieben. Eine Konvention,
deren ursprünglicher Zweck gestrichen wurde und die trotzdem weitergeführt wird,
ist entweder gut begründet oder Kargo-Kult — und der Unterschied gehört
aufgeschrieben, bevor der achte Endpoint sie zum achten Mal kopiert.

## Entscheidung

**Ein Endpoint wird als Paket gebaut, mit drei Teilen, und jeder Teil hat einen
Grund, der ohne den generierten Router auskommt.**

### 1. Ein schmales `Queries`-Interface je Paket

Nicht `*store.Queries`, sondern ein handgeschriebenes Interface über genau die
Abfragen, die dieses Paket braucht — `badge.Queries` hat zwei Methoden,
`intake.Queries` drei.

Der Grund ist Testbarkeit ohne Postgres, und er ist wörtlich messbar: die
interessanten Zweige dieser Endpoints sind die kaputten. Eine leere Datenbank,
eine unerreichbare, ein System ohne Messreihe, eine Zeile, die es schon gab. Mit
einem Stub sind das Tabellenzeilen; mit einem echten Pool wären es db-getaggte
Tests, die zwei Minuten laufen und nur in einer Umgebung mit Docker.

`sqlc` erzeugt bewusst kein Interface (`emit_interface: false`, ADR 0016). Diese
Entscheidung ist die Kehrseite davon: nicht ein breites generiertes Interface,
sondern ein enges handgeschriebenes je Aufrufer.

**Was das nicht ist:** eine Abstraktion über die Datenbank. Es gibt eine
Implementierung, sie ist generiert, und niemand plant eine zweite. Es ist eine
Naht für Tests, und sie heißt so.

### 2. Die strict-Methode ist der Handler

`GetHealth(ctx, request) (response, error)` — die Signatur aus
`httpx.StrictServerInterface`. Sie bleibt, obwohl der generierte Router nicht
montiert wird, und der Grund ist nicht mehr der Umbau:

- **Sie zwingt die Antwort in die generierten Antwortobjekte.** Ein Handler mit
  einem `http.ResponseWriter` schreibt Header, die im Contract nicht stehen. Ein
  Handler, der `GetHealth200JSONResponse` zurückgeben muss, kann genau die
  Header setzen, die die Operation deklariert — der Contract-Test hält beides
  gegeneinander, und ADR 0009 verlangt es.
- **Sie trennt „konnte nicht beantwortet werden" von „so lautet die Antwort".**
  Ein `error` ist ein Problem-Dokument, ein Antwortobjekt ist eine Aussage über
  das System. Dass eine leere Datenbank kein Fehler ist, sondern der Zustand am
  ersten Tag, wird dadurch eine Typfrage statt einer Sorgfaltsfrage.
- **Sie hält den Umbau offen**, ohne dass das der Grund ist. ADR 0024 §„Was das
  kostet" sagt, dass nichts ihn verbaut; das ist eine Folge, kein Zweck.

### 3. Der Adapter ist die Stelle für alles, was die Signatur nicht trägt

Ursprünglich „fünfzehn Zeilen, die den Handler mit der Route verbinden". Nach
Stufe C ist er mehr, und **das ist der eigentliche Grund, warum die Form
überlebt hat**: die strict-Signatur bekommt einen Context und einen dekodierten
Body, und mehrere Dinge, die dieser API wichtig sind, stehen weder im einen noch
im anderen.

| Was | Wo | Warum nicht in der strict-Methode |
|---|---|---|
| `If-None-Match` binden | `health`, `systems`, `training`, `contributions` | ein Header, kein Parameter |
| Größenbegrenzung, `DisallowUnknownFields`, Content-Type-Gate | `contact`, `intake` | der generierte Decoder hat keins davon (ADR 0024 §1) |
| `wireBody` statt `openapi_types.Email` | `contact` | der generierte Typ normalisiert und verliert Feldnamen (ADR 0021) |
| Origin und Client-Adresse in den Context (`facts`) | `contact` | steht im Request, nicht im Body |
| Fehler → Problem-Dokument (`writeError`) | alle | die generierten Fehlerobjekte verlieren `requestId`, `instance` und `no-store` (ADR 0024 §5) |

Sechs von vierzehn Operationen brauchen mindestens eine dieser Zeilen. Der
Adapter ist keine Übergangslösung mehr, sondern die Schicht, in der diese API
strenger ist als ihr Generator.

## Konsequenzen

**Der achte Endpoint kopiert eine Form, deren Gründe nachlesbar sind** — statt
einer, die sich aus einem abgesagten Umbau herleitet.

**Ein Paket ohne `contract_test.go` fällt auf.** Die Form macht die Prüfung
möglich; dass sie eine Konvention und keine Zusicherung ist, ist die Restlücke
aus ADR 0024 und als Issue gefiltert.

**Ein Endpoint, der nichts Eigenes braucht**, hat trotzdem drei Teile. Bei
`badge` sind die drei Adapter je sechs Zeilen und tun nichts, was der generierte
Wrapper nicht auch täte.

### Was das kostet

**Sieben `Queries`-Interfaces, die zusammen dasselbe beschreiben wie
`*store.Queries`.** Eine neue Abfrage, die zwei Pakete brauchen, wird an zwei
Stellen deklariert. Bezahlt für Tests, die ohne Docker laufen.

**Die Zweiteilung ist bei den einfachen Endpoints Zeremonie.** `badge` hätte
drei `http.HandlerFunc` sein können. Der Preis dafür, dass die drei anspruchsvollen
Endpoints und die drei einfachen gleich aussehen, ist, dass die einfachen
komplizierter aussehen als sie sind.

**Der Adapter ist untestbar getrennt vom Handler.** Beide Teile werden in
denselben Tests durchlaufen, also gibt es keine Stelle, an der der Adapter
allein geprüft wird — was in C7 aufgefallen ist: die Origin-Prüfung des
Contact-Endpoints lief in jedem Test über `ServeHTTP` und war deshalb blind
dafür, ob `ServeHTTP` überhaupt noch auf der Route liegt (ADR 0024 §4).

## Verworfene Alternativen

**`*store.Queries` direkt in den Handler.** Ein Typ weniger je Paket. Dafür
braucht jeder Test eine Datenbank, und die Zweige, die diese Endpoints
interessant machen, sind genau die, die man mit einer echten Datenbank am
schwersten herstellt.

**Ein gemeinsames `Queries`-Interface für alle Handler.** Eine Deklaration statt
sieben. Dafür implementiert jeder Stub Methoden, die sein Test nie ruft, und
eine neue Abfrage zwingt sieben Stubs zur Änderung.

**Nach ADR 0024 auf schlichte `http.HandlerFunc` zurückbauen.** Ehrlich, wenn
der Umbau der einzige Grund für die strict-Form gewesen wäre. Er war es nicht —
§2 und §3 stehen ohne ihn. Und der Rückbau wäre eine Neufassung von sieben
Paketen für eine Vereinfachung, die bei den drei anspruchsvollen sofort wieder
zurückgebaut werden müsste.

**Diesen ADR nicht zu schreiben.** Die Form funktioniert, niemand hat sich
beschwert. Sie beruft sich aber auf einen Satz aus ADR 0016, den ADR 0024
gestrichen hat — und die nächste Person, die das bemerkt, hat die Wahl zwischen
Kargo-Kult und einem Rückbau, den niemand will.

## Belege

Build-Plan Kapitel 8.6 (die Triage fragt danach) · ADR 0009 (Problem Details,
Cache-Header im Contract) · ADR 0016 (`emit_interface: false`, und die
ursprüngliche Begründung der strict-Form) · ADR 0021 (`wireBody`, `facts`) ·
ADR 0024 (der abgesagte Umbau, die fünf Umgehungen, die stille Prüflücke) ·
`api/internal/{health,systems,training,contributions,contact,badge,intake}`
