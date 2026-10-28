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
| `npm run fhir:validieren`     | Legt die FHIR-Ausgaben der Tests dem HL7 FHIR Validator vor (Java ab 17, `validator_cli.jar`; Abschnitt „FHIR-Validator“) |
| `npm run build:gehostet`      | Baut die gehostete Fassung mit Simulator im Browser; Unterpfad über `BASIS`, etwa `BASIS=/demo-pvs/`                      |
| `npm run vorschau:gehostet`   | Zeigt das Gebaute lokal an (Port 4173)                                                                                    |

## Gehostete Fassung und Workflow

`.github/workflows/demo.yml` läuft bei jedem Push auf einen Branch und bei Pull Requests aus
Forks; Pull Requests aus dem Repository sind über den Push geprüft (ADR 0041). Ablauf: `npm ci`,
Kern bauen, `npm run pruefen`, danach parallel der FHIR-Validator und `npm run build:gehostet` mit
`BASIS=/<repository>/`. Auf `main` veröffentlicht er auf GitHub Pages, wenn der Validator
bestanden hat und die Repository-Variable `PAGES_FREIGEGEBEN` den Wert `ja` hat (ADR 0025). Ohne
diese Variable bleibt es bei Prüfen und Bauen.

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

Die Abläufe stehen in [SPEZIFIKATION.md, Abschnitt 11](SPEZIFIKATION.md#11-vorführung).

## Erfundene Scans neu erzeugen

Die beiden Scans (B19, B21) sind HTML-Seiten, die fotografiert und gealtert werden. Quellen und
Werkzeuge liegen in `werkzeuge/scans/`; das Ergebnis steht als Base64 in
`packages/epa-sim/src/scanbild.ts` und `packages/pvs/src/daten/scanbild.ts`. Braucht Chrome und
Pillow; feste Zufallszahlen, also gleiche Eingabe, gleiches Bild.

```bash
node werkzeuge/scans/seite-fotografieren.mjs werkzeuge/scans/vorbefund-kardiologie-2019.html 794 1123 /tmp/vorbefund.png
node werkzeuge/scans/seite-fotografieren.mjs werkzeuge/scans/medikationsuebersicht-2026.html 1123 794 /tmp/uebersicht.png
python3 werkzeuge/scans/als-scan.py /tmp/vorbefund.png /tmp/uebersicht.png
```

## FHIR-Validator

`fhirPruefen` läuft in jedem Testlauf, kennt aber nur ausgewählte Regeln (DATENMODELL, Abschnitt 6).
Die verbindliche Prüfung leistet der HL7 FHIR Validator gegen die veröffentlichten Pakete.

1. **Aufruf:** `npm run fhir:validieren`. Die Tests aus `werkzeuge/fhir-validator.json` laufen mit
   `FHIR_AUSGABE`. Jede Ressource, die `fhirPruefen` ohne Fehler prüft, landet in
   `ausgabe/fhir-validierung/ressourcen` (`werkzeuge/fhir-ausgabe-sichern.ts`). Die absichtlich
   fehlerhaften Beispiele der Prüfregeln bleiben draußen.
2. **Validator:** Er prüft den Ordner gegen die Pakete der Konfiguration, ohne Terminologieserver
   (`-tx n/a`). Erweiterungen im Namensraum der Demo sind erlaubt.
3. **Auswertung:** Das Skript liest `bericht.json`, nimmt die begründeten Ausnahmen der
   Konfiguration heraus und endet mit Fehler, wenn ein Fehler bleibt. Eine Ausnahme ohne Treffer
   meldet es als Warnung — sie kann entfallen. Die Zusammenfassung steht in `zusammenfassung.json`
   und `zusammenfassung.md`.

**Voraussetzungen:**

- Java ab Version 17 — aus `JAVA_HOME`, sonst `java` im Pfad. Mit Homebrew ohne Eingriff in die
  Shell: `brew install openjdk@21`, dann `JAVA_HOME="$(brew --prefix openjdk@21)" npm run fhir:validieren`.
- `validator_cli.jar` **7.0.1** von github.com/hapifhir/org.hl7.fhir.core/releases, abgelegt unter
  `~/.fhir/validator_cli.jar` oder angegeben in `FHIR_VALIDATOR_JAR`. Die CI lädt dieselbe Fassung
  und prüft ihre SHA-256-Prüfsumme (`VALIDATOR_SHA256` im Workflow).

Das Skript lädt nichts selbst herunter. Der Validator holt die Pakete beim ersten Lauf aus der
Registry. Darunter ist `de.gematik.terminology`: Kein Paket führt es als Abhängigkeit, ohne es
prüft der Validator die gematik-Codesysteme des Laborbefunds nicht (SPEZIFIKATION 5.5, Befund 4).

**In der CI** (Job „FHIR-Validator“ in `.github/workflows/demo.yml`, ADR 0041):

- läuft bei jedem Push auf jeden Branch, nach „Format, Lint, Typen, Tests“;
- Validator und Pakete kommen aus dem Cache, der Validator nur mit passender Prüfsumme;
- die Zusammenfassung steht auf der Seite des Laufs, jeder verbleibende Fehler als Anmerkung,
  Ausnahmen ohne Treffer als Warnung; der vollständige Bericht ist das Artefakt
  „fhir-validierung“;
- seit der Kalibrierung am 15.10.2026 lässt jeder Fehler ohne begründete Ausnahme den Lauf
  scheitern — und ohne bestandenen Validator wird nicht veröffentlicht.

Neue Fassung des Validators: `VALIDATOR_VERSION` und `VALIDATOR_SHA256` im Workflow ändern (die
Prüfsumme steht am Release-Eintrag auf GitHub), dazu die Version oben.

**Vorschau-Lauf** (ADR 0042): Die Ausgaben der Vorschau auf ePA 3.2 folgen Ballots, deren Profile
mit denen des Hauptlaufs kollidieren — `epa-mhd-document-reference` gibt es in 1.1.3 und in 1.2.0.
Das Skript legt Dateien, deren Profil oder deren Einträge unter `vorschau.profile` fallen, in
`ressourcen-vorschau` ab und prüft sie in einem zweiten Lauf gegen `vorschau.pakete`, darunter
`de.gematik.epa.mhd` 1.2.0-ballot.1 und `de.gematik.epa` 1.4.0-ballot.1. Das Paket
`de.gematik.epa.eps` 1.0.0-ballot.1 liegt nicht in der Registry: Es kommt als Datei aus
`~/.fhir/vorschau` (oder `FHIR_VORSCHAU_PAKETE`), mit fester Prüfsumme aus der Konfiguration.
Lokal einmal ablegen:

```bash
mkdir -p ~/.fhir/vorschau && curl -fsSL -o "$HOME/.fhir/vorschau/de.gematik.epa.eps#1.0.0-ballot.1.tgz" https://gemspec.gematik.de/ig/fhir/epa-eps/1.0.0-ballot.1/package.tgz
```

Die CI holt die Datei im Job „FHIR-Validator“ und prüft die Summe; das Skript prüft sie ein
zweites Mal. Der Bericht des Vorschau-Laufs steht in `bericht-vorschau.json`.

**Stand 16.10.2026 (MHD-Ballot):** 79 Dateien, davon 4 im Vorschau-Lauf, **keine Fehler**, 815
Warnungen. Gegenprobe: Ohne `masterIdentifier` und `documentStorageLocation` verwirft der
Vorschau-Lauf die DocumentReference der ePS mit vier Fehlern (SPEZIFIKATION 5.13, Befund 1).

**Stand nach der Angleichung des Laborbefunds (15.10.2026):** 75 Dateien, **keine Fehler**, rund
890 Warnungen — überwiegend „ohne Terminologieserver nicht prüfbar“, nicht veröffentlichte
gematik-ValueSets und Hinweise zur Best Practice. Seit dem Terminologiepaket (16.10.2026) sind es
779 Warnungen: Die Meldungen zu den unbekannten gematik-Codesystemen entfallen. Weiter unbekannt
bleiben ATC, PZN, OPS und die Codesysteme von IHE Deutschland für Klasse und Typ der Dokumente
(`urn:oid:1.3.6.1.4.1.19376.3.276.1.5.8` und `….5.9`). Der erste Lauf fand 965 Fehler. Behoben sind:

| Befund des Validators                                                                                                          | Behebung                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Deutsche Anzeigen an HL7-Codes (klinischer Status, Verifikationsstatus, Kategorie); dadurch auch die required-Bindung verfehlt | offizielle Anzeigen der Terminologie (DATENMODELL, R5)                                                             |
| Fiktive Telematik-IDs ohne Präfix (`telematik-id-1` der Basisprofile)                                                          | Präfix nach Art der Einrichtung: 1 Praxis, 3 Apotheke, 5 Krankenhaus (⚠ nicht gegen die Vergaberegeln geprüft)     |
| Patient im Simulator ohne `name.use` (Slice `Name` in `EPAPatient`)                                                            | `use` = `official`                                                                                                 |
| MHD-Suche: relative `fullUrl`, `search.score` fehlt                                                                            | absolute `fullUrl`, Score 1                                                                                        |
| Patient Summary: `Composition.identifier` fehlt (`composition-eu-eps`), Bundle-Kennung keine gültige UUID                      | Kennungen als UUID                                                                                                 |
| Diagnose mit Zusatzkennzeichen „A“ und klinischem Status (`icd-4`)                                                             | Status entfällt                                                                                                    |
| Testbeispiel mit erfundenem Codesystem galt als gültig; `con-4` las den Code ohne System                                       | Beispiel berichtigt; die Invarianten lesen nur das HL7-Codesystem                                                  |
| Laborbefund (611, mit seinen Werten in der Patient Summary): Beobachtungen passten keinem dgLP-Profil                          | Gruppe → Einzelwert, Bezeichnung als Test-Profil, Labor als `performer`, Anzeige der Kategorie (SPEZIFIKATION 5.5) |
| Laborbefund: Pflichtangaben an Probe, Auftrag, Composition und Kennung des DiagnosticReport                                    | Probennummer, Status, Eingang; Einsender als Organisation, Auftragscode; Abschnitt mit Code und Erzähltext         |
| Laborbefund: `obs-range-2` bei einseitigem Referenzbereich                                                                     | fehlende Grenze mit Einheit und `data-absent-reason` (Befund am Ballot, SPEZIFIKATION 5.5)                         |
| Patient Summary: Laborwerte passten nicht zu `medicalTestResult-eu-core`                                                       | Profil EU Core, Labor im Dokument, ohne Verweis auf die Probe                                                      |

**Ausnahmen** (`werkzeuge/fhir-validator.json`, jede mit Grund):

| Ausnahme                                                       | Fehler | Grund                                                                                                                                                         |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identifier im MHD-Profil `epa-mhd-document-reference` 1.1.3    | 60     | Profilfehler: Schnitt nach `use`, dessen Werte nur in den Typprofilen stehen; die Instanzen sind richtig                                                      |
| Abschnitt des Laborbefunds (`section:result`) und Folgefehler  | 9      | ohne Terminologieserver nicht auswertbar: Zuordnung über `memberOf` auf ein LOINC-ValueSet; der Abschnitt ist in `laborbefund.test.ts` geprüft                |
| `content.format` an ✦ strukturierten Briefen                   | 3      | bewusst kein erfundener formatCode (SPEZIFIKATION 5.11)                                                                                                       |
| Provenance früherer Fassungen in der Patient Summary           | 4      | im Dokument nicht auflösbar; Abbildung der Herkunft offen (DATENMODELL, Abschnitt 7)                                                                          |
| `dr-comp-identifier` im Laborbefund                            | 3      | Profilkonflikt im Ballot: `composition-dglp` verbietet `identifier.type`, `diagnostic-report-dglp` verlangt ihn — nicht erfüllbar                             |
| E-Rezept                                                       | 1      | vereinfachter Demo-Ersatz, KBV-Pakete nicht geladen                                                                                                           |
| formatCode des Laborbefunds (`urn:gematik:ig:laboratory:v1.0`) | 3      | Der Hauptlauf löst das ValueSet über `epa-mhd` 1.1.3 gegen die ältere TI Terminology auf; die Expansion in 1.1.0-ballot.2 führt den Code (SPEZIFIKATION 5.13) |

Ausnahmen greifen über den Meldungstext (`muster`) oder über das Profil der geprüften Datei
(`profil`). Eine neue Ausnahme nur mit Grund und nur so eng wie möglich; lässt sich ein Profilfehler
an der Instanz FHIR-gerecht abfangen, geht das vor (ADR 0040).

**Nicht abgedeckt — auch nicht durch den Validator in dieser Einstellung:**

- **Terminologie-Bindungen.** Dafür braucht es einen Terminologieserver mit ICD-10-GM, Alpha-ID,
  den KBV-Codesystemen und SNOMED CT der deutschen Edition. Dasselbe gilt für Slices, die über eine
  Bindung an LOINC oder SNOMED CT zugeordnet werden (`memberOf`): Der Validator verneint sie ohne
  Server — etwa den Abschnitt des Laborbefunds.
- **E-Rezept gegen die KBV-Profile.**
- **Warnungen.** Sie lassen den Lauf nicht scheitern. Zu beachten: `DosageWarnungViererschemaInText` (Dosierung als Text statt strukturiert) und `icd-5` bei einer behobenen Diagnose mit Zusatzkennzeichen „G“ (DATENMODELL, Abschnitt 7).

## Prüfliste vor jeder Abgabe

`npm run pruefen` und `npm run build` reichen nicht: Einige Fehler zeigen sich nur in der laufenden
Anwendung. Vor jeder Abgabe deshalb im Browser, mit frisch gestartetem Simulator:

| #   | Ablauf                                                                                                                                                                                                                                                | Erwartung                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | „Zurücksetzen" im Kopf, dann Frau Hoffmann → „ePA öffnen"                                                                                                                                                                                             | Praxis und Aktensystem im Startbestand; keine Befugnis, Knopf „eGK einlesen"                                                                                                                                                                                                                                                  |
| P2  | „eGK einlesen"                                                                                                                                                                                                                                        | Befugnis bis …; Knopf „Patient Summary" erscheint                                                                                                                                                                                                                                                                             |
| P3  | „Patient Summary"                                                                                                                                                                                                                                     | sieben von acht Abschnitten (ab Weiterentwicklung 3); Marker „geführt"/„automatisch"; Diagnosen „+ 2 weitere Einträge"; Impfungen fünf, jüngste zuerst; Prozeduren Kardioversion und Implantate Schrittmacher „aus Entlassbrief"; Herkunft unter jedem Listeneintrag                                                          |
| P4  | Sprünge aus der Patient Summary                                                                                                                                                                                                                       | Allergien/Diagnosen → Splitscreen mit Fokus auf dem Block; Medikation; Labor; „In Dokumenten suchen" → Reiter Dokumente                                                                                                                                                                                                       |
| P5  | Diagnose „in die ePA →", dann Patient Summary                                                                                                                                                                                                         | neuer Eintrag erscheint                                                                                                                                                                                                                                                                                                       |
| P6  | Demo-Steuerung „nur automatischen Daten"                                                                                                                                                                                                              | sechs von acht Abschnitten mit Inhalt: Allergien (2) und Diagnosen (3, darunter Harnwegsinfektion „Aktiv") „strukturierte Dokumente · automatisch" aus dem Entlassbrief; Medikation aus der Liste (5); Prozeduren und Implantate aus dem Entlassbrief; Impfungen und Erklärungen „Information nicht verfügbar"                |
| P7  | Ausbaustand „Release 3.1.3"                                                                                                                                                                                                                           | Knopf und Reiter Patient Summary verschwinden; Laborbefunde als PDF; Listen fehlen                                                                                                                                                                                                                                            |
| P8  | Laborbefunde übernehmen → Labor                                                                                                                                                                                                                       | Kumulativbefund mit zwei Spalten                                                                                                                                                                                                                                                                                              |
| P9  | Medikation: Metformin „in den Plan"                                                                                                                                                                                                                   | AMTS-Warnung mit eGFR und Grundlage; nach „übernehmen" im Plan                                                                                                                                                                                                                                                                |
| P10 | „Andere Einrichtung ändert zwischendurch" → „pausieren"                                                                                                                                                                                               | 409-Meldung, Stand neu geladen; zweiter Versuch gelingt                                                                                                                                                                                                                                                                       |
| P11 | Dokumente: Volltext „Echokardiographie", „Ansehen"                                                                                                                                                                                                    | ein Treffer, Brief als lesbarer Text                                                                                                                                                                                                                                                                                          |
| P12 | Frau Yildiz: Karteikarte, Notiz speichern                                                                                                                                                                                                             | Notiz im Verlauf                                                                                                                                                                                                                                                                                                              |
| P13 | „Befugnisse entziehen" → Patient Summary                                                                                                                                                                                                              | 403-Lage mit „eGK einlesen", Kopf „keine ePA-Befugnis"                                                                                                                                                                                                                                                                        |
| P14 | Konsole                                                                                                                                                                                                                                               | nur die gewollten Statuscodes (403, 404 im Release, 409), keine Skriptfehler                                                                                                                                                                                                                                                  |
| P15 | Splitscreen: ★ an einem Eintrag setzen und aufheben                                                                                                                                                                                                   | violett hinterlegt bzw. nicht, Zähler im Kopf ändert sich; Patient Summary folgt, „+ n weitere" stimmt                                                                                                                                                                                                                        |
| P16 | „Andere Einrichtung ändert zwischendurch" → ★                                                                                                                                                                                                         | 409-Meldung, Liste neu geladen; zweiter Versuch gelingt                                                                                                                                                                                                                                                                       |
| P17 | ePA-Fenster → „Diagnosen und Allergien"                                                                                                                                                                                                               | alle Einträge der Listen, markierte violett mit ★                                                                                                                                                                                                                                                                             |
| P18 | Neue Dauerdiagnose erfassen                                                                                                                                                                                                                           | „In der Diagnosenliste führen" und „Relevant für die Patient Summary" vorbelegt; Relevanz gesperrt ohne Listenaufnahme; nach dem Speichern in der Patient Summary                                                                                                                                                             |
| P19 | Frau Weber öffnen                                                                                                                                                                                                                                     | Kopf „keine ePA", „ePA öffnen" gesperrt, kein Knopf „Patient Summary"                                                                                                                                                                                                                                                         |
| P20 | Herr Krüger → Medikation                                                                                                                                                                                                                              | Kopf „Widerspruch Medikationsprozess"; Band „… widersprochen" statt Fehler; Patient Summary: Medikation „Gesperrt durch Widerspruch"                                                                                                                                                                                          |
| P21 | Konfiguration → Akten → Hoffmann „gesperrt"                                                                                                                                                                                                           | Kopf „ePA vorübergehend gesperrt"; ePA-Fenster 409-Lage; zurücksetzen hebt es auf                                                                                                                                                                                                                                             |
| P22 | ePA-Fenster, Dokumente, Splitscreen                                                                                                                                                                                                                   | „Stand hh:mm:ss" mit „↻ aktualisieren"; Uhrzeit ändert sich nach dem Aktualisieren                                                                                                                                                                                                                                            |
| P23 | Frau Hoffmann, Medikation: Ramipril „Rezept" → „Signieren und senden"                                                                                                                                                                                 | Reichweite im Formular; Karte E-Rezepte „Übertragung ausstehend", nach etwa 3 s „in der Medikationsliste"; am Planeintrag „verordnet …"                                                                                                                                                                                       |
| P24 | Apotheke „mit Austausch" → „↻" bzw. „Stand prüfen"                                                                                                                                                                                                    | Planeintrag 2,5 mg, Dosierung 2-0-0-0, Fassung erhöht; E-Rezept „eingelöst am …" mit abgegebenem Arzneimittel                                                                                                                                                                                                                 |
| P25 | Apixaban verordnen, Apotheke „zwei Arzneimittel"                                                                                                                                                                                                      | Warnband „mehrere Arzneimittel abgegeben", Marker am Planeintrag; Plan unverändert                                                                                                                                                                                                                                            |
| P26 | Metformin in der Liste „Rezept", „Auch in den Medikationsplan", senden                                                                                                                                                                                | Metformin im Plan, verknüpft; E-Rezept „aus dem Plan"                                                                                                                                                                                                                                                                         |
| P27 | Rolle MFA: „Rezept" → „Zur Signatur vorbereiten"; Rolle Ärztin → „Rezepte"                                                                                                                                                                            | Zahl in der Kopfleiste; Auswahl signieren; gesperrte Freigabe nicht wählbar                                                                                                                                                                                                                                                   |
| P28 | E-Rezept „löschen" vor der Einlösung                                                                                                                                                                                                                  | Stand „gelöscht"; Eintrag verschwindet aus der Medikationsliste                                                                                                                                                                                                                                                               |
| P29 | Karteikarte, Filter „ePA"                                                                                                                                                                                                                             | ↓ an übernommenen, ↑ an eingestellten Einträgen und gesendeten E-Rezepten                                                                                                                                                                                                                                                     |
| P30 | Frau Hoffmann, Karteikarte                                                                                                                                                                                                                            | Blöcke je Tag, „heutiger Besuch" mit Termin oben; Notiz speichern → im heutigen Block; Tage ohne Besuch als „Eingang"                                                                                                                                                                                                         |
| P31 | Frau Yildiz, „Impfungen": Grippeimpfung „in die ePA →"                                                                                                                                                                                                | rechts in der Impfliste, verknüpft; Karteikarte ↑ an der Impfung                                                                                                                                                                                                                                                              |
| P32 | Neue Impfung aus dem Katalog erfassen, „in die ePA"                                                                                                                                                                                                   | Zielkrankheit aus dem Katalog; FHIR-Vorschau `immunization-eu-core`; Patient Summary zeigt sie                                                                                                                                                                                                                                |
| P33 | Ausbaustand „Weiterentwicklung 2"                                                                                                                                                                                                                     | keine Patient Summary, kein Splitscreen mit ePA-Listen, „Impfungen" nur Praxisseite; Metadaten von Diagnose-Service, Impfliste und Patient Summary 404 (erwartet); Entlassbrief 2026 strukturiert                                                                                                                             |
| P34 | Patient Summary öffnen, Akten → „andere Einrichtung trägt ein", Patient Summary erneut                                                                                                                                                                | Band „2 neu (andere Einrichtungen)", Marken **neu**; ebenso in Diagnosen und Impfungen; nach erneutem Öffnen kein Band                                                                                                                                                                                                        |
| P35 | Eigene Diagnose in die ePA, danach Patient Summary                                                                                                                                                                                                    | kein Band — eigene Änderungen zählen nicht                                                                                                                                                                                                                                                                                    |
| P36 | Frau Hoffmann nach eGK, „Diagnosen und Allergien"                                                                                                                                                                                                     | Kompakte Zeilen, jüngste Einstellung oben, Datum in der Mitte; Bezeichnung anklicken → beide Seiten aufgeklappt mit Herkunft, „bearbeiten", „berichtigen …"; „alle aufklappen"                                                                                                                                                |
| P37 | Sortierung „Eigene Reihenfolge", Zeile ziehen und ↑ ↓; danach Nierenkrankheit „in die ePA →"                                                                                                                                                          | Reihenfolge folgt und bleibt nach dem Einstellen; ePA-Fenster zeigt dieselbe; Handlungszähler unverändert                                                                                                                                                                                                                     |
| P38 | Frau Hoffmann nach eGK: „Medikation" und „Dokumente" einmal öffnen, dann „andere Einrichtung trägt ein", beide erneut öffnen                                                                                                                          | Medikationsplan: Band „1 neu · 1 geändert (Kardiologische Praxis am Wall)", Marken an Torasemid und Bisoprolol; Liste: „1 neu"; Dokumente: „1 Dokument neu"; Aufrufprotokoll mit `recorded=gt`, `provenance=`, `date=gt`, `_lastUpdated=gt`                                                                                   |
| P39 | Eigene Planänderung (pausieren), Medikation erneut öffnen                                                                                                                                                                                             | kein Band                                                                                                                                                                                                                                                                                                                     |
| P40 | Ausbaustand „Release 3.1.3", „andere Einrichtung trägt ein"                                                                                                                                                                                           | Befund und Planänderung erscheinen; keine Listen                                                                                                                                                                                                                                                                              |
| P41 | Ausbaustand „Release 3.1.3", Frau Hoffmann, „Dokumente": Entlassbrief 17.07.2026 „Ansehen"; dann „Weiterentwicklung 1" (noch PDF) und „Weiterentwicklung 2", erneut „Ansehen"                                                                         | Release: mehrseitiges PDF mit Fließtext; Weiterentwicklung: strukturierter Entlassbrief mit elf Abschnitten und Einträgen; Brief von 2019 und Befundbericht weiterhin PDF                                                                                                                                                     |
| P42 | Ausbaustand „Release 3.1.3", ePA-Fenster → Dokumente; dann „Weiterentwicklung 1"                                                                                                                                                                      | Release: kein Volltextfeld; ab Weiterentwicklung 1 Feld „Volltext", Suche nach „Kreatinin" findet die Laborbefunde                                                                                                                                                                                                            |
| P43 | Ausbaustand „Weiterentwicklung 4", Frau Hoffmann nach eGK, Reiter „Aktenlotse ✦"                                                                                                                                                                      | zwei Spalten; Kontext beginnt „Renate Hoffmann war vom …"; „Entlassbrief · 17.07.2026" an „Zu klären" öffnet rechts die PDF-Ansicht mit markierter Zeile Metformin                                                                                                                                                            |
| P44 | Versichertensicht → Aktenlotse → „Was vertrage ich nicht?" → „Im Dokument nachlesen"                                                                                                                                                                  | Dokument öffnet im Bereich „Dokumente" als PDF mit markierten Allergiezeilen; der Brief von 2019 mit markiertem Satz „Allergien sind nicht bekannt"                                                                                                                                                                           |
| P45 | ePA-Fenster → Dokumente → strukturierter Entlassbrief „Ansehen" (ab Weiterentwicklung 2)                                                                                                                                                              | Umschaltung „Strukturiert" / „PDF-Ansicht"; PDF mit Briefkopf und Fußzeile „Ansicht, erzeugt aus dem strukturierten Dokument"                                                                                                                                                                                                 |
| P46 | Weiterentwicklung 4, Frau Hoffmann nach eGK → „Aktenlotse ✦" im Patientenkopf                                                                                                                                                                         | ePA-Fenster öffnet auf dem Bereich „Aktenlotse ✦"; Quelle an „Zu klären" öffnet rechts das Dokument mit Markierung, das Fenster selbst bleibt oben                                                                                                                                                                            |
| P47 | Weiterentwicklung 4, Versichertensicht → Aktenlotse → „Werde ich wieder gesund?“; dann „Ist das ein Notfall?“; in der Praxis „Ist das gefährlich?“                                                                                                    | Marker „Keine Bewertung“, Verweis an Ärztin oder Arzt, keine Umfangsangabe, „Vorlesen“ vorhanden; bei „Notfall“ zusätzlich 112 und 116 117; in der Praxis fachliche Ablehnung ohne Notrufnummern                                                                                                                              |
| P48 | Frau Hoffmann nach eGK → Konfiguration → „Befugnisse entziehen“ → „Aktenlotse ✦“ → „eGK einlesen“                                                                                                                                                     | Befugnisliste der Konfiguration leer; Kopf „keine ePA-Befugnis“; ePA-Fenster: „kein Zugriff (403 notEntitled)“ und „eGK einlesen“ statt Daten; nach dem Einlesen „ePA-Befugnis bis …“, „Zugriff besteht“, Lotse wieder da                                                                                                     |
| P49 | Konfiguration → Akten → Hoffmann „Widerspruch Medikation“ → „Aktenlotse ✦“; danach Widerspruch zurück und „andere Einrichtung trägt ein“                                                                                                              | Mit Widerspruch: kein „Zu klären“, „8 von 10 Unterlagen gelesen · 2 nicht gelesen“, Medikationsplan „nicht einbezogen“; danach „10 von 11“ und zweite Abweichung Torasemid                                                                                                                                                    |
| P50 | Konfiguration → Akten → Hoffmann „gesperrt“ → Versichertensicht                                                                                                                                                                                       | „Die ePA ist vorübergehend gesperrt.“ statt Dokumentenliste; keine Zahl am Bereich „Dokumente“; nach dem Entsperren wieder sechs Dokumente                                                                                                                                                                                    |
| P51 | Weiterentwicklung 4, Frau Hoffmann nach eGK → ePA-Fenster → Dokumente → „Vorbefund Kardiologie (eingescannt)“ „Ansehen“; dann Volltext „vertragen“ und „lass“; dann Aktenlotse                                                                        | Bild einer schräg eingescannten Seite mit Stempel und Handschrift „ASS nicht vertragen“; Volltext findet den Scan nicht, „lass“ findet nichts; Lotse „9 von 10 Unterlagen gelesen“, Scan als „PDF ohne hinterlegte Textebene“                                                                                                 |
| P52 | Frau Hoffmann, „Dokumente“ → „Medikationsübersicht der Vorbehandlung (Scan)“ „Ansehen“; dann „Unterlage einscannen“                                                                                                                                   | Querformatiger Medikationsplan der früheren Hausarztpraxis als Bild-PDF, Größe rund 49 KB; neu eingescannter Eintrag zeigt „ohne Datei“                                                                                                                                                                                       |
| P53 | Weiterentwicklung 4, Frau Hoffmann nach eGK → „Aktenlotse ✦“                                                                                                                                                                                          | Block „Unklar beschriftet 3“ mit „laut Inhalt“ und Gründen; „öffnen“ zeigt das Dokument mit genau einer markierten Zeile (Betreff); Kopf „9 von 10 Unterlagen gelesen · 1 nicht gelesen“                                                                                                                                      |
| P54 | Versichertensicht → Dokumente                                                                                                                                                                                                                         | neun Dokumente; unter „Scan_20230914_0007“, „Befund“, „Anlage 1“ je „✦ laut Inhalt: …“                                                                                                                                                                                                                                        |
| P55 | Versichertensicht → Scan 2019 → „Nachfragen“ → „Stimmt das?“; dann „Befund“ → „Nachfragen“ → „Stimmt das?“                                                                                                                                            | Brinkmann mit „Anrufen · 0000 4711-0“ und „kein TI-Messenger“; „AGP am Markt — nicht im Verzeichnis“ ohne Telefon; Bezug bei „Befund“ mit „laut Inhalt“                                                                                                                                                                       |
| P56 | Aktenlotse → „Werde ich wieder gesund?“ → „An die Hausarztpraxis“ → „Nachricht ✦“ → „Nachricht vorbereiten“; dann „Für den Termin notieren“; Rolle wechseln                                                                                           | Hausarztpraxis am Stadtgarten mit Telefon und Nachricht; „Nachricht vorbereitet · nicht versendet“; „Meine Fragen“ zählt mit; nach dem Rollenwechsel leer                                                                                                                                                                     |
| P57 | Versichertensicht → Aktenlotse → „Welche Medikamente nehme ich und wofür?“ → „Medikationsplan (eMP)“ → „Zurück“; Praxis → „Aktenlotse ✦“ → „Welche Dauermedikation ist dokumentiert?“ → „Medikationsplan (eMP)“ → „Im Medikationsplan der ePA öffnen“ | Plan mit „Stand 18.07.2026“ und vier markierten Zeilen, „Zurück“ zur selben Antwort; in der Praxis Antwort mit vier Mitteln, danach Reiter „Medikation“ mit demselben Stand                                                                                                                                                   |
| P58 | Frau Hoffmann nach eGK: ePA-Fenster → Dokumente; Kartei → Dokumente; Versichertensicht → Dokumente                                                                                                                                                    | Dieselben neun ePA-Dokumente in derselben Reihenfolge (12.08.2026 zuerst, 05.04.2019 zuletzt; bei 03.02.2025 „Anlage 1“, „Befund“, „Scan_20230914_0007“), je mit „✦ laut Inhalt“ unter den drei unklaren; die Kartei zusätzlich mit der nur lokalen Medikationsübersicht                                                      |
| P59 | Weiterentwicklung 4: Navigation des Praxissystems; Konfiguration → „Meine ePA öffnen“ → „Zum Praxissystem“; Ausbaustand „Weiterentwicklung 3“ und erneut Konfiguration                                                                                | Navigation nur „Tagesübersicht · Patient:innen · Rezepte“; Versichertensicht im eigenen Rahmen ohne Praxisnavigation; zurück auf der Tagesübersicht; in Stufe 3 kein Eintrag „Versichertensicht“ in der Konfiguration                                                                                                         |
| P60 | Weiterentwicklung 3, Frau Hoffmann ohne Befugnis → „Arztbrief ✦“; dann „eGK einlesen“                                                                                                                                                                 | ohne Befugnis: Medikation „Keine Befugnis für die ePA dieser Person.“; nach eGK: Laborbefund aus der ePA und vier Planeinträge vorausgewählt, „10 übernommen“; Vorschau an Kardiologische Praxis am Wall, Betreff mit Name und Geburtsdatum; Konsole ohne Fehler                                                              |
| P61 | Beurteilung tippen → „Unterschreiben“ → „In die ePA einstellen“ → „Per KIM senden“; Aufrufprotokoll                                                                                                                                                   | „in der ePA“, „per KIM zugestellt“; Protokoll: POST `…/I_Document_Management` „RegistryResponse Success“ mit SOAP-Körper, POST `/kim/demo/clientmodul/smtp` „250 …“ mit Client-Mail; Dokumente: „lokal, in ePA eingestellt“, Vermerk „per KIM an …“; Abrechnung: 86900                                                        |
| P62 | „An“: Dr. Brinkmann; Rolle „MFA“; Ausbaustand „Release 3.1.3“                                                                                                                                                                                         | „keine KIM-Adresse“, Versand gesperrt; „Unterschreiben“ gesperrt mit „nur ärztlich“; kein Reiter „Arztbrief ✦“                                                                                                                                                                                                                |
| P63 | Nach dem Einstellen: „Aktenlotse ✦“ → „Was ist mit der Belastungsdyspnoe?“                                                                                                                                                                            | Antwort mit Beleg aus „Arztbrief an Kardiologische Praxis am Wall“; der Brief steht nicht unter „Unklar beschriftet“                                                                                                                                                                                                          |
| P64 | Arztbrief nach eGK → je Abschnitt „Auswählen ▾“; Diagnosen: Vorhofflimmern ☑; Escape; Befunde → „Befund in der Karteikarte notieren →“ → Notiz B speichern → zurück                                                                                   | Menü mit Gruppen Praxis und ePA, Filterfeld fokussiert; ePA-Eintrag mit Marker „ePA“ im Brief; Escape schließt, Fokus am Knopf; Reiter „Arztbrief ✦ · Entwurf“; neuer Befund gewählt mit „neu“, Beurteilung erhalten; Konsole ohne Fehler                                                                                     |
| P65 | Diagnose erfassen: Klinischer Status „Rezidiv“, dann „Behoben“                                                                                                                                                                                        | Bei „Rezidiv“ ist „Zeitraum bis“ gesperrt („nur Beginn, solange gegenwärtig“) und leer; bei „Behoben“ frei. Die FHIR-Vorschau zeigt `abatementDateTime` nur bei „Behoben“                                                                                                                                                     |
| P66 | Allergie erfassen: Klinischer Status „Aktiv“, dann „Behoben“ mit „Zeitraum bis“                                                                                                                                                                       | Bei „Aktiv“ ist „Zeitraum bis“ gesperrt; nach dem Speichern trägt der Eintrag der Allergienliste das Ende als Extension `allergyintolerance-abatement`, nicht als `onsetPeriod`                                                                                                                                               |
| P67 | „Weiterentwicklung 1“, Frau Hoffmann nach eGK → ePA-Fenster → Reiter „Patient Summary“                                                                                                                                                                | „vom Aktensystem erzeugt · Ballot ePA 3.2“, „0 von 5 Abschnitten mit Inhalt“, fünf Blöcke „Information nicht verfügbar“; in den Aufrufen ITI-67 `type=…60591-5`, dann ITI-68                                                                                                                                                  |
| P68 | Ausbaustand von „Weiterentwicklung 1“ auf „3“, dann auf „Release 3.1.3“                                                                                                                                                                               | in 3 die ✦ Patient Summary ohne den Marker, in 3.1.3 weder Reiter noch Kachel; beim Umschalten kein Abruf mit altem Stand (kein 404 auf `$summary`, keine ePS-Suche in 3)                                                                                                                                                     |
| P69 | Frau Hoffmann nach eGK → Patient Summary → Prozeduren und Implantate: Quelldokument unter einem Eintrag anklicken                                                                                                                                     | Bereich „Dokumente“, genau dieses Dokument im Betrachter geöffnet und ins Bild gerollt, Zeile markiert; „In Dokumenten suchen“ öffnet weiter die ganze Liste; Konsole ohne Fehler                                                                                                                                             |
| P70 | Arztbrief → Diagnosen „+ Neue Diagnose“ → Diagnose suchen, Dauerdiagnose, speichern; dasselbe für „+ Neue Allergie“                                                                                                                                   | Pop-up mit der Maske der Liste, Fokus im Pop-up, Escape schließt ohne Speichern; nach dem Speichern Eintrag im Brief gewählt mit „neu“, in „Diagnosen und Allergien“ vorhanden, mit Kästchen auch in der ePA-Liste; Entwurf und Beurteilung unverändert                                                                       |
| P71 | Arztbrief → Diagnosen „Auswählen ▾“ → Vorhofflimmern (nur ePA) „Ändern“; danach an einer Praxisdiagnose im Brief „Ändern“                                                                                                                             | „Diagnose aus der ePA ändern“ mit „Änderung in die Diagnosenliste der ePA übertragen“ ☑; nach dem Speichern steht der Eintrag bei der Praxis, verknüpft, kein zweiter Listeneintrag; Rolle MFA: weder „+ Neue …“ noch „Ändern“                                                                                                |
| P72 | Frau Weber → „Medikation“ → „neues E-Rezept“ → Ramipril, „Auch in den Medikationsplan aufnehmen“ → senden; zweites Rezept ohne Haken → „in den Plan“                                                                                                  | Karte „Medikationsplan der Praxis“ mit beiden Mitteln, „verordnet …“; E-Rezepte „keine ePA“, „· im Plan“; Medikationsliste „Keine ePA.“; Karteikarte zeigt die Planeinträge                                                                                                                                                   |
| P73 | Frau Hoffmann nach eGK oder Frau Weber → „Medikation“ → „neuer Planeintrag“ → Mittel wählen → „In den Plan aufnehmen“ → erneut „neuer Planeintrag“                                                                                                    | Dialog erst nach dem Knopf; nach dem Aufnehmen geschlossen, neu geöffnet leer, kein Befund vom vorigen Mittel; „abbrechen“ schließt                                                                                                                                                                                           |
| P74 | Frau Hoffmann ohne eGK → „Medikation“ → „neuer Planeintrag“ → Ramipril; dann „eGK einlesen“                                                                                                                                                           | Vorher: Band „Nicht abgeglichen · keine ePA-Befugnis · noch nie …“, Ramipril „nur Praxis“, Medikationsliste „Ohne Zugriff auf die ePA.“. Nachher: Mittel des eMP „abgeglichen“ ohne Klick, Band „1 Unterschied offen“; „in die ePA →“ → abgeglichen, kein Doppeleintrag; Karteikarte und Arztbrief zeigen den Plan der Praxis |
| P75 | Mit Befugnis Apixaban abgeglichen → „Befugnisse entziehen“ → „pausieren“ → „eGK einlesen“                                                                                                                                                             | „lokal geändert“, darunter der eMP-Stand; „Änderung in die ePA →“ schreibt `$update-emp-entry` mit `on-hold`, danach „abgeglichen“; „← ePA-Stand“ verwirft die Änderung                                                                                                                                                       |

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
