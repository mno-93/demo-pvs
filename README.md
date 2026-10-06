# Demo-PVS — Praxisverwaltungssystem zur ePA und zur EU Patient Summary

**Fiktives System. Kein Medizinprodukt, kein Produktabbild, keine echten Patientendaten.**

Eine Demonstrationsanwendung, die den Alltag einer hausärztlichen Praxis so weit nachbildet, dass
sich prüfen lässt, was eine ärztlich verantwortete Patient Summary kostet — gemessen an der
Dokumentation, die ohnehin stattfindet. Dazu gehört ein ePA-Simulator nach den veröffentlichten
Spezifikationen der gematik (Release ePA 3.1.3) mit vier zuschaltbaren, aufeinander aufbauenden
Ausbaustufen. „Weiterentwicklung 1": strukturierte Laborbefunde (Vorschau ePA 3.2) und
Volltextsuche. „Weiterentwicklung 2": ✦ Arzt- und Entlassbriefe als FHIR-Dokument nach
europäischem Vorbild. „Weiterentwicklung 3": ✦ Allergien-, Diagnosen- und Impfliste und ✦ die
Patient Summary als Sicht auf diese Quellen. „Weiterentwicklung 4" schaltet ✦ den
**Aktenlotsen** frei: einen Auskunftsdienst, der Fragen an den Aktenbestand in
zusammenhängenden Sätzen beantwortet — mit der Unterlage, in der es nachzulesen ist, mit der Angabe,
wie viele Unterlagen gelesen wurden und welche nicht, und ohne zu bewerten. Die Demo startet im
Release 3.1.3; die Ausbaustufen werden über das Aufrufprotokoll zugeschaltet.

Die Karteikarte zeigt den Verlauf je Besuch: Notizen, strukturierte Einträge und Dokumente eines
Tages in einem Block. Medikation, Dokumente, Patient Summary und Listen zeigen, was andere
Einrichtungen seit dem letzten Aufruf eingetragen haben — für Medikation und Dokumente über die
Abfragen, die die Implementation Guides dafür vorsehen.

Das PVS verordnet E-Rezepte über einen Demo-Ersatz des E-Rezept-Fachdienstes; aus dem Plan
verordnet, verknüpfen sich Plan und Medikationsliste über den eMP-Identifier.

