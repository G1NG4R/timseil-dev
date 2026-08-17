# ADR 0012 — Das Stack-Manifest wird bei `make gen` aufgelöst und eingebettet

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B4, D2, G1, F1, E1
**Invarianten:** **1** (keine erfundenen Zahlen — eine Versionsnummer ist eine Zahl)

## Kontext

Die Entwürfe trugen „React Router 7" und „PostgreSQL 16" auf einer Seite, die
weder das eine noch das andere benutzte. Kein Tippfehler: eine Angabe, die jemand
einmal hingeschrieben und nie wieder nachgeprüft hat. Auf einer Seite, deren
gesamtes Argument „das hier ist alles überprüfbar" lautet, ist das die peinlichste
mögliche Sorte Fehler.

Build-Plan Kapitel 12.3 nennt die Lösung: nicht prüfen, sondern die Angabe so
bauen, dass sie nicht driften kann. `systems.stack` wird aus einer kuratierten
Datei befüllt, und die Versionen darin kommen aus `go.mod`, `package.json` und
`compose.yaml`.

Offen war nur eins: **wann** wird aufgelöst. Zur Laufzeit wäre der naheliegende
Weg — der Seed liest `stack.yaml` und die Quelldateien, wenn er läuft.

## Entscheidung

**`stack.yaml` trägt Namen und Quellzeiger, niemals Versionen. `make gen` löst sie
auf und schreibt `api/internal/seed/stack.gen.json`, das der Seed einbettet.**

Ein Eintrag hat entweder `from` (und meist `key`) und wird aufgelöst, oder er hat
nur einen `name` und trägt gar keine Version. Ein literales `version:` in
`stack.yaml` wird abgelehnt — das ist die eine Regel der Datei.

## Konsequenzen

- **Zur Laufzeit ginge es nicht.** Ab D2 läuft der Seed aus einem Image, in dem
  weder `stack.yaml` noch `go.mod` noch `package.json` liegen. Laufzeit-Auflösung
  hätte lokal funktioniert und in Produktion gefehlt — der unangenehmste
  Fehlerzeitpunkt, den man wählen kann.
- **Zwei Wächter, zwei verschiedene Aussagen.** Die Prüfsumme über `GENERATED`
  sagt „committed ist gleich neu erzeugt", also: wer `next` in `package.json`
  hochzieht und `make gen` vergisst, wird rot. `make check-stack` sagt „jeder
  Eintrag löst noch auf und niemand hat eine Version getippt" und **nennt den
  Eintrag** — eine Prüfsumme kann das nicht.
- **Ein Eintrag darf erst existieren, wenn seine Quelle existiert.** Traefik,
  Prometheus, Loki, Grafana, Alloy und Tailwind stehen deshalb heute nicht in
  `stack.yaml`; die Phase, die eine davon landet, hängt ihre Zeile an. Die Datei
  wächst mit dem Stack, statt ihn zu versprechen.
- **Zwei Komponenten, einheitlich.** `16.3.1` wird `16.3`, `1.26.0` wird `1.26`,
  `postgres:18.6-alpine` wird `18.6`. Ein Patchlevel auf einer Portfolioseite ist
  Rauschen und garantiert zusätzlich, dass die Seite am Dienstag veraltet ist.
  Gibt die Quelle nur ein Major her (`.nvmrc` sagt `24`), bleibt es `24` — eine
  Nachkommastelle zu erfinden wäre genau das Verbotene.
- **Kein neues Paket.** `gopkg.in/yaml.v3` ist bereits direkte Abhängigkeit des
  api-Moduls. Der Resolver ist Go, weil eine Caret-Range aus `package.json`, eine
  `require`-Zeile aus `go.mod` und ein Image-Tag aus einer Compose-Datei drei
  Parser sind — mit awk wäre es ein vierter.
- **`systems.stack` bleibt `text[]`.** Die Spaltenform war in B2 zur Diskussion
  (`{name, version}[]`) und wurde verworfen; der Driftschutz liegt hier, nicht in
  der Spalte.

### Was das kostet

**Ein Generierungsschritt mehr, und ein Zustand, der veralten kann.** Wer
`stack.yaml` ändert und `make gen` vergisst, hat eine Datei im Baum, die nicht
zur Quelle passt. Das ist der Preis dafür, dass Produktion ohne Repo auskommt —
und `make check` macht ihn zu einem roten Check statt zu einem stillen Fehler.

**Die Auflösung ist auf vier Quellarten beschränkt** (`.nvmrc`, `go.mod`,
`*.json`, `compose*.yaml`). Eine fünfte kostet Code. Das ist bewusst: ein
generischer Pfad-Ausdruck über beliebige Dateiformate wäre ein kleines
Konfigurationssystem, und dann steht die Frage „was hat diese Zeile eigentlich
gelesen" wieder im Raum.

**Heute zeigt `PostgreSQL` auf `compose.dev.yaml`**, weil `compose.yaml` erst in
D2 entsteht. Kapitel 12.3 nennt `compose.yaml`; D2 stellt um, und dann müssen
beide Dateien denselben Tag tragen.

## Verworfene Alternativen

**Auflösen zur Laufzeit im Seed** — siehe oben: fehlt genau dort, wo es zählt.

**Die Versionen direkt in `stack.yaml` pflegen** — dieselbe handgepflegte Angabe
wie vorher, nur an einem neuen Ort. Der Fehler der Entwürfe wäre wörtlich
reproduziert.

**Ein CI-Test, der Seite gegen `go.mod` vergleicht** (Kapitel 12.2, Prüfung 2) —
prüft eine Behauptung, statt sie unmöglich zu machen. Kapitel 12.3 sagt selbst,
dass die bessere Lösung eine Konstruktion ist, kein Test.

**`{name, version}[]` als `jsonb`-Spalte** — in B2 verworfen: Handbuch Kapitel 10,
Build-Plan 12.3 und der eingefrorene Contract sagen alle `string[]`.

**Node statt Go für den Resolver** (wie `tools/gen-skill-states.mjs`) — Node hat
keinen YAML-Parser an Bord, und `js-yaml` liegt nur transitiv über `@redocly/cli`
in `web/node_modules`. Sich auf eine transitive Abhängigkeit zu stützen, die
niemand deklariert hat, ist eine Abhängigkeit ohne Rückfrage.

## Belege

Build-Plan Kapitel 12.2 und 12.3, Phase B4, Kapitel 12.4 (dieselbe Idee für die
README-Badges), `contract/openapi.yaml` (`System.stack`),
`api/migrations/00002_systems.sql` (die Spalte und ihr Kommentar), ADR 0013.
