# ADR 0002 — Blog als MDX im Repo, nicht im CMS

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** H9, K2, E5
**Invarianten:** keine unmittelbar; die Zuordnung Blog → System stützt Invariante 5
(Belege zeigen nie ins Leere)

> **Nachtrag 19.08.2026 ([#113](https://github.com/G1NG4R/timseil-dev/issues/113)):** Der Host trägt seit dem 18.08.2026 12 GB RAM
> und 100 GB Platte; die 40 GB weiter unten bleiben als Aufzeichnung stehen. Das
> Argument trägt weiter — es stand ohnehin auf dem Datenweg und der Aussage der
> Datenschutzseite, nicht auf der Größe der Platte.

## Kontext

Die Seite braucht einen Blog: die Fallstudien verweisen auf Post-Mortems, und
**ohne Post-Mortem keine Kerbe** — Invariante 4 macht `post_slug` zur
Pflichtangabe eines Incidents. Der Blog ist damit kein Beiwerk, sondern
Bestandteil des Belegsystems.

Der Autor ist eine Person. Die Beiträge sind selten, lang und technisch; sie
enthalten Code, Diagramme und gelegentlich eine Komponente.

## Entscheidung

**MDX-Dateien in `web/content/posts/`, versioniert im Repo**, gerendert über
`@next/mdx`. Frontmatter trägt unter anderem `systemId`, damit die Zuordnung
Blog → System **in den Daten** steht und nicht daran hängt, in welcher Sektion
ein Beitrag zufällig gerendert wird.

## Konsequenzen

- Ein Beitrag durchläuft denselben Weg wie Code: Branch, PR, Review, Squash-Merge,
  Deploy. Ein Tippfehler hat eine Historie.
- Kein zusätzlicher Dienst, kein zusätzliches Volume, keine zweite Datenbank auf
  einem Host, dessen Platte das knappe Gut ist (Kapitel 10).
- Das Frontmatter ist ein Fuzzing-Ziel (Kapitel 5.1) — von zwei nativen
  Go-Fuzz-Zielen ist es eins, weil hier fremder Text in ein Datenmodell läuft.
- Ein Incident ohne existierenden `post_slug` muss auffallen. Die Prüfung, dass
  jeder referenzierte Slug eine Datei hat, gehört zur Ableitung, nicht zum
  Vertrauen.

### Was das kostet

**Ein Beitrag erfordert einen Deploy.** Kein Tippfehler ist in dreißig Sekunden
korrigiert, und von unterwegs schreiben geht nicht. Bilder liegen im Repo und
wachsen die Klongröße mit — bei einer Bildergalerie wäre das der falsche Weg,
bei drei bis fünf Beiträgen im Jahr ist es keiner.

Zweitens: die Beiträge liegen **nicht** in Postgres, die Systeme schon. Damit
gibt es zwei Quellen, die zusammenpassen müssen — genau deshalb steht die
Zuordnung als `systemId` im Frontmatter und wird geprüft, statt implizit zu sein.

## Verworfene Alternativen

**Headless CMS (Sanity, Contentful, Strapi)** — eine dritte Partei im
Datenweg. Kapitel 4.5 hat sich gegen ein CDN entschieden, damit die
Datenschutzseite stimmt; ein CMS würde dieselbe Aussage an anderer Stelle
aufweichen. Self-hosted Strapi wäre ein weiterer Container plus Datenbank auf
einem Host mit 40 GB Platte.

**Beiträge in Postgres** — brächte einen Editor, eine Rechteverwaltung und ein
Backup-Thema für Inhalte, die ohnehin aus Git kommen sollen. Der Blog wäre nicht
mehr reviewbar.

**Statischer Markdown ohne MDX** — würde reichen, bis der erste Beitrag ein
laufendes Beispiel einbetten soll. Genau das ist bei einer Seite, deren These
„der Beleg ist ein laufendes System" lautet, absehbar.

## Belege

Build-Plan Kapitel 4.6, Kapitel 5.1 (Fuzzing-Ziele), Invariante 4,
Phase H9, Phase K2.
