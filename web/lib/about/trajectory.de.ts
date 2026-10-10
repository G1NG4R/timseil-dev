// Die sechs Stationen auf Deutsch — und nur das, was an ihnen Sprache ist.
//
// WAS HIER NICHT STEHT, STEHT GENAU EINMAL. Label, Tags und die ausgelieferte
// Zelle sind Nomenklatur und bleiben in trajectory.ts: `PROXMOX` heißt auf
// jeder Seite `PROXMOX`, und `02 timseil.dev` ist ein Systemname, kein Satz.
// Die Form dieser Datei ist deshalb `Record<StationKey, StationProse>` — fehlt
// ein Absatz, kompiliert sie nicht, und lib/i18n/complete.ts vergleicht
// zusätzlich die Form gegen das englische Original.
//
// DREI WÖRTER, DIE DEUTSCH SIND, INDEM SIE ENGLISCH BLEIBEN. `Homelab` und
// `Helpdesk` sind die Wörter, mit denen hier über diese Arbeit gesprochen wird;
// `Heimlabor` wäre eine Übersetzung, die niemand sagt. Dasselbe Argument, das
// `CONTRIBUTIONS` in der Zeile unter dem Graphen englisch lässt — nur dass es
// hier nicht GitHubs Begriff ist, sondern der der Branche.
//
// `IM BAU` UND NICHT `IM AUFBAU`, weil `stateInBuild` im Katalog `IM BAU` sagt.
// Die letzte Station nennt ihren Zustand in Prosa, und zwei Schreibweisen für
// einen Zustand auf einer Seite sind genau die Abweichung, die U3s Abnahme eine
// Seite weiter gefunden hat.
//
// UND SIE DUZT, weil der Katalog duzt — `notFoundBudgetLede`, die Kontaktseite
// und die Fußzeile tun es seit H9. Eine Seite, die in der Navigation duzt und
// im Absatz siezt, hätte zwei Stimmen.

import type { StationKey, StationProse } from "./trajectory.ts";

export const STATION_PROSE_DE: Readonly<Record<StationKey, StationProse>> = {
  s1: {
    caption: "Homelab",
    title: "Homelab",
    body:
      "Das fängt zu Hause an und nicht im Job: Hardware in einem Schrank und " +
      "ein Hypervisor darauf, Maschinen, die man absichtlich auseinandernimmt. " +
      "Das Labor hat den Service-Desk erst möglich gemacht — die Stelle kam " +
      "nach ihm und nicht umgekehrt, und es läuft bis heute.",
  },
  s2: {
    caption: "Helpdesk",
    title: "Helpdesk",
    body:
      "Dann der Service-Desk, und kein Studium: fremde Maschinen, fremde " +
      "Fristen und eine Warteschlange, der es gleich ist, in welcher Schicht " +
      "der Fehler sitzt. Von dort kommt die Angewohnheit, die Fehlermeldung zu " +
      "lesen, bevor man sie errät.",
  },
  s3: {
    caption: "Erste Website",
    title: "Erste Website",
    body:
      "Das Erste, das gebaut und nicht repariert wurde: ein Shop auf Shopify " +
      "Hydrogen, zusammengesetzt mit einem KI-Assistenten an der Seite. Daran " +
      "ließ sich die Form eines modernen Frontends lernen — und dass eine " +
      "Seite, die auf einem Laptop funktioniert, noch kein Zertifikat, keinen " +
      "kalten Cache und keine langsame Verbindung gesehen hat.",
  },
  s4: {
    caption: "Eigener VPS",
    title: "Eigener VPS",
    body:
      "Ein VPS statt einer gehosteten Plattform: der Proxy, die Zertifikate, " +
      "die Logs und die Neustarts sind meine. Die Seite, die du gerade liest, " +
      "ist diese Maschine, die sich selbst beschreibt — jede Zahl darauf kommt " +
      "aus dem System, das sie erzeugt, und die Ausfälle werden aufgeschrieben " +
      "statt abgewartet.",
  },
  s5: {
    caption: "Talos-Labor",
    title: "Talos-Labor",
    body:
      "Kubernetes ohne Shell darunter: ein unveränderliches, API-getriebenes " +
      "Betriebssystem, ein eigener Adressbereich und ein Repository, das der " +
      "Cluster liest, statt einer Konsole, die ich klicke. Im Labor wurde " +
      "dieser Stack gelernt, solange noch nichts davon abhing.",
  },
  s6: {
    caption: "Bare-Metal-Cluster",
    title: "Bare-Metal-Cluster",
    body:
      "Derselbe Stack auf eigener Hardware, und das System, auf dem die Rolle " +
      "auf dieser Seite steht: in Git deklariert, von Flux abgeglichen, mit " +
      "der Datenbank und den Backups als Operatoren. Er ist im Bau und nicht " +
      "live, weil noch nichts Öffentliches auf ihm gemessen wird — und auf " +
      "dieser Seite ist ein Zustand eine Messung und kein Gefühl.",
  },
};