Die Spezifikation ist zugleich als **Blaupause für gute Bedienbarkeit** gedacht: 30 UX-Grundsätze,
jeweils mit Begründung und der Stelle, an der sie in der Demo zu sehen sind
([SPEZIFIKATION.md, Abschnitt 2.2](docs/SPEZIFIKATION.md#22-ux-grundsätze--eine-blaupause)).

| Dokument                                         | Inhalt                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [docs/SPEZIFIKATION.md](docs/SPEZIFIKATION.md)   | Was die Demo zeigt, Ansicht für Ansicht; ePA-Wege; Vorführung       |
| [docs/QUELLEN.md](docs/QUELLEN.md)               | Veröffentlichte Spezifikationen mit Version                         |
| [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)       | Aufbau, Systemgrenze, Regeln beim Weiterbauen                       |
| [docs/GESTALTUNG.md](docs/GESTALTUNG.md)         | Gestaltungsvariablen, Bausteine, Muster; von Figma in den Code      |
| [docs/ZUSAMMENARBEIT.md](docs/ZUSAMMENARBEIT.md) | Rollen, Arbeitsablauf mit Issues und Pull Requests, Vertraulichkeit |
| [CLAUDE.md](CLAUDE.md)                           | Regeln für Claude-Sitzungen im Team                                 |
| [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md)       | Befehle, Werkzeuge, Konventionen                                    |
| [docs/entscheidungen/](docs/entscheidungen/)     | Architekturentscheidungen mit verworfener Alternative               |

## Schnellstart

Node ab Version 20.

```bash
npm install
npm run dev
```

| Anwendung        | Adresse               | Was sie ist                                                  |
| ---------------- | --------------------- | ------------------------------------------------------------ |
| Praxisverwaltung | http://localhost:5173 | Das PVS — hier wird gearbeitet                               |
| ePA-Simulator    | http://localhost:8787 | Das simulierte Aktensystem; Übersicht der Wege unter `GET /` |

Einzeln starten: `npm run dev:pvs` beziehungsweise `npm run dev:epa`. Vor jedem Commit:

```bash
npm run pruefen
```

## Mitarbeiten

Gearbeitet wird über Issues, eigene Branches und Pull Requests — auch mit Claude Code, das die
Regeln aus [CLAUDE.md](CLAUDE.md) übernimmt. Rollen, Ablauf und was nie ins Repository darf:
[docs/ZUSAMMENARBEIT.md](docs/ZUSAMMENARBEIT.md). Für Gestaltung:
[docs/GESTALTUNG.md](docs/GESTALTUNG.md).

## Gehostete Demo

Der Workflow [`.github/workflows/demo.yml`](.github/workflows/demo.yml) prüft jede Änderung und
baut eine Fassung, in der der ePA-Simulator im Browser läuft — ePA, E-Rezepte und
Demo-Steuerung funktionieren ohne Server
([ADR 0025](docs/entscheidungen/0025-gehostete-demo-mit-simulator-im-browser.md)). Neu laden setzt
den Bestand zurück.

Veröffentlicht wird auf GitHub Pages, sobald

1. unter _Settings → Pages_ als Quelle **GitHub Actions** gewählt ist und
2. unter _Settings → Secrets and variables → Actions → Variables_ die Variable
   `PAGES_FREIGEGEBEN` den Wert `ja` hat.

Die Seite ist dann unter `https://<konto>.github.io/<repository>/` **öffentlich** erreichbar,
auch wenn das Repository privat ist (Pages aus privaten Repositorys setzt einen kostenpflichtigen
Plan voraus). Lokal ansehen:

```bash
npm run build:gehostet
npm run vorschau:gehostet
```

## Erste Schritte in der Demo

1. **Renate Hoffmann** öffnen → „ePA öffnen": Die ePA verweigert den Zugriff. „eGK einlesen".
   **Dokumente**: Laborbefunde, Arzt- und Entlassbriefe liegen als PDF vor — wie heute.
   Für die folgenden Schritte **Konfiguration → Ausbaustand → „Weiterentwicklung 3"** wählen.
2. **Diagnosen und Allergien**: links die Praxis, rechts die Listen der ePA (✦). Vorhofflimmern
   „← in die Praxis", Diabetes „verknüpfen".
3. **Medikation**: Metformin „in den Plan" — die AMTS-Prüfung meldet die fehlende Nierenfunktion.
4. **Patient Summary** im Patientenkopf: die Übersicht in einem Klick. Jeder Block führt dorthin,
   wo er gepflegt wird. Welche Einträge der Listen sie zeigt, bestimmt die Markierung ★ im
   Splitscreen — die Listen bleiben vollständig.
5. **Medikation**: Ramipril „Rezept" → „Signieren und senden". Nach wenigen Sekunden steht die
   Verordnung in der Medikationsliste, verknüpft mit dem Planeintrag.
6. **Konfiguration** (oben rechts): die Demo-Steuerung und jeder Aufruf an die ePA mit Grundlage. Daneben führt **Dokumentation ↗** zur Spezifikation auf GitHub. Demo-Steuerung:
   (Ausbaustand, Konflikt, Befugnis entziehen, Patient Summary geführt oder automatisch,
   Übertragungszeit des E-Rezepts, Akten sperren oder Widerspruch setzen, andere Einrichtung
   trägt ein, Apotheke gibt ab).
7. **Konfiguration → Akten → „andere Einrichtung trägt ein"**, dann erneut **Patient Summary**:
   Band „Seit dem letzten Aufruf …" und Marken **neu** an den fremden Einträgen.
8. **Konfiguration → Ausbaustand → „Weiterentwicklung 4"**: Erst damit gibt es den ✦ Aktenlotsen.
   Im Patientenkopf öffnet „Aktenlotse ✦" die ePA auf dem Bereich des Lotsen; er steht auch als
   Reiter der Kartei. In der Navigation erscheint „Versichertensicht ✦".
9. **Aktenlotse**: Kontext zum Krankenhausaufenthalt in ganzen Sätzen, mit der Unterlage darunter —
   anklickbar, sie öffnet sich zum Nachlesen. „6 von 7 Unterlagen gelesen", der eingescannte
   Vorbefund hat keine Textebene. Und genau eine Abweichung: Metformin steht im Entlassbrief, nicht
   im Plan. Darunter Vorschläge für die Listen.
10. **Versichertensicht**: aufgebaut wie ein FdV — Einstieg ist die Dokumentenliste, der Aktenlotse
    ist ein Bereich daneben. Dort „Welche Medikamente nehme ich und wofür?" fragen; die
    Quellenangabe unter der Antwort öffnet das Dokument im Bereich „Dokumente". Rolle auf
    **Vertretung entzogen** umschalten: Akte und Lotse sind gleichermaßen leer — er hat keine
    eigenen Rechte. Zurück zur eigenen Akte und „Werde ich wieder gesund?" fragen: **Keine
    Bewertung** — der Lotse verweist an die Ärztin oder den Arzt.

Weitere Abläufe: [SPEZIFIKATION.md, Abschnitt 11](docs/SPEZIFIKATION.md#11-vorführung). Wozu jedes
Beispiel im Bestand da ist: [Abschnitt 3.1](docs/SPEZIFIKATION.md#31-beispielbestand-und-wozu-er-dient).

## Aufbau

```
packages/kern      Domänentypen, Terminologien, Fachlogik, FHIR-Abbildung — ohne Oberflächenbezug
packages/epa-sim   ePA-Simulator: Befugnis, Information Service, MHD Service, Medication Service;
                   ✦ Diagnose-Service, ✦ Impfliste, ✦ Patient Summary, ✦ Aktenlotse;
                   E-Rezept-Fachdienst (Demo-Ersatz)
packages/pvs       Praxisverwaltung: React, Vite
daten/kataloge     Katalogauszüge und Wertelisten — nicht amtlich, mit Herkunft im Kopf
docs               Spezifikation, Quellen, Architektur, Entwicklung, Entscheidungen
werkzeuge          Katalogerzeugung, Übernahme von Wertelisten und Dokumenttypen, Dienststart
```

## Grenzen

Keine TI-Anbindung, kein Konnektor, keine Karten, kein VSDM, keine Signatur, keine
Protokollierung. Der E-Rezept-Fachdienst ist ein Demo-Ersatz ohne VAU und QES. „eGK einlesen" erzeugt einen Demo-Prüfungsnachweis und registriert damit die
Befugnis — wie im Wirkbetrieb, aber ohne Karte. Es gibt keinen Importweg für echte Daten, und es
soll keinen geben.

Die Katalogauszüge sind auf den Demo-Zweck beschränkt und nicht amtlich. Sie dürfen nicht als
Katalog weitergegeben werden. Die Wertelisten für Allergien stammen aus einem nicht
veröffentlichten Arbeitsstand ([QUELLEN.md](docs/QUELLEN.md)).

Mit ✦ gekennzeichnete Teile sind Vorschläge und nicht spezifiziert.

## Stand

|         | Inhalt                                                                                                                                                                                                                              | Stand        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| M1      | PVS-Kern: Patientenverwaltung, Karteikarte, Diagnosen, Abrechnung, Termine                                                                                                                                                          | erledigt     |
| M2      | Medikationsmodul nach dgMP                                                                                                                                                                                                          | erledigt     |
| M3      | ePA-Anbindung mit Aufrufprotokoll, Dokumentenablage                                                                                                                                                                                 | erledigt     |
| M3a     | Spezifikationstreue, Erfassung nach Informationsmodell, Labor                                                                                                                                                                       | erledigt     |
| M3b     | Befugnis über die eGK; ✦ Diagnose-Service mit Splitscreen                                                                                                                                                                           | erledigt     |
| M3c     | Konformität mit den IGs (Medication 1.3.5, MHD 1.1.3, epa 1.3.2), PDF-Befunde, selbsterklärende Oberfläche                                                                                                                          | erledigt     |
| M4a     | ✦ Patient Summary als Sicht: Zugang, Blöcke mit Quelle, Sprung zur Pflege, Leerangaben, geführt gegen automatisch                                                                                                                   | erledigt     |
| M4b     | ✦ Relevanzmarkierung je Listeneintrag (★), Patient Summary zeigt nur Markiertes                                                                                                                                                     | erledigt     |
| M4d     | Zustand der Akte (Information Service, Widerspruch), „Stand" an jeder ePA-Ansicht, Kennzeichen ↓/↑ in der Karteikarte; E-Rezept aus dem Plan mit Fachdienst-Ersatz, Abgabe, Stornierung, Hinweis bei Mehrfachabgabe, Signaturstapel | erledigt     |
| M4f     | Verlauf je Besuch; ✦ Impfliste als Ausbaustand „Weiterentwicklung 2" mit Bereich Impfungen; „neu seit dem letzten Aufruf" für Patient Summary und Listen                                                                            | erledigt     |
| M4g     | Diagnosen und Allergien kompakt und aufklappbar, Ordnung nach Einstelldatum oder eigene Reihenfolge                                                                                                                                 | erledigt     |
| M4h     | „Neu seit dem letzten Aufruf" für Medikation und Dokumente über die spezifizierten Abfragen (`_lastUpdated`, Chronologie nach `recorded`, früherer Planstand, `$medication-list` mit `date`)                                        | erledigt     |
| M4i     | ✦ Patient Summary: Prozeduren und Implantate automatisch aus strukturierten Dokumenten, mit Quelldokument                                                                                                                           | erledigt     |
| **M4c** | Patient Summary: Aufwandszähler, Quelle für persönliche Erklärungen, gespeicherte Fassung                                                                                                                                           | als Nächstes |
| M4e     | Hochladen mit Metadaten, Widerspruch gegen einzelne Dokumente, Tagesübersicht „neu seit dem letzten Besuch" (Ausblick in SPEZIFIKATION 9.1)                                                                                         | geplant      |
| M5      | Zulauf aus dem Entlassbrief, Notfallzugriff, EU-Abruf                                                                                                                                                                               | offen        |
| M6      | Zweites Primärsystem (Krankenhaus)                                                                                                                                                                                                  | offen        |
