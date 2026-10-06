# Hinweise für Claude Code in diesem Repository

Diese Datei lesen alle Claude-Sitzungen im Team. Sie gilt für jede Änderung. Persönliche Ergänzungen
gehören in `CLAUDE.local.md` (wird nicht committet).

## Worum es geht

Ein **fiktives** Praxisverwaltungssystem mit einem ePA-Simulator. Es zeigt, was eine ärztlich
verantwortete Patient Summary im Praxisalltag kostet und bringt — gemessen an der Dokumentation,
die ohnehin stattfindet. Fachliche Beschreibung: `docs/SPEZIFIKATION.md`. Aufbau:
`docs/ARCHITEKTUR.md`. Befehle und Prüfliste: `docs/ENTWICKLUNG.md`. Gestaltung:
`docs/GESTALTUNG.md`. Arbeitsweise im Team: `docs/ZUSAMMENARBEIT.md`.

## Was nie ins Repository darf

Das Repository liegt auf GitHub und die Demo kann öffentlich gehostet werden.

- **Keine echten Personen- oder Gesundheitsdaten**, auch nicht „nur zum Testen". Alle Personen,
  Einrichtungen, Befunde und Nummern sind erfunden. Keine Importwege für echte Daten.
- **Keine internen oder nicht veröffentlichten Unterlagen**: keine Verweise auf interne Dokumente,
  Ablagen, Protokolle, Entscheidungs- oder Aufgabenlisten, keine Gremien- und Planungsunterlagen,
  keine Vorabversionen von Spezifikationen, keine Positionen von Verbänden oder Organisationen,
  keine Namen von Personen aus internen Entwürfen.
- **Keine Herstellernamen** realer Praxissoftware, kein Nachbau eines realen Produkts.
- **Keine Bildschirmfotos oder Exporte aus internen Figma-Dateien.** Verlinkt wird in Issues und
  Pull Requests, nicht eingecheckt.
- **Keine Zugangsdaten**, Token oder Schlüssel.

Vor jedem Commit läuft `npm run pruefen` — darin `pruefen:vertraulich`. Die projektbezogenen
Suchmuster liegen in `.vertraulich-muster` (nicht im Repository, gibt es bei der Projektleitung).
Meldet die Prüfung einen Fund: Stelle umformulieren, nicht das Muster abschwächen.

## Fachliche Regeln

- **Kein erfundener Weg.** Jeder Aufruf an die ePA folgt einem veröffentlichten Implementation Guide
  (`docs/QUELLEN.md`). Was ein Vorschlag ist, liegt unter `/epa/vorschlag/…`, trägt ✦ und nutzt den
  Namensraum `https://example.org/demo-pvs/fhir/`. Codes, Kopfzeilen und Profile nur mit Beleg;
  sonst ⚠ setzen oder weglassen.
- **Kennzeichnung:** ⚠ = unbelegt, zu verifizieren · ▸ = Bewertung · ✦ = Vorschlag, nicht
  spezifiziert.
- Kataloge sind Auszüge, nicht amtlich; Codes ohne Prüfung gegen einen Terminologieserver sind als
  ungeprüft gekennzeichnet.

## Gestaltung und Bedienung

- **Keine Erklärtexte in der Oberfläche.** Beschriftungen, Zustände und Marker statt Hinweisboxen;
  Erläuterungen gehören in `docs/SPEZIFIKATION.md` (ADR 0020).
- Die UX-Grundsätze in `docs/SPEZIFIKATION.md`, Abschnitt 2.2, sind verbindlich. Wer einen neuen
  Grundsatz einführt, trägt ihn dort mit Begründung und Fundstelle ein.
- Farben, Abstände und Schriften nur über die Variablen in `packages/pvs/src/stil/global.css`
  (`docs/GESTALTUNG.md`). Keine Aussage allein über Farbe. Jedes Bedienelement per Tastatur
  erreichbar und beschriftet.
- Violett und ★ sind der Patient Summary vorbehalten.

## Technische Regeln

- Der Simulator läuft auch im Browser (gehostete Fassung, ADR 0025): keine Node-only-APIs im
  Simulator außer über `packages/epa-sim/src/plattform.ts`; neue Wege in `wege.ts`.
- Zeitpunkte über die Demo-Uhr (`DEMO_HEUTE`, `demoJetzt()`), nie direkt `new Date()` für
  fachliche Daten.
- Fachliche Regeln im Kern (`packages/kern`) mit Tests. Abläufe, an denen die Aussage der Demo
  hängt, mit Oberflächentest.
- Sprache: Oberfläche, Kommentare, Commits und Doku auf Deutsch; Bezeichner der Domäne deutsch,
  englisch nur an FHIR-Stellen.

## Bei jeder Änderung

1. `docs/SPEZIFIKATION.md` fortschreiben, einschließlich **Änderungsverlauf** (Abschnitt 12). Neue
   Beispiele mit ihrem Zweck in Abschnitt 3.1. Neue Abläufe in Abschnitt 11.
2. `README.md` nachziehen, wenn sich Umfang oder Einstieg ändern.
3. Architekturentscheidung? Neue ADR in `docs/entscheidungen/` mit verworfener Alternative.
4. `npm run pruefen` und, wenn Simulator oder Build berührt sind,
   `BASIS=/demo-pvs/ npm run build:gehostet`.
5. **Im Browser prüfen**, nicht nur Tests: Vorschau `demo-pvs` (`.claude/launch.json`), die
   betroffenen Abläufe und die Prüfliste in `docs/ENTWICKLUNG.md`; neue Funktionen bekommen dort
   eine Zeile. Konsole ohne Fehler.
6. Arbeiten auf einem eigenen Branch, nie direkt auf `main`. Commit-Betreff auf Deutsch. Pushen
   und Pull Request nur, wenn die Person es ausdrücklich will; kein Force-Push.
