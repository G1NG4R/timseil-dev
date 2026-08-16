# ADR 0006 — Kein CDN, keine dritte Partei im Anfrageweg

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** L1, L3, L4, L7, L8, M6
**Invarianten:** keine unmittelbar; stützt die Aussagen der Datenschutzseite (H12)

## Kontext

Der Design-Handoff verlangt „DNS ohne Proxy davor, damit die Aussage der
Datenschutzseite stimmt". Die Seite hat eine Legal-Seite mit **Live-Readout aus
dem Browser** — sie zeigt dem Besucher, was tatsächlich geladen wird.

Ein CDN vor dem Origin würde bedeuten: jede Anfrage jedes Besuchers läuft durch
ein fremdes Unternehmen, das TLS terminiert. Auf einer Seite, die
Betriebsehrlichkeit zum Argument macht, ist das keine Kleinigkeit, sondern ein
Widerspruch im Schaufenster.

OVH ist bereits Registrar, DNS-Betreiber, Host und Mail-Anbieter. Ohne CDN ist
damit **keine dritte Partei** im Anfrageweg.

## Entscheidung

**Kein CDN, kein WAF, kein Proxy vor dem Origin.** DNS zeigt direkt auf den VPS.
Auch keine externen Assets: Fonts liegen selbst gehostet, keine
Drittanbieter-Skripte, keine externen Bilder außerhalb einer engen
`remotePatterns`-Liste in `next/image`.

Verteidigt wird **am Origin**: Rate-Limit in Traefik und in der Go-API,
fail2ban, Firewall offen nur für 22/80/443, SSH ausschließlich per Key,
Security-Header und CSP mit Nonce (L4).

## Konsequenzen

- Die Datenschutzseite kann sagen, was sonst kaum jemand sagen kann: Zwischen
  Browser und Server steht niemand. Das ist prüfbar — der Live-Readout zeigt es.
- Ein Blogeintrag mit einem echten Argument statt einer Konfigurationsanleitung.
- L8 (Performance-Budget) muss ohne Edge-Caching auskommen: Bundle-Budget eng,
  Bilder klein, Cache-Header sauber. Die Zusage „fast on a phone on mobile data"
  wird am Origin eingelöst oder gar nicht.
- Faro-Telemetrie (F11) und die Alloy-CORS-Regel begrenzen sich auf die eigene
  Domain — es gibt keine Edge-Schicht, die das für uns täte.

### Was das kostet

**Benannt, nicht verschwiegen:**

- **Kein WAF.** Anwendungsschicht-Angriffe treffen den Origin direkt.
- **Die VPS-IP ist sichtbar.** Es gibt nichts, hinter dem man sich versteckt.
- **Kein Edge-Cache.** Ein Besucher aus Übersee zahlt die volle Latenz. Bei einer
  Portfolioseite mit europäischem Publikum ist das der günstigere Preis.
- **DDoS auf Anwendungsebene** fangen wir nicht ab; OVH filtert Netzebenen-DDoS,
  darüber hinaus nichts.

Diese Kosten sind akzeptiert, nicht ignoriert. Ändert sich das Bedrohungsbild —
echter Angriffsdruck, nicht gefühlter —, ist das ein neuer ADR, kein
Notfallgriff.

## Verworfene Alternativen

**Cloudflare (kostenlos, Proxy an)** — TLS-Terminierung bei einem Dritten, ein
Cookie-Thema, und die Datenschutzseite müsste eine Einschränkung tragen, die die
Kernaussage der Seite relativiert.

**Cloudflare nur als DNS, Proxy aus** — technisch neutral, aber ein weiterer
Anbieter im Konto-Zoo ohne Gewinn: OVH betreibt die Zone bereits.

**Eigener Caching-Reverse-Proxy vor Traefik** — löst ein Latenzproblem, das bei
diesem Traffic nicht existiert, und fügt einen Container auf einem Host hinzu,
dessen Platte das knappe Gut ist.

## Belege

Build-Plan Kapitel 4.5, Kapitel 3 (Tabelle „Weggelassen"), Kapitel 11.4,
Phase L4, Phase L7, Phase L8.
