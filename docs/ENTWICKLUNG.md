# Entwicklung

## Voraussetzungen

Node ab Version 20. Prüfen mit `node -v`.

## Befehle

| Befehl                        | Wirkung                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Startet PVS und Simulator gemeinsam                                                                                       |
| `npm run dev:pvs`             | Nur die Praxisverwaltung                                                                                                  |
| `npm run dev:epa`             | Nur den Simulator                                                                                                         |
| `npm run test`                | Tests einmalig                                                                                                            |
| `npm run test:watch`          | Tests mitlaufend                                                                                                          |
| `npm run typecheck`           | Typprüfung über alle Pakete                                                                                               |
| `npm run pruefen`             | Format, Lint, Typen, Tests — vor jedem Commit                                                                             |
| `npm run pruefen:vertraulich` | Sucht nach vertraulichen Inhalten; Projektmuster aus `.vertraulich-muster` oder `VERTRAULICH_MUSTER` (Teil von `pruefen`) |
| `npm run build:gehostet`      | Baut die gehostete Fassung mit Simulator im Browser; Unterpfad über `BASIS`, etwa `BASIS=/demo-pvs/`                      |
| `npm run vorschau:gehostet`   | Zeigt das Gebaute lokal an (Port 4173)                                                                                    |

## Gehostete Fassung und Workflow

`.github/workflows/demo.yml` läuft bei jedem Push und Pull Request: `npm ci`, Kern bauen,
`npm run pruefen`, dann `npm run build:gehostet` mit `BASIS=/<repository>/`. Auf `main`
veröffentlicht er auf GitHub Pages, wenn die Repository-Variable `PAGES_FREIGEGEBEN` den Wert
`ja` hat (ADR 0025). Ohne diese Variable bleibt es bei Prüfen und Bauen.

Im Hosting-Build leitet `pvs/src/epa/transport.ts` die Wege `/epa`, `/information`, `/erp` und
`/verwaltung` an `simulatorImBrowser()` aus `@demo-pvs/epa-sim/browser`. Wer im Simulator etwas
braucht, das es nur in Node gibt, legt es in `epa-sim/src/plattform.ts` an — sonst läuft die
gehostete Fassung nicht mehr. Wer einen neuen Weg anlegt, hängt ihn in `wege.ts` ein; er gilt
dann für Server und Browser.

Prüfliste für die gehostete Fassung: `npm run build:gehostet` mit `BASIS=/demo-pvs/`, Vorschau mit
`--base /demo-pvs/`, eine tiefe Adresse direkt aufrufen, eGK einlesen, ein Rezept senden, im
Netzwerkprotokoll des Browsers dürfen nur statische Dateien erscheinen.

## Kataloge und Wertelisten

Die Quellen liegen als JSON in `daten/kataloge/`. Nach jeder Änderung die typisierten Module neu
erzeugen:

| Befehl                                                       | Wirkung                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `node werkzeuge/wertelisten-vom-zts.mjs`                     | übernimmt die Allergie-Wertelisten (Substanzen, Manifestationen) vom Zentralen Terminologieserver des BfArM |
| `EPA_XDS_REPO=<Pfad> node werkzeuge/formatcodes-aus-xds.mjs` | übernimmt die registrierten Dokumenttypen aus einem Klon von `gematik/ePA-XDS-Document`                     |
| `node werkzeuge/amts-zuordnung-bilden.mjs`                   | bildet die Demo-Zuordnung von Substanzen zu ATC                                                             |
| `node werkzeuge/kataloge-erzeugen.mjs`                       | übersetzt alle JSON-Quellen in Module unter `packages/kern/src/kataloge/`                                   |

Die Übernahmen lesen die Repositories nur und schreiben die Herkunft in den Kopf jeder Datei.
Ohne die Umgebungsvariable brechen sie mit einem Hinweis ab; für den Betrieb der Demo sind sie
nicht nötig, die Ergebnisse liegen im Repository.

## ePA-Wege

Neue Wege im Simulator nur mit Beleg in einem veröffentlichten Implementation Guide
([QUELLEN.md](QUELLEN.md), ADR 0019). Jeder Weg bekommt im Client eine `GRUNDLAGE`, die das
Aufrufprotokoll anzeigt. Was ein Vorschlag ist, gehört unter `/epa/vorschlag/…` (0018), trägt ✦
und nutzt für eigene Kennzeichen `https://example.org/demo-pvs/fhir/` — nie den Namensraum der
gematik. Nicht veröffentlichte Entwürfe werden nicht nachgebildet.

