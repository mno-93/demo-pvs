# 0025 — Gehostete Demo: der Simulator läuft im Browser

**Datum:** 30.09.2026 · **Status:** angenommen · **baut auf:** 0002, 0013

## Zusammenhang

Die Demo soll ohne Installation im Browser erreichbar sein, gehostet auf GitHub Pages. Pages
liefert nur statische Dateien aus. Der ePA-Simulator ist aber ein eigener Dienst (ADR 0002):
Ohne ihn gäbe es in der gehosteten Fassung weder ePA noch E-Rezepte.

## Entscheidung

1. Die Wege des Simulators stehen in `epa-sim/src/wege.ts` und hängen an einer Anwendung, die
   nur die benutzten Teile der Fastify-Schnittstelle kennt. Lokal ist das der Fastify-Server
   (`anwendung.ts`), in der gehosteten Demo ein kleiner Adapter (`browser.ts`), der
   `Request`-Objekte mit denselben Prüfungen, Wegen und Haken beantwortet.
2. Was es nur in Node gibt — `node:crypto`, `Buffer` —, ersetzen plattformneutrale Hilfen
   (`plattform.ts`) mit denselben Ergebnissen; ein Test vergleicht SHA-256 mit `node:crypto`.
3. Das PVS stellt alle HTTP-Anfragen über `epa/transport.ts`. Im Hosting-Build
   (`VITE_SIMULATOR=browser`) leitet es die Wege `/epa`, `/information`, `/erp` und `/verwaltung`
   an den Simulator im Browser; sonst geht alles über `fetch`. Kopfzeilen, Statuscodes, Körper
   und Aufrufprotokoll sind in beiden Betriebsarten gleich.
4. Der Workflow `.github/workflows/demo.yml` prüft jede Änderung, baut die gehostete Fassung mit
   dem Unterpfad des Repositorys (`BASIS`) und veröffentlicht sie auf GitHub Pages — erst, wenn
   die Repository-Variable `PAGES_FREIGEGEBEN` den Wert `ja` hat. `404.html` ist eine Kopie der
   Startseite, damit tiefe Adressen funktionieren. Die gehostete Fassung enthält keine
   Quelltext-Karten.

## Begründung

▸ Ein Simulator im Browser hält die Systemgrenze, auf die es ankommt: Das PVS spricht weiter
HTTP-förmige Anfragen, und das Aufrufprotokoll zeigt dieselben Wege mit derselben Grundlage.
Nur der Transport ist ersetzt. Ein zusätzlicher Server-Anbieter wäre ein zweites Konto, ein
Betrieb und laufende Kosten für eine Demo mit fiktiven Daten.

▸ Die Freigabe über eine Variable trennt „bauen" von „veröffentlichen": Eine Seite auf GitHub
Pages ist öffentlich erreichbar, auch wenn das Repository privat ist.

## Folgen

Der Bestand liegt im Speicher der Seite. Neu laden setzt Praxis und Aktensystem zurück, und
jede Person, die die Seite öffnet, hat ihren eigenen Bestand. Lokal bleibt der Simulator ein
eigener Dienst; die Tests prüfen beide Anbindungen.

## Verworfen

**Simulator auf einem eigenen Server** (Container- oder Funktionsdienst) — echter Netzweg, aber
zusätzlicher Betrieb und öffentlich erreichbare Schnittstelle. **Service Worker** — dieselbe
Anpassung des Simulators, zusätzlich Registrierung und Aktualisierung. **Aufzeichnungen statt
Simulator** — keine schreibenden Abläufe, keine Konflikte, keine E-Rezepte.