Jeder Fachdienst prüft die Befugnis (0017). Wer einen neuen Weg anlegt, hängt ihn unter `/epa/`
ein; die Prüfkette im `onRequest`-Haken greift dann von selbst. Ausnahmen mit eigener Prüfung: der
Information Service unter `/information/` (ohne Befugnis, 0023) und der Demo-Ersatz des
E-Rezept-Fachdienstes unter `/erp/` (kein Teil der ePA, 0024). Der Entwicklungsserver reicht beide
Pfade an den Simulator weiter.

## Vorführen

Die Abläufe stehen in [SPEZIFIKATION.md, Abschnitt 10](SPEZIFIKATION.md#10-vorführung).

## Prüfliste vor jeder Abgabe

`npm run pruefen` und `npm run build` reichen nicht: Einige Fehler zeigen sich nur in der laufenden
Anwendung. Vor jeder Abgabe deshalb im Browser, mit frisch gestartetem Simulator:

| #   | Ablauf                                                                                                                       | Erwartung                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | „Zurücksetzen" im Kopf, dann Frau Hoffmann → „ePA öffnen"                                                                    | Praxis und Aktensystem im Startbestand; keine Befugnis, Knopf „eGK einlesen"                                                                                                                                                                                      |
| P2  | „eGK einlesen"                                                                                                               | Befugnis bis …; Knopf „Patient Summary" erscheint                                                                                                                                                                                                                 |
| P3  | „Patient Summary"                                                                                                            | sieben von acht Abschnitten (Weiterentwicklung 2); Marker „geführt"/„automatisch"; Diagnosen „+ 2 weitere Einträge"; Impfungen fünf, jüngste zuerst; Prozeduren Kardioversion und Implantate Schrittmacher „aus Entlassbrief"; Herkunft unter jedem Listeneintrag |
| P4  | Sprünge aus der Patient Summary                                                                                              | Allergien/Diagnosen → Splitscreen mit Fokus auf dem Block; Medikation; Labor; „In Dokumenten suchen" → Reiter Dokumente                                                                                                                                           |
| P5  | Diagnose „in die ePA ➜", dann Patient Summary                                                                                | neuer Eintrag erscheint                                                                                                                                                                                                                                           |
| P6  | Demo-Steuerung „nur automatischen Daten"                                                                                     | vier von acht Blöcken „Information nicht verfügbar" (Allergien, Diagnosen, Impfungen, Erklärungen), Medikation aus der Liste (5), Prozeduren und Implantate aus dem Entlassbrief                                                                                  |
| P7  | Ausbaustand „Release 3.1.3"                                                                                                  | Knopf und Reiter Patient Summary verschwinden; Laborbefunde als PDF; Listen fehlen                                                                                                                                                                                |
| P8  | Laborbefunde übernehmen → Labor                                                                                              | Kumulativbefund mit zwei Spalten                                                                                                                                                                                                                                  |
| P9  | Medikation: Metformin „in den Plan"                                                                                          | AMTS-Warnung mit eGFR und Grundlage; nach „übernehmen" im Plan                                                                                                                                                                                                    |
| P10 | „Andere Einrichtung ändert zwischendurch" → „pausieren"                                                                      | 409-Meldung, Stand neu geladen; zweiter Versuch gelingt                                                                                                                                                                                                           |
| P11 | Dokumente: Volltext „Echokardiographie", „Ansehen"                                                                           | ein Treffer, Brief als lesbarer Text                                                                                                                                                                                                                              |
| P12 | Frau Yildiz: Karteikarte, Notiz speichern                                                                                    | Notiz im Verlauf                                                                                                                                                                                                                                                  |
| P13 | „Befugnisse entziehen" → Patient Summary                                                                                     | 403-Lage mit „eGK einlesen", Kopf „keine ePA-Befugnis"                                                                                                                                                                                                            |
| P14 | Konsole                                                                                                                      | nur die gewollten Statuscodes (403, 404 im Release, 409), keine Skriptfehler                                                                                                                                                                                      |
| P15 | Splitscreen: ★ an einem Eintrag setzen und aufheben                                                                          | violett hinterlegt bzw. nicht, Zähler im Kopf ändert sich; Patient Summary folgt, „+ n weitere" stimmt                                                                                                                                                            |
| P16 | „Andere Einrichtung ändert zwischendurch" → ★                                                                                | 409-Meldung, Liste neu geladen; zweiter Versuch gelingt                                                                                                                                                                                                           |
| P17 | ePA-Fenster → „Diagnosen und Allergien"                                                                                      | alle Einträge der Listen, markierte violett mit ★                                                                                                                                                                                                                 |
| P18 | Neue Dauerdiagnose erfassen                                                                                                  | „In der Diagnosenliste führen" und „Relevant für die Patient Summary" vorbelegt; Relevanz gesperrt ohne Listenaufnahme; nach dem Speichern in der Patient Summary                                                                                                 |
| P19 | Frau Weber öffnen                                                                                                            | Kopf „keine ePA", „ePA öffnen" gesperrt, kein Knopf „Patient Summary"                                                                                                                                                                                             |
| P20 | Herr Krüger → Medikation                                                                                                     | Kopf „Widerspruch Medikationsprozess"; Band „… widersprochen" statt Fehler; Patient Summary: Medikation „Gesperrt durch Widerspruch"                                                                                                                              |
| P21 | Aufrufprotokoll → Akten → Hoffmann „gesperrt"                                                                                | Kopf „ePA vorübergehend gesperrt"; ePA-Fenster 409-Lage; zurücksetzen hebt es auf                                                                                                                                                                                 |
| P22 | ePA-Fenster, Dokumente, Splitscreen                                                                                          | „Stand hh:mm:ss" mit „↻ aktualisieren"; Uhrzeit ändert sich nach dem Aktualisieren                                                                                                                                                                                |
| P23 | Frau Hoffmann, Medikation: Ramipril „Rezept" → „Signieren und senden"                                                        | Reichweite im Formular; Karte E-Rezepte „Übertragung ausstehend", nach etwa 3 s „in der Medikationsliste"; am Planeintrag „verordnet …"                                                                                                                           |
| P24 | Apotheke „mit Austausch" → „↻" bzw. „Stand prüfen"                                                                           | Planeintrag 2,5 mg, Dosierung 2-0-0-0, Fassung erhöht; E-Rezept „eingelöst am …" mit abgegebenem Arzneimittel                                                                                                                                                     |
| P25 | Apixaban verordnen, Apotheke „zwei Arzneimittel"                                                                             | Warnband „mehrere Arzneimittel abgegeben", Marker am Planeintrag; Plan unverändert                                                                                                                                                                                |
| P26 | Metformin in der Liste „Rezept", „Auch in den Medikationsplan", senden                                                       | Metformin im Plan, verknüpft; E-Rezept „aus dem Plan"                                                                                                                                                                                                             |
| P27 | Rolle MFA: „Rezept" → „Zur Signatur vorbereiten"; Rolle Ärztin → „Rezepte"                                                   | Zahl in der Kopfleiste; Auswahl signieren; gesperrte Freigabe nicht wählbar                                                                                                                                                                                       |
| P28 | E-Rezept „löschen" vor der Einlösung                                                                                         | Stand „gelöscht"; Eintrag verschwindet aus der Medikationsliste                                                                                                                                                                                                   |
| P29 | Karteikarte, Filter „ePA"                                                                                                    | ↓ an übernommenen, ↑ an eingestellten Einträgen und gesendeten E-Rezepten                                                                                                                                                                                         |
| P30 | Frau Hoffmann, Karteikarte                                                                                                   | Blöcke je Tag, „heutiger Besuch" mit Termin oben; Notiz speichern → im heutigen Block; Tage ohne Besuch als „Eingang"                                                                                                                                             |
| P31 | Frau Yildiz, „Impfungen": Grippeimpfung „in die ePA ➜"                                                                       | rechts in der Impfliste, verknüpft; Karteikarte ↑ an der Impfung                                                                                                                                                                                                  |
| P32 | Neue Impfung aus dem Katalog erfassen, „in die ePA"                                                                          | Zielkrankheit aus dem Katalog; FHIR-Vorschau `immunization-eu-core`; Patient Summary zeigt sie                                                                                                                                                                    |
| P33 | Ausbaustand „Weiterentwicklung 1"                                                                                            | „Impfungen" zeigt nur die Praxisseite; Patient Summary: Impfungen „Information nicht verfügbar"; Metadaten der Impfliste 404 (erwartet)                                                                                                                           |
| P34 | Patient Summary öffnen, Akten → „andere Einrichtung trägt ein", Patient Summary erneut                                       | Band „2 neu (andere Einrichtungen)", Marken **neu**; ebenso in Diagnosen und Impfungen; nach erneutem Öffnen kein Band                                                                                                                                            |
| P35 | Eigene Diagnose in die ePA, danach Patient Summary                                                                           | kein Band — eigene Änderungen zählen nicht                                                                                                                                                                                                                        |
| P36 | Frau Hoffmann nach eGK, „Diagnosen und Allergien"                                                                            | Kompakte Zeilen, jüngste Einstellung oben, Datum in der Mitte; Bezeichnung anklicken → beide Seiten aufgeklappt mit Herkunft, „bearbeiten", „berichtigen …"; „alle aufklappen"                                                                                    |
| P37 | Sortierung „Eigene Reihenfolge", Zeile ziehen und ↑ ↓; danach Nierenkrankheit „in die ePA ➜"                                 | Reihenfolge folgt und bleibt nach dem Einstellen; ePA-Fenster zeigt dieselbe; Handlungszähler unverändert                                                                                                                                                         |
| P38 | Frau Hoffmann nach eGK: „Medikation" und „Dokumente" einmal öffnen, dann „andere Einrichtung trägt ein", beide erneut öffnen | Medikationsplan: Band „1 neu · 1 geändert (Kardiologische Praxis am Wall)", Marken an Torasemid und Bisoprolol; Liste: „1 neu"; Dokumente: „1 Dokument neu"; Aufrufprotokoll mit `recorded=gt`, `provenance=`, `date=gt`, `_lastUpdated=gt`                       |
| P39 | Eigene Planänderung (pausieren), Medikation erneut öffnen                                                                    | kein Band                                                                                                                                                                                                                                                         |
| P40 | Ausbaustand „Release 3.1.3", „andere Einrichtung trägt ein"                                                                  | Befund und Planänderung erscheinen; keine Listen                                                                                                                                                                                                                  |

Neue Funktionen bekommen hier eine Zeile. Neue Beispiele kommen mit ihrem Zweck in
[SPEZIFIKATION.md, Abschnitt 3.1](SPEZIFIKATION.md#31-beispielbestand-und-wozu-er-dient).

## Tests

Oberflächentests sprechen nie mit dem Simulator. `pvs/src/testhilfe/epa-attrappe.ts` ersetzt
`fetch`, zeichnet jeden Aufruf auf und antwortet nach Vorgabe; den Information Service beantwortet
sie, wenn der Test nichts vorgibt, mit „Akte besteht, kein Widerspruch". Befugnisse, die im Test
nicht ablaufen, liefert `dauerhafteBefugnis`.

Der Simulator wird über `simulatorBauen()` und Fastify `inject` getestet
(`epa-sim/src/anwendung.test.ts`: Kopfzeilen, MHD, Lesenachweis und Konflikt, Diagnose-Service;
`epa-sim/src/erezept.test.ts`: Information Service, Widerspruch, E-Rezept mit Zulieferung,
Austausch, Mehrfachabgabe, Löschen, Verzögerung).

## Konventionen

**Sprache.** Oberfläche, Kommentare und Commit-Betreffe auf Deutsch. Bezeichner in der Domäne deutsch
(`Patientin`, `Karteikarteneintrag`, `Diagnose`), englisch nur dort, wo FHIR berührt wird
(`Condition`, `AllergyIntolerance`) — sonst entstünde bei jeder Abbildung eine Übersetzungsschicht,
die niemand nachvollziehen kann.

**Kommentare erklären das Warum.** Was der Code tut, steht im Code. Kommentiert wird, was ohne
Projektkenntnis nicht erschließbar ist — fachliche Regeln, bewusste Vereinfachungen, Verweise auf
die Spezifikation und die Quellen.

**Keine Erklärtexte in der Oberfläche.** Neue Ansichten erklären sich über Beschriftung und
Zustand; Erläuterungen gehören in `docs/SPEZIFIKATION.md` (ADR 0020). Jede Änderung an der Demo
schreibt dort den Änderungsverlauf fort.

**Barrierefreiheit ist Baubedingung, nicht Nacharbeit.** Jedes Bedienelement ist mit der Tastatur
erreichbar und beschriftet. Keine Aussage wird allein über Farbe transportiert. Wer eine Ansicht
hinzufügt, prüft sie einmal ohne Maus.

**Tests.** Verpflichtend für alles in `kern`, das eine fachliche Regel abbildet — Quartalsberechnung,
Abrechnungsprüfung, AMTS-Prüfung, FHIR-Abbildung, Listenabgleich. Oberflächenkomponenten werden nicht
flächendeckend getestet, wohl aber die Abläufe, an denen die Aussage der Demo hängt: Befugnis,
Splitscreen, Erfassung.

## Entscheidungen festhalten

Architekturentscheidungen kommen nach `docs/entscheidungen/` — fortlaufend nummeriert, mit
**verworfener Alternative** — ohne sie ist eine Entscheidung später nicht überprüfbar.

## Commits

Gearbeitet wird auf eigenen Branches mit Pull Request ([ZUSAMMENARBEIT.md](ZUSAMMENARBEIT.md)).
Ein Commit je abgeschlossenem Schritt. Betreff auf Deutsch, auf `main` mit Meilensteinkürzel:

```
M1: Karteikarte mit Schnellerfassung über Tastatur
M1: Quartalslogik für den Behandlungsfall, mit Tests
```

Nie direkt auf `main` pushen, kein Force-Push. Claude pusht nur auf ausdrückliche Aufforderung.
