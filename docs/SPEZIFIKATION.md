# Spezifikation der Demo

**Stand:** 30.09.2026 · wird mit jeder Änderung der Demo fortgeschrieben (Änderungsverlauf am Ende)

**Lesehinweise:** ⚠ = unbelegt, zu verifizieren · ▸ = Bewertung · ✦ = Vorschlag, nicht spezifiziert

Diese Datei ist die fachliche Beschreibung der Demo. Die Oberfläche erklärt sich nicht selbst in
Textblöcken; was eine Ansicht zeigt und warum, steht hier. Die öffentlichen Quellen mit Versionen
stehen in [QUELLEN.md](QUELLEN.md), die Architekturentscheidungen in
[entscheidungen/](entscheidungen/).

---

## 1 Zweck

Ein Praxisverwaltungssystem (PVS), das den Alltag einer hausärztlichen Praxis so weit nachbildet,
dass sich prüfen lässt, was eine ärztlich verantwortete Patient Summary kostet — gemessen an der
Dokumentation, die ohnehin stattfindet. Dazu gehört ein ePA-Simulator, der das Aktensystem nach
den veröffentlichten Spezifikationen der gematik nachbildet.

Die Demo zeigt den heutigen Stand und vier aufeinander aufbauende Weiterentwicklungen (ADR 0034):

| Ausbaustand             | Was er zeigt                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Release 3.1.3**       | Die ePA, wie sie spezifiziert ist: Dokumente über MHD, Medikation über den Medication Service, Befugnis über die eGK. Laborbefunde, Arzt- und Entlassbriefe liegen als PDF vor. Diagnosen und Allergien gibt es nur in Dokumenten. Standard der Demo. |
| **Weiterentwicklung 1** | Zusätzlich strukturierte Laborbefunde (Vorschau auf ePA 3.2, Fachkonzept dgLP) und die **Volltextsuche** über `_content`.                                                                                                                             |
| **Weiterentwicklung 2** | Zusätzlich ✦ **Arzt- und Entlassbriefe als FHIR-Dokument** nach dem Vorbild des HL7 Europe Hospital Discharge Report; ältere Briefe bleiben PDF (ADR 0033).                                                                                           |
| **Weiterentwicklung 3** | Zusätzlich ✦ die **Allergien- und Diagnosenliste** (Diagnose-Service, Abschnitt 6), die **Impfliste** (6.3) und die **Patient Summary** als Sicht auf diese Quellen (7).                                                                              |
| **Weiterentwicklung 4** | Zusätzlich ✦ der **Aktenlotse** (8).                                                                                                                                                                                                                  |

Umschaltbar über „Konfiguration" in der Kopfleiste (Betriebslage → Ausbaustand). Jede Stufe enthält die vorige.

**Zwei Betriebsarten.** Lokal läuft der Simulator als eigener Dienst. In der gehosteten Fassung
(GitHub Pages) läuft derselbe Simulator im Browser; Wege, Antworten und Aufrufprotokoll sind
gleich, der Bestand liegt im Speicher der Seite und beginnt bei jedem Laden neu (ADR 0025).

**Was die Demo nicht ist:** kein Medizinprodukt, kein Produktabbild, keine TI-Anbindung (kein
Konnektor, keine Karten, kein VSDM), keine echten Patientendaten und kein Importweg dafür, keine
amtlichen Kataloge.

---

## 2 Grundsätze

1. **Zwei Bestände, nie vermischt.** Praxissystem und ePA werden getrennt geführt. Jede Ansicht
   zeigt am farbigen Band oben, welchen Bestand sie zeigt. Ein Datensatz wechselt nur durch eine
   benannte Handlung („Übernehmen", „in die ePA", „in die Praxis").
2. **Die ePA ist ein fremdes System.** Sie öffnet sich als eigenes Fenster über der Kartei, nicht
   als Reiter. Ohne Antwort zeigt das ePA-Fenster nichts — auch nichts Veraltetes.
3. **Kein erfundener Weg.** Jeder Aufruf an die ePA folgt einem veröffentlichten Implementation
   Guide; das Aufrufprotokoll nennt die Grundlage je Aufruf. Was ein Vorschlag ist, liegt unter
   `/epa/vorschlag/…`, trägt ✦ und nutzt den Namensraum `https://example.org/demo-pvs/fhir/`.
4. **Die Oberfläche erklärt sich durch Benutzung.** Beschriftungen, Zustände und Marker statt
   Erklärtexten. Erläuterungen stehen in dieser Datei.
5. **Laborwerte nur aus Befunden.** Es gibt kein Eingabefeld für Laborwerte (ADR 0016).
6. **Der Karteitext erreicht die ePA nie.** Freie Notizen bleiben lokal; strukturierte Einträge
   erscheinen im Verlauf der Karteikarte aus ihrem Bestand.
7. **Die Patient Summary ist eine Sicht.** Sie wird bei jeder Abfrage aus den Diensten der ePA
   gebildet und nie selbst bearbeitet. Gepflegt wird in den Quellen (Abschnitt 7).

### 2.1 Feste Begriffe

| Gegenstand                                               | Begriff                                               |
| -------------------------------------------------------- | ----------------------------------------------------- |
| Gegenstand des Projekts                                  | **Patient Summary**                                   |
| Die elektronische Patientenakte                          | **ePA**                                               |
| Der lokale Bereich im Praxissystem                       | **Patientenkartei**                                   |
| Die beiden Bestände                                      | **Praxissystem** und **ePA**                          |
| Die zentralen Listen in der ePA (✦)                      | **Allergienliste**, **Diagnosenliste**, **Impfliste** |
| Das Recht, eine ePA zu lesen                             | **Befugnis**                                          |
| Lesenachweis beim Schreiben                              | **Chronologieeintrag** (`acknowledgedChronologyId`)   |
| Auswahl eines Listeneintrags für die Patient Summary (✦) | **Relevanz** / **markiert** (★)                       |
| Ein Kalendertag im Verlauf der Karteikarte               | **Besuch** (mit Termin oder Notiz) oder **Eingang**   |

### 2.2 UX-Grundsätze — eine Blaupause

Die Demo ist auch ein Vorschlag, wie ein Primärsystem die ePA gut bedienbar macht, ohne von der
Spezifikation abzuweichen. Die Grundsätze sind herstellerneutral formuliert; die letzte Spalte
nennt, wo sie in der Demo zu sehen sind. ▸ Sie sind als Anforderungsniveau gedacht, an dem sich
andere Systeme messen lassen können.

| #   | Grundsatz                                                 | Warum                                                                                             | In der Demo                                                                                                                                                                        |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Der Bestand ist immer sichtbar                            | Wer nicht weiß, ob er lokal oder in der ePA arbeitet, irrt über Vollständigkeit und Verantwortung | Bestandsband je Bereich; ePA in eigenem Fenster                                                                                                                                    |
| U2  | Ein fremdes System wird aufgerufen, nicht eingebettet     | Die ePA antwortet — oder nicht. Die Oberfläche soll das nicht verdecken                           | ePA-Fenster mit eigenem Kopf, Zugriffsmarker, Aufrufprotokoll                                                                                                                      |
| U3  | Nichts Veraltetes als aktuell zeigen                      | Eine stille Kopie wirkt vollständig und ist es nicht                                              | Fehlerlage ohne Aktendaten; Medikationsspiegel datiert                                                                                                                             |
| U4  | Ein Klick zur Übersicht                                   | Im Notfall und im Erstkontakt zählt Zeit                                                          | Knopf „Patient Summary" im Patientenkopf (Alt+P)                                                                                                                                   |
| U5  | Sicherheit bestimmt die Reihenfolge                       | Was schaden kann, gehört nach oben                                                                | Patient Summary: Allergien, Diagnosen, Medikation in der Hauptspalte                                                                                                               |
| U6  | Befund zuerst, Herkunft direkt darunter                   | Vertrauen braucht Quelle, Datum und Person — sie dürfen den Befund aber nicht verdrängen          | Herkunftszeile unter jedem Eintrag                                                                                                                                                 |
| U7  | Leer ist nicht gleich leer                                | „Keine Daten" und „ärztlich bestätigt nichts bekannt" sind verschiedene Aussagen                  | „Information nicht verfügbar" gegen „Keine bekannten Allergien"                                                                                                                    |
| U8  | Geführt und automatisch unterscheiden                     | Der Leser muss erkennen, ob jemand eine Angabe verantwortet                                       | Marker je Block: „Allergienliste · geführt", „Medikationsliste · automatisch"                                                                                                      |
| U9  | Die Übersicht ist eine Sicht, gepflegt wird an der Quelle | Keine Duplikate; jede Änderung an genau einer Stelle                                              | Sprünge „Zur Allergienübersicht", „Zum Medikationsplan" — keine Eingabe in der Patient Summary                                                                                     |
| U10 | Relevanz wird im regulären Vorgang ausgewählt             | Einen zweiten Dokumentationsschritt macht niemand                                                 | Kästchen „In der Liste führen", vorbelegt                                                                                                                                          |
| U11 | Ein Begriff, mehrere Codes                                | Terminologie gehört in den Hintergrund                                                            | Kodierservice: ICD-10-GM und SNOMED CT aus einem Suchbegriff                                                                                                                       |
| U12 | Ansehen und Übernehmen sind zwei Handlungen               | Einsicht ist keine Aneignung                                                                      | „Ansehen" ohne lokale Kopie, „Übernehmen" mit Zeitpunkt und Person                                                                                                                 |
| U13 | Konflikte sind eine Lage, kein Fehler                     | Bei gemeinsam geführten Listen ist 409 normal                                                     | Meldung in einem Satz, Stand neu geladen, Handlung wiederholbar                                                                                                                    |
| U14 | Warnungen nennen ihre Grundlage                           | Prüfbar statt behauptet                                                                           | AMTS: „Grundlage: Laborbefund … vom …"                                                                                                                                             |
| U15 | Leere Blöcke führen weiter                                | Wo kein Dienst eine Angabe liefert, liegt sie vielleicht in einem Dokument                        | „In Dokumenten suchen" bei Impfungen, Prozeduren, Implantaten                                                                                                                      |
| U16 | Erklärung in der Dokumentation, nicht im Bildschirm       | Erklärtexte lenken von der Handlung ab                                                            | ADR 0020                                                                                                                                                                           |
| U17 | Tastatur und Screenreader sind Baubedingung               | Barrierefreiheit lässt sich nicht nachrüsten                                                      | Regionen je Block, `aria-current`, `aria-pressed` am Schalter, Fokus auf das Sprungziel                                                                                            |
| U18 | Auswählen, ohne zu verstecken                             | Die Übersicht braucht eine Auswahl; die vollständige Liste darf dadurch nicht verschwinden        | Listen zeigen alle Einträge; die Patient Summary zeigt markierte und nennt die Zahl der übrigen mit Sprung in die Liste                                                            |
| U19 | Eine Bedeutung, eine Farbe                                | Was zusammengehört, muss man ohne Lesen erkennen                                                  | Violett und ★ nur für die Patient Summary: Schalter, markierte Einträge, Zähler, Knopf im Kopf                                                                                     |
| U20 | Die Vorbelegung trifft den Regelfall                      | Wer nichts ändern muss, hat keinen Aufwand                                                        | Relevanz vorbelegt für Dauerdiagnosen und jede Allergie; Akutdiagnosen bleiben unmarkiert                                                                                          |
| U21 | Zustand vor Inhalt                                        | Wer nicht weiß, ob es eine Akte gibt oder ob widersprochen wurde, deutet Leere falsch             | Ein Zugangszustand im Patientenkopf aus dem Information Service; Marker „Widerspruch Medikationsprozess"                                                                           |
| U22 | Jede Fernsicht trägt ihre Uhrzeit                         | Eine geladene Liste altert, ohne es zu zeigen                                                     | „Stand hh:mm:ss" und „↻ aktualisieren" an jeder Ansicht aus der ePA                                                                                                                |
| U23 | Verknüpfen statt abtippen                                 | Aufwand sinkt, wenn eine Handlung zwei Bestände pflegt                                            | „Rezept" am Planeintrag: Plan und Medikationsliste verknüpfen sich über den eMP-Identifier                                                                                         |
| U24 | Delegieren mit Verantwortung                              | Die MFA bereitet vor, die Ärztin entscheidet — beides muss sichtbar sein                          | Freigabe „freigegeben / mit Hinweis / gesperrt" mit Text; Signaturstapel mit Auswahl                                                                                               |
| U25 | Die Pflicht zum Hinweis ist ein Warnband, keine Fußnote   | Was der Spezifikation nach gemeldet werden muss, darf nicht übersehen werden                      | Mehrfachabgabe: Warnband über dem Plan und Marker am Eintrag                                                                                                                       |
| U26 | Der Weg in die ePA ist sichtbar                           | Wer etwas in die Akte bringt, soll es am Eintrag erkennen                                         | Karteikarte: ↓ aus der ePA, ↑ in der ePA, mit Filter                                                                                                                               |
| U27 | Neu ist, was ich noch nicht kenne                         | Wer eine Akte wieder öffnet, sucht das Fremde, nicht das Eigene                                   | Band „Seit dem letzten Aufruf …" und Marke **neu** / **geändert** in Patient Summary, Listen, Medikation und Dokumenten, nur für Änderungen anderer Einrichtungen (ADR 0027, 0030) |
| U28 | Verlauf in Besuchen                                       | Eine Praxis denkt in Kontakten, nicht in Datensätzen                                              | Karteikarte: ein Block je Tag, darin Notizen, strukturierte Einträge und Dokumente gruppiert; der heutige Termin sammelt, was entsteht (ADR 0028)                                  |
| U29 | Kompakt zuerst, Einzelheiten auf Klick                    | Eine Liste wird gelesen, bevor sie bearbeitet wird                                                | Diagnosen und Allergien: eine Zeile je Eintrag, aufklappbar auf beiden Seiten des Splitscreens (ADR 0029)                                                                          |
| U30 | Das Neueste oben, die Ordnung in der Hand der Praxis      | Beim Öffnen zählt, was zuletzt dazukam; gewichten will jede Praxis selbst                         | Voreinstellung nach Einstelldatum; umstellbar bis zur eigenen Reihenfolge durch Ziehen oder ↑ ↓                                                                                    |

---

## 3 Personen und Startbestand

Alle Personen, Einrichtungen und Befunde sind erfunden.

| Person              | Lage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Renate Hoffmann** | Neu in der Praxis, keine Befugnis bis zum Einlesen der eGK. Stationär im Klinikum Sonnenschein: Entlassbrief, fünf Verordnungen in der Medikationsliste, vier davon im Medikationsplan (Metformin nicht). Zwei Laborbefunde (März und August) mit fortschreitend eingeschränkter Nierenfunktion, ein kardiologischer Befundbericht. ✦ Das Klinikum hat drei Diagnosen und zwei Allergien in die Listen eingetragen, ✦ Die frühere Hausarztpraxis hat fünf Impfungen in die Impfliste eingetragen. |
| **Tobias Krüger**   | Befugnis bis 11.10.2026. Keine Dokumente, leere Listen. Widerspruch gegen den Medikationsprozess: Medikationsliste und -plan sind für die Praxis gesperrt, E-Rezepte gelangen trotzdem in die Akte.                                                                                                                                                                                                                                                                                               |
| **Meral Yildiz**    | Befugnis bis 29.09.2026. Laborbefund, Levothyroxin im Plan, zwei Dauerdiagnosen der Praxis in der Diagnosenliste. Im Oktober 2025 in der Praxis gegen Grippe geimpft; die Impfung steht nur in der Praxis.                                                                                                                                                                                                                                                                                        |
| **Lena Weber**      | Nur im Praxissystem: Das Aktensystem kennt keine Akte.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

▸ Der Bestand ist bewusst ungleich verteilt. Eine ePA, in der für alle etwas steht, verdeckt die
wichtigste Eigenschaft des heutigen Zustands.

Die Befugnisse des Startbestands haben feste Daten. Danach verlangt die ePA das Einlesen der eGK —
wie im Wirkbetrieb. Maßgeblich ist der Demo-Tag, 09.09.2026, mit der tatsächlichen Uhrzeit — für
Einträge, Zeitpunkte und das Ablaufen von Befugnissen, im Praxissystem wie im Simulator. So
veraltet der Startbestand nicht mit dem Kalender.

### 3.1 Beispielbestand und wozu er dient

Jedes Beispiel ist aufgenommen, um etwas zu zeigen. Neue Beispiele kommen nach und nach hinzu und
werden hier mit ihrem Zweck eingetragen.

| #   | Person               | Beispiel                                                                                                                                                                                                                                                                                                                                 | Release 3.1.3                                         | Weiterentwicklung                                                           | Wozu                                                                                                                                                                                                                                                        |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Hoffmann             | Entlassbrief, Klinikum Sonnenschein, 17.07.2026 — drei Seiten Fließtext mit acht Diagnosen, Anamnese, Befunden, Verlauf, Entlassmedikation und Empfehlungen                                                                                                                                                                              | PDF                                                   | ✦ FHIR nach dem Vorbild des HL7 Europe Hospital Discharge Report (ADR 0033) | Quelldokument der Listeneinträge des Klinikums (Herkunftszeile); im Release nur als PDF lesbar; strukturiert liefert er der Patient Summary drei Prozeduren und das Implantat, im automatischen Weg dazu sieben aktive Diagnosen — ungefiltert              |
| B2  | Hoffmann             | Laborbefund, Laborgemeinschaft Nordwest, 12.08.2026                                                                                                                                                                                                                                                                                      | PDF                                                   | FHIR nach dgLP                                                              | eGFR 38: AMTS-Warnung bei Metformin erst nach Übernahme des strukturierten Befunds; jüngster Wert in der Patient Summary                                                                                                                                    |
| B3  | Hoffmann             | Laborbefund, MVZ Labor Oldenburg, 18.03.2026                                                                                                                                                                                                                                                                                             | PDF                                                   | FHIR nach dgLP                                                              | Verlauf im Kumulativbefund (eGFR 46 → 38); die Patient Summary zeigt nur den jüngeren Wert; als PDF gibt es keinen Verlauf                                                                                                                                  |
| B4  | Hoffmann             | Befundbericht Kardiologie, 03.06.2026 (eArztbrief: in der Akte das PDF/A)                                                                                                                                                                                                                                                                | PDF                                                   | unverändert (älterer Brief)                                                 | Ohne strukturierte Einträge: Die Echokardiographie steht nur im Text. Die Volltextsuche findet sie, die Patient Summary nicht                                                                                                                               |
| B5  | Hoffmann             | Fünf Verordnungen, vier im Medikationsplan                                                                                                                                                                                                                                                                                               | Medication Service                                    | ebenso                                                                      | Plan gegen Liste: Metformin ist verordnet, aber nicht im Plan. Die automatisch gebildete Patient Summary zeigt fünf, die geführte vier                                                                                                                      |
| B19 | Hoffmann             | Vorbefund Kardiologie, eingescannt, 11.04.2019                                                                                                                                                                                                                                                                                           | PDF ohne Textebene                                    | unverändert                                                                 | Trägt keinen Inhalt, den ein Dienst lesen könnte — weder die Volltextsuche noch der ✦ Aktenlotse. Erscheint in dessen Umfangsangabe als übergangene Quelle („6 von 7 Unterlagen gelesen“). Macht sichtbar, dass eine Antwort nie den ganzen Bestand abdeckt |
| B20 | Hoffmann             | Entlassbrief, Kreisklinikum Weserbogen, 05.04.2019 (Schrittmacherimplantation)                                                                                                                                                                                                                                                           | PDF                                                   | unverändert (älterer Brief)                                                 | Älterer Brief bleibt PDF, auch wenn neue strukturiert sind. Führt „Allergien sind nicht bekannt" — der Stand von 2019 neben dem von 2026                                                                                                                    |
| B6  | Hoffmann             | ✦ Listeneinträge des Klinikums: vier Diagnosen, zwei Allergien                                                                                                                                                                                                                                                                           | —                                                     | Diagnose-Service                                                            | Splitscreen mit Abgleich (E11.74 gegen E11.90, Penicillin gegen Amoxicillin). Markiert sind Vorhofflimmern, Diabetes und beide Allergien; die behobene Harnwegsinfektion ist nicht markiert                                                                 |
| B7  | Krüger               | nichts                                                                                                                                                                                                                                                                                                                                   | —                                                     | —                                                                           | Der Regelfall: leere ePA, Patient Summary ohne einen gefüllten Abschnitt                                                                                                                                                                                    |
| B8  | Yildiz               | Laborbefund, 02.07.2026, vom Labor und in der ePA                                                                                                                                                                                                                                                                                        | PDF                                                   | FHIR nach dgLP                                                              | Doppeleingang: derselbe Befund auf zwei Wegen wird als einer erkannt                                                                                                                                                                                        |
| B9  | Yildiz               | Levothyroxin im Plan; zwei markierte Dauerdiagnosen in der Liste; Freitext-Allergie nur in der Praxis                                                                                                                                                                                                                                    | Medication Service                                    | Diagnose-Service                                                            | Relevanzauswahl sichtbar: Die Allergie steht nicht in der Liste, also nicht in der Patient Summary; als Freitext bleibt sie ohne AMTS-Prüfung                                                                                                               |
| B10 | Hoffmann             | ✦ Obstipation, vom Klinikum in die Diagnosenliste eingetragen, aktuell, **nicht markiert**                                                                                                                                                                                                                                               | —                                                     | Diagnose-Service                                                            | Relevanz ist eine eigene Entscheidung: aktuell, aber nicht wichtig für die Übersicht. Steht in der Liste, nicht in der Patient Summary; dort „+ 2 weitere Einträge"                                                                                         |
| B11 | Krüger               | Widerspruch gegen den Medikationsprozess                                                                                                                                                                                                                                                                                                 | Information Service, Medication Service 423           | ebenso; Patient Summary `withheld`                                          | Zustand vor Inhalt: Der Kopf zeigt den Widerspruch, das Medikationsmodul „gesperrt" statt „keine Medikation". Ein E-Rezept für das Asthmaspray gelangt in die Akte, bleibt für die Praxis aber unsichtbar                                                   |
| B12 | Weber                | keine Akte                                                                                                                                                                                                                                                                                                                               | Information Service 404                               | ebenso                                                                      | „keine ePA" im Kopf; „ePA öffnen" gesperrt; E-Rezepte werden ausgestellt, aber nicht übertragen                                                                                                                                                             |
| B13 | Hoffmann             | Ramipril 5 mg aus dem Plan verordnen, Abgabe mit Austausch (2,5 mg)                                                                                                                                                                                                                                                                      | Medication Service, E-Rezept-Fachdienst (Demo-Ersatz) | ebenso                                                                      | Verknüpfung über den eMP-Identifier; nach dem Austausch zeigt der Planeintrag 2,5 mg und die verdoppelte Dosierung 2-0-0-0                                                                                                                                  |
| B14 | Hoffmann             | Apixaban verordnen, Abgabe als zwei Arzneimittel                                                                                                                                                                                                                                                                                         | ebenso                                                | ebenso                                                                      | Pflichthinweis: Der Plan wird nicht automatisch angepasst; Warnband und Marker am Eintrag                                                                                                                                                                   |
| B15 | Hoffmann             | Metformin aus der Medikationsliste erneut verordnen, „auch in den Medikationsplan"                                                                                                                                                                                                                                                       | ebenso                                                | ebenso                                                                      | Die Lücke aus B5 schließt sich mit der Verordnung: Planeintrag und Rezept in einem Schritt                                                                                                                                                                  |
| B16 | Hoffmann             | ✦ Fünf Impfungen in der Impfliste: Td (2019), Pneumokokken (2024), Herpes zoster (2025), Grippe und COVID-19 (Oktober 2025) — von der früheren Hausarztpraxis                                                                                                                                                                            | —                                                     | Weiterentwicklung 2: Impfliste                                              | Block „Impfungen" der Patient Summary füllt sich aus der Liste, ohne Relevanzauswahl; „Weiterentwicklung 1" zeigt denselben Block leer. Die Zoster-Serie hat nur die erste Dosis — sichtbar an der Dosisnummer                                              |
| B17 | Yildiz               | Grippeimpfung der Praxis vom 15.10.2025, noch nicht in der ePA                                                                                                                                                                                                                                                                           | —                                                     | Weiterentwicklung 2: Impfliste                                              | „in die ePA →" mit Lesenachweis; in der Karteikarte steht die Impfung im Besuchsblock vom 15.10.2025 und trägt danach ↑ in der ePA                                                                                                                          |
| B18 | jede Person mit Akte | „andere Einrichtung trägt ein" (Demo-Steuerung): eine kardiologische Praxis stellt einen Kontrollbefund ein, verordnet Torasemid und nimmt es in den Plan, ändert die Dosierung von Bisoprolol; ab Weiterentwicklung 1 trägt sie eine Herzinsuffizienz in die Diagnosenliste ein, ab 2 eine Apotheke eine Grippeimpfung in die Impfliste | Dokument, Medikation                                  | ebenso, dazu Listen                                                         | Band „Seit dem letzten Aufruf" und Marken **neu**/**geändert**: in Medikation und Dokumenten über die spezifizierte Abfrage, in Patient Summary und Listen über den Vergleich im Primärsystem; entfallene Planeinträge mit Namen                            |

---

## 4 Die Oberfläche

### 4.1 Patientenkartei

| Bereich                     | Bestand      | Was er zeigt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Karteikarte**             | Praxissystem | Verlauf **je Besuch** (ADR 0028): ein Block je Kalendertag, darin gruppiert Notizen, Diagnosen, Allergien, Impfungen, Medikationsplan, Rezepte, Labor und Dokumente. Kopf mit Datum, Termin, dokumentierenden Personen und der Zahl der Einträge aus und in die ePA. Ein Tag mit Termin oder eigener Notiz ist ein **Besuch**, sonst ein **Eingang**. Der heutige Termin erscheint als Block, bevor etwas dokumentiert ist, und sammelt, was während des Besuchs entsteht. Kennzeichen **↓ aus der ePA** und **↑ in der ePA**, Filter nach Art und „ePA". Diagnosen, Allergien, Impfungen, Medikation und Laborwerte werden hier nicht als Text erfasst. |
| **Diagnosen und Allergien** | beide        | Splitscreen gegen die Listen der ePA (✦, Abschnitt 6); kompakte Zeilen, aufklappbar, geordnet nach Einstelldatum oder nach Wahl der Praxis (6.1); an jedem Listeneintrag der Schalter ★ „Patient Summary", markierte Einträge violett.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Impfungen**               | beide        | ✦ Splitscreen gegen die Impfliste der ePA (Abschnitt 6.3): Impfungen der Praxis mit „in die ePA", Einträge der Liste mit „in die Praxis". Erfassung über den Impfstoffkatalog. Ohne Impfliste nur die Praxisseite.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Medikation**              | beide        | Medikationsplan und Medikationsliste der ePA, mit AMTS-Prüfung (Abschnitt 5.3). „Rezept" am Planeintrag und an Verordnungen der Liste, Karte **E-Rezepte** mit Stand in der ePA (Abschnitt 5.8). Am Planeintrag letzte Verordnung und Abgabe; bei mehreren abgegebenen Arzneimitteln ein Warnband. Was andere Einrichtungen seit dem letzten Aufruf geändert haben, steht als Band über Plan und Liste (7.7).                                                                                                                                                                                                                                            |
| **Labor**                   | Praxissystem | Übernommene strukturierte Laborbefunde und Kumulativbefund. Werte entstehen nur aus Befunden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Dokumente**               | beide        | Dokumente in der ePA neben der Praxisablage. „Ansehen" lädt aus der ePA ohne lokale Kopie; erst „Übernehmen" legt das Dokument mit Zeitpunkt und Person in der Praxisablage ab. Seit dem letzten Aufruf eingestellte Dokumente anderer Einrichtungen tragen die Marke **neu** (7.7).                                                                                                                                                                                                                                                                                                                                                                     |
| **Abrechnung**              | Praxissystem | EBM-Auszug mit einfacher Prüfung. Abrechnungsdaten gelangen nicht in die ePA. Die Prüfung bildet wenige Regeln ab und ersetzt keine Abrechnungsprüfung.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Stammdaten**              | Praxissystem | Versichertendaten stammen von der Gesundheitskarte, nicht aus der ePA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Im Patientenkopf stehen der **Zugangszustand**, **eGK einlesen**, ✦ **Patient Summary** (nur,
wenn das Aktensystem sie anbietet und die Akte nutzbar ist) und **ePA öffnen** (gesperrt ohne
Akte). Der Zugangszustand entsteht aus dem Information Service und der eigenen Befugnis
(ADR 0023):

| Zustand                                            | Anzeige                    |
| -------------------------------------------------- | -------------------------- |
| Akte nicht vorhanden (404 `noHealthRecord`)        | keine ePA                  |
| Akte vorübergehend gesperrt (409 `statusMismatch`) | ePA vorübergehend gesperrt |
| Aktensystem antwortet nicht                        | ePA nicht erreichbar       |
| Akte vorhanden, keine Befugnis                     | keine ePA-Befugnis         |
| Akte vorhanden, Befugnis                           | ePA-Befugnis bis …         |

Daneben, wenn zutreffend, **Widerspruch Medikationsprozess**.

**Rezepte** in der Kopfleiste zeigt den Signaturstapel der Praxis mit der Zahl der
vorbereiteten E-Rezepte (Abschnitt 5.8).

Jede Ansicht aus der ePA nennt **„Stand hh:mm:ss"** mit **„↻ aktualisieren"**.

### 4.2 ePA-Fenster

| Reiter                        | Inhalt                                                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patient Summary** ✦         | Sicht aus den Diensten der ePA (Abschnitt 7); erster Reiter, wenn angeboten.                                                                                                                                                                                                       |
| **Übersicht**                 | Kacheln zur Patient Summary, zu Dokumenten, Medikationsplan, ✦ Listen, Laborbefunden und strukturierten Dokumenten; Zugriffsdaten (`x-insurantid`, `x-useragent`, Telematik-ID der Einrichtung, Befugnis).                                                                         |
| **Dokumente**                 | Ergebnis von ITI-67 mit Klasse, Typ, formatCode und MIME-Typ; **Volltextsuche** über `_content`. „ohne formatCode" heißt: Der Dokumenttyp ist im Release 3.1.3 nicht registriert.                                                                                                  |
| **Medikation**                | Lesesicht auf Plan und Liste; „Bearbeiten" springt in die Medikation der Kartei.                                                                                                                                                                                                   |
| **Diagnosen und Allergien** ✦ | Lesesicht auf die vollständigen Listen in kompakten Zeilen, aufklappbar mit Herkunftszeile; dieselbe Ordnung wie im Splitscreen; markierte Einträge violett mit ★; nur, wenn das Aktensystem den Diagnose-Service anbietet.                                                        |
| **Laborbefunde**              | Dokumente vom Typ „Ergebnisse Diagnostik". Im Release 3.1.3 als PDF (Anzeige im Fenster), ab Weiterentwicklung 1 als strukturierter Befund.                                                                                                                                        |
| **Inhalte aus Dokumenten**    | Diagnosen, Allergien, Laborwerte, Prozeduren und Implantate, die das Praxissystem selbst aus strukturierten Dokumenten liest. Das Release kennt keine Einzelabfrage; das Praxissystem ruft jedes strukturierte Dokument ab (ITI-68) und zerlegt es. PDF und XML tragen nichts bei. |

▸ Die letzte Ansicht zeigt die Last, die im Release 3.1.3 bei jedem Primärsystem liegt, und ist
damit ein Argument für zentrale Listen.

### 4.3 Aufrufprotokoll und Demo-Steuerung

„Konfiguration" in der Kopfleiste öffnet ein Seitenfenster mit der Demo-Steuerung und jedem Aufruf an die ePA: Methode, Pfad, Status, Dauer, Ergebnis
und die **Spezifikationsgrundlage**; aufgeklappt Kopfzeilen und Körper. Darin die Demo-Steuerung:

| Schalter                                | Wirkung                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ausbaustand                             | Release 3.1.3, Weiterentwicklung 1 bis 4 (Abschnitt 1)                                                                                                                                                                                                                                    |
| Befugnisse entziehen                    | wie nach Ablauf der 90 Tage; der nächste Abruf antwortet 403 `notEntitled`, die Anzeige im Kopf berichtigt sich                                                                                                                                                                           |
| Andere Einrichtung ändert zwischendurch | Vor dem nächsten Schreibzugriff legt eine andere Einrichtung einen neuen Chronologieeintrag an. Der Schreibzugriff scheitert mit 409, das PVS lädt neu.                                                                                                                                   |
| Patient Summary aus                     | ✦ geführten Listen oder nur automatischen Daten (Abschnitt 7.5)                                                                                                                                                                                                                           |
| Antwortzeit                             | bis 4 s                                                                                                                                                                                                                                                                                   |
| E-Rezept → ePA                          | sofort, nach 3 s (Standard) oder 10 s — so lange braucht der Fachdienst, bis Verschreibung oder Abgabe in der Medikationsliste stehen                                                                                                                                                     |
| Akten                                   | je Akte „gesperrt" (409 `statusMismatch`) und „Widerspruch Medikation" (423 `locked`)                                                                                                                                                                                                     |
| Andere Einrichtung trägt ein            | je Akte, in jedem Ausbaustand: eine kardiologische Praxis stellt einen Befund ein und ändert den Medikationsplan; ab Weiterentwicklung 2 als strukturierter Brief (✦), ab 3 dazu eine Diagnose und eine Impfung der Apotheke (✦) — um „Seit dem letzten Aufruf" zu zeigen (Abschnitt 7.7) |
| Apotheke                                | je einlösbarem E-Rezept „abgeben", „mit Austausch", „zwei Arzneimittel"; nach der Abgabe „Abgabe stornieren"                                                                                                                                                                              |
| ePA-Bestand zurücksetzen                | Startbestand und Standard-Betriebslage                                                                                                                                                                                                                                                    |

---

## 5 Der ePA-Simulator

### 5.1 Adressierung und Kopfzeilen

| Kopfzeile                   | Verwendung                                                                                                                                                                                                         | Grundlage                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `x-insurantid`              | adressiert die Akte; ohne sie 400 `malformedRequest`, ohne Akte 404 `noHealthRecord`                                                                                                                               | OpenAPI ePA-Basic 3.1.3      |
| `x-useragent`               | `ClientId/Version`; ohne gültigen Wert 400 `malformedRequest`                                                                                                                                                      | OpenAPI ePA-Basic 3.1.3      |
| `X-Request-ID`              | vom Client je Anfrage, vom Dienst zurückgegeben                                                                                                                                                                    | OpenAPI; CapabilityStatement |
| `X-Requesting-Organization` | Base64-kodierte Organization nach `TIOrganization`, max. 8 KB; Pflicht an den FHIR Data Services. 431 bei Überlänge, 422 bei Profilfehler, 403 `SVC_IDENTITY_MISMATCH` bei anderer Telematik-ID als in der Sitzung | IG `de.gematik.epa` 1.3.2    |
| `x-demo-sitzung`            | ⚠ Demo-Ersatz für Anmeldung (ID-Token, VAU): trägt die Telematik-ID. Keine ePA-Schnittstelle.                                                                                                                      | —                            |

⚠ Wie der Dienst auf einen **fehlenden** `X-Requesting-Organization` antwortet, legt der IG nicht
fest; die Demo antwortet wie bei einem Profilfehler (422).

Prüfreihenfolge je Anfrage: Useragent → Sitzung → Akte → Befugnis → Fachdienst.

### 5.2 Befugnis

| Regel                                                                            | Grundlage                                |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| Beim Einlesen der eGK registriert das PVS eine Befugnis mit dem Prüfungsnachweis | Konzept 3.1.3, Befugnismanagement        |
| `POST /epa/basic/api/v1/ps/entitlements` (`setEntitlementPs`) mit `{jwt}`        | OpenAPI `I_Entitlement_Management` 1.8.0 |
| 90 Tage; 3 Tage für Apotheken, ÖGD, Arbeits- und Betriebsmedizin                 | Konzept 3.1.3                            |
| `validTo` = Tag des Erteilens + Dauer − 1, 23:59:59 deutscher Zeit               | OpenAPI, Beispiele als Test              |
| Ohne gültige Befugnis 403 `notEntitled` an jedem Fachdienst                      | OpenAPI der Fachdienste                  |

⚠ Demo-Ersatz: Der Prüfungsnachweis ist ein kleines JSON statt der VSDM-Prüfziffer, das JWT ist
nicht signiert. PoPP (`setEntitlementPsV2`) ist nicht nachgebildet.

### 5.3 Medication Service (IG `de.gematik.epa.medication` 1.3.5)

Basis `/epa/medication/api/v1/fhir`.

| Operation                                                | Wirkung                                                                                                                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET $medication-list`                                   | Medikationsliste: MedicationStatements mit Medication, Verordnung, Abgabe, Provenance als Einschluss; Filter nach Datum                                                                                   |
| `GET $medication-plan`                                   | Medikationsplan als Bundle `collection`: Patient, aktueller Chronologieeintrag, EMP-MedicationRequests (`intent = plan`), Medications, verknüpfte MedicationStatements, Änderungseinträge, Organisationen |
| `GET $medication-plan-log`                               | Chronologie des Plans, neueste zuerst (`_count`, `_offset`)                                                                                                                                               |
| `POST $add-emp-entry`                                    | Planeintrag anlegen — mit neuer Medication oder Verweis auf eine vorhandene                                                                                                                               |
| `POST $update-emp-entry`                                 | Planeintrag ändern, auch Status: `active`, `on-hold`, `completed`, `stopped`, `entered-in-error`                                                                                                          |
| `POST $batch-emp`                                        | mehrere Änderungen atomar, abgeschlossen mit `$emp-commit` (einzeln 405)                                                                                                                                  |
| `POST MedicationStatement/$add-eml-entry`                | Nachtrag in der Medikationsliste (Kontext `MANUAL`)                                                                                                                                                       |
| `POST MedicationStatement/{id}/$cancel-eml-entry`        | Nachtrag zurücknehmen — nur `MANUAL`                                                                                                                                                                      |
| `POST MedicationStatement/{id}/$link-emp`, `$unlink-emp` | Eintrag der Liste mit einem Planeintrag verknüpfen oder lösen                                                                                                                                             |
| Query API                                                | Suche und Lesen für Medication, MedicationRequest, MedicationDispense, MedicationStatement, Organization, Provenance                                                                                      |
| E-Rezept-Operationen                                     | `$provide-prescription-erp` und Verwandte: dem E-Rezept-Fachdienst vorbehalten; von außen 403. Der Fachdienst-Ersatz wendet sie intern an (Abschnitt 5.8)                                                 |
| Widerspruch gegen den Medikationsprozess                 | jeder Weg des Dienstes antwortet 423 `locked`; die Daten bleiben erhalten (Konzept 3.1.3, Consent Management)                                                                                             |

**Lesenachweis.** Jede Schreibung trägt `acknowledgedChronologyId` — die Kennung des
Chronologieeintrags (Provenance mit `is-emp-chronology-extension`), der beim Lesen galt. Ist er
nicht mehr aktuell, antwortet der Dienst 409 `CHRONOLOGY_ID_MISMATCH`; jede erfolgreiche Schreibung
legt einen neuen Chronologieeintrag an und gibt ihn als `relatedChronology` zurück. Jede Änderung
erzeugt einen Änderungseintrag nach `EPAActivityProvenance` und erhöht `meta.versionId`.

**Fachliche Prüfungen:** ATC nur mit Versionsangabe (422); Pflichtangaben des EMP-Eintrags
(`intent = plan`, `authoredOn`, `dosageInstruction`); Status aus dem erlaubten Wertebereich.

**Handlungen im PVS.**

| Handlung                                            | Operationen                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Eintrag der Liste in den Plan                       | `$add-emp-entry` (Verweis auf die Medication) → `$link-emp`                                                       |
| Neues Mittel in den Plan                            | `$add-emp-entry` mit neuer EMPMedication                                                                          |
| pausieren, fortsetzen, absetzen                     | `$update-emp-entry` mit neuem Status                                                                              |
| fehlerhaft                                          | `$update-emp-entry` mit `entered-in-error`, nach Rückfrage                                                        |
| Stand prüfen                                        | `$medication-plan-log?_count=1`, danach Plan und Liste neu — Abgaben ändern die Liste auch bei unverändertem Plan |
| Rezept aus dem Plan                                 | E-Rezept mit eMP-Identifier (Abschnitt 5.8); die Verknüpfung legt der Dienst an                                   |
| Rezept aus der Liste, „auch in den Medikationsplan" | `$add-emp-entry` → `$link-emp`, danach E-Rezept mit dem neuen eMP-Identifier                                      |

**Medikationsspiegel.** Das PVS hält den zuletzt abgeglichenen Plan vor. Das Band über dem Plan
zeigt „Abgeglichen" mit Zeitpunkt oder „Nicht abgeglichen" mit Grund. ▸ Bewusst anders als im
ePA-Fenster: Der Spiegel beantwortet „Was weiß ich über die Medikation?", das Fenster „Was steht
jetzt in der ePA?".

**AMTS-Prüfung.** Allergien der Praxis, Allergien aus übernommenen Dokumenten, Nierenfunktion aus
übernommenen Laborbefunden; ✦ ab Weiterentwicklung 3 zusätzlich die Allergienliste der ePA.
Ohne Nierenwert meldet die Prüfung das als eigenen Hinweis.

### 5.4 MHD Service (IG `de.gematik.epa.mhd` 1.1.3)

| Weg                                                                  | Wirkung                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /epa/mhd/api/v1/fhir/DocumentReference` (auch `POST …/_search`) | ITI-67: `status`, `type`, `category`, `_content` (Volltext). Antwort nach `EPADocumentSearchResultBundle`, Einträge nach `EPAMHDDocumentReference` |
| `GET /epa/mhd/retrieve/v1/content/{entryUUID}.{Endung}`              | ITI-68: das Dokument im MIME-Typ aus `attachment.contentType`, unverändert. 406 bei unpassendem `Accept`, 404 wenn nicht vorhanden                 |

Kennungen: `identifier` `official` = `urn:uuid:<entryUUID>`, `usual` = uniqueId als `urn:oid:`.
Einstellen läuft im Release über XDS ITI-41 (SOAP) und ist nicht nachgebildet.

**Dokumente im Startbestand.**

| Dokument              | Release 3.1.3           | Weiterentwicklung (ab Stufe)                                                                                              |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Arztbriefe (ambulant) | PDF, formatCode PDF/A-1 | ab 2: der Kontrollbefund der Demo-Steuerung ✦ strukturiert (FHIR), ohne formatCode; der Befundbericht vom Juni bleibt PDF |
| Entlassbriefe         | PDF, formatCode PDF/A-1 | ab 2: der Brief von 2026 ✦ strukturiert (FHIR), ohne formatCode; der von 2019 bleibt PDF                                  |
| Laborbefunde          | PDF, formatCode PDF/A-1 | ab 1: strukturiert nach dgLP (FHIR), ohne formatCode                                                                      |

Einzeln mit Zweck: Abschnitt 3.1. Das PVS zeigt PDF im Fenster und strukturierte Briefe Abschnitt
für Abschnitt mit Erzähltext, darunter je Abschnitt die strukturierten Einträge mit Code.

**Briefe (ADR 0033).** Im Release liegen Arzt- und Entlassbriefe als mehrseitige PDF mit Fließtext
vor, wie in der Versorgung. Der ambulante eArztbrief besteht nach der Richtlinie der KBV aus einem
PDF/A mit allen Inhalten und einem CDA-Teil, dessen `body` leer sein darf; in der Akte liegt das PDF.
⚠ Ob der CDA-Teil in die ePA gelangt, ist nicht geprüft; der formatCode für PDF/A-2 ist im Katalog
nicht belegt. ✦ Ab Weiterentwicklung 2 liegen **neue** Briefe zusätzlich als FHIR-Dokument vor:
`Composition.type` LOINC 34105-7 wie im HL7 Europe Hospital Discharge Report (CI-Build 1.0.0),
dazu SNOMED CT 373942005 wie im MIO KH-E 1.0.0; `encounter` 1..1; Abschnitte mit den LOINC-Codes
des HDR und den Überschriften des MIO, je mit Erzähltext und Einträgen. Laborwerte nur als Text —
strukturiert kommen sie aus dem Laborbefund. Ältere Briefe bleiben PDF.

⚠ Für den strukturierten Laborbefund ist im Release 3.1.3 kein formatCode registriert; die Demo
erfindet keinen.

### 5.5 Strukturierter Laborbefund (Vorschau ePA 3.2)

Nach dem Fachkonzept dgLP und dem Content-IG `de.gematik.epa.laboratory` 1.0.0-ballot.1:
Bundle `bundle-dglp`, Composition `composition-dglp`, DiagnosticReport `diagnostic-report-dglp` mit
`presentedForm` (PDF), Observations `observation-laboratory-study-dglp` und
`observation-laboratory-study-group-dglp`, Sortierung über die `sorting-number-extension` aus
TI Common 1.5.0-ballot.1. LOINC 2.82, SNOMED CT deutsche Edition 2026-05-15.

⚠ Die Demo nimmt an, dass das Labor die Befund-UUID als XDS-uniqueId verwendet; nur so erkennt
der Dokumentabgleich denselben Befund auf zwei Wegen (Labor und ePA).

### 5.6 Fehler- und Konfliktfälle

| Fall                              | Verhalten                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Keine Sitzung                     | 403 `invalAuth`                                                                 |
| Keine Akte                        | 404 `noHealthRecord`; der Kopf zeigt „keine ePA"                                |
| Akte vorübergehend gesperrt       | 409 `statusMismatch` an jedem Weg; der Kopf zeigt „ePA vorübergehend gesperrt"  |
| Widerspruch Medikationsprozess    | 423 `locked` am Medication Service; Patient Summary `withheld`                  |
| Keine Befugnis                    | 403 `notEntitled`; das PVS streicht seinen Eintrag und bietet „eGK einlesen" an |
| Veralteter Lesenachweis           | 409; das PVS lädt neu und bittet um Wiederholung                                |
| Organisation fehlerhaft           | 422 / 403 / 431 (Abschnitt 5.1)                                                 |
| Fachlich abgelehnt                | 422 mit Begründung                                                              |
| Dienst im Release nicht angeboten | 404 auf `metadata` des Diagnose-Service und der Patient Summary                 |
| Langsame Antwort                  | einstellbar                                                                     |
| Unbekannter Weg                   | 404 mit Verweis auf die Übersicht unter `GET /`                                 |

▸ In einer Fehlerlage zeigt das ePA-Fenster keine Aktendaten, auch keine veralteten.

### 5.7 Information Service (OpenAPI `I_Information_Service` 1.5.1)

Ohne Anmeldung und ohne Befugnis, mit `x-insurantid` und `x-useragent`.

| Weg                                                                              | Antwort                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /information/api/v1/ehr` (`getRecordStatus`)                                | 204 Akte nutzbar · 404 `noHealthRecord` · 409 `statusMismatch` (vorübergehend gesperrt)    |
| `GET /information/api/v1/ehr/consentdecisions` (`getConsentDecisionInformation`) | `{data: [{functionId: "medication", decision}, {functionId: "erp-submission", decision}]}` |

Widerspruch gegen das Einstellen durch den E-Rezept-Fachdienst (`erp-submission`) löscht die Daten
des Medikationsprozesses und setzt den Widerspruch gegen den Medikationsprozess mit (Konzept
3.1.3). ⚠ Den Anbieterwechsel bildet die Demo als `SUSPENDED` ab.

### 5.8 E-Rezept-Fachdienst (⚠ Demo-Ersatz nach gematik `api-erp`)

Kein Teil der ePA, sondern der Weg, auf dem Verschreibung und Abgabe in sie gelangen (ADR 0024).
Basis `/erp`, Sitzung wie bei der ePA.

| Weg                                                                                    | Wirkung                                                                                                                |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POST /erp/Task/$create` mit `workflowType` (Flowtype 160 oder 200)                    | 201 `Task` im Status `draft` mit Rezept-ID (`GEM_ERP_NS_PrescriptionId`, Prüfziffer ISO 7064 Mod 97-10) und AccessCode |
| `POST /erp/Task/{id}/$activate` mit `X-AccessCode`, Parameter `ePrescription` (Binary) | `ready`; reiht die Übertragung in die ePA ein                                                                          |
| `POST /erp/Task/{id}/$abort` mit `X-AccessCode`                                        | 204, `cancelled`; nur vor der Einlösung, sonst 403                                                                     |

⚠ Keine VAU, keine QES: Der Verordnungsdatensatz liegt unsigniert und Base64-kodiert im Binary.

**Verordnungsdatensatz** (vereinfacht nach `kbv.ita.erp` 1.4): Bundle mit Rezept-ID, Composition,
`MedicationRequest` mit strukturierter Dosierung (Viererschema als Tageszeiten, erster Eintrag mit
Text), Packungszahl, **eMP-Identifier unter `basedOn.identifier`**; Medication mit PZN und Normgröße;
Patient, Practitioner, Organization, Coverage. ⚠ Die ATC-Angabe am Arzneimittel ist ein Zusatz der
Demo; Pflichtangaben zu Zuzahlung, Unfall und Abgabehinweisen sind nur angedeutet.

**Zulieferung in den Medication Service**, asynchron (Verzögerung in der Demo-Steuerung):

| Ereignis                     | Wirkung in der ePA                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verschreibung                | `Medication` inactive, `MedicationRequest` active (Prozesskennung `Rezept-ID_Datum`, `basedOn` mit eMP-Identifier), `MedicationStatement` intended mit kopierter Dosierung; mit eMP-Identifier Verknüpfung mit dem Planeintrag, neue Fassung, neuer Chronologieeintrag |
| Abgabe                       | `MedicationDispense` completed je abgegebenem Arzneimittel, Verschreibung completed, Medikationsinformation `unknown`; bei **genau einem** Arzneimittel verweist der Planeintrag darauf (`originMedication` bleibt), bei Austausch mit geänderter Dosierung            |
| Abgabe mehrerer Arzneimittel | kein Planupdate — das PVS muss darauf hinweisen (IG 1.3.5, Allgemeine Grundsätze)                                                                                                                                                                                      |
| Löschen vor Einlösung        | alle Ressourcen der Prozesskennung `entered-in-error`, Verknüpfung gelöst; die Liste zeigt sie nicht mehr                                                                                                                                                              |
| Abgabe storniert             | Abgaben entfernt, Verschreibung active, Medikationsinformation intended; ⚠ Planeintrag zurück auf das ursprüngliche Arzneimittel                                                                                                                                       |

Vor jeder Übertragung prüft der Fachdienst die Akte: ohne Akte oder bei Widerspruch gegen das
Einstellen unterbleibt sie.

**Im PVS.** „Rezept" am Planeintrag, an Verordnungen der Medikationsliste und „neues E-Rezept"
aus dem Katalog öffnen ein Formular mit Dosierung, Packungen, Normgröße und **Reichweite** (⚠ je
Normgröße angenommen: N1 20, N2 50, N3 100 Stück). Steht das Mittel nicht im Plan, bietet es
„Auch in den Medikationsplan aufnehmen" an, vorbelegt, wenn der Plan geschrieben werden kann. Die
Ärztin signiert und sendet oder legt in den **Signaturstapel**; die MFA bereitet vor und setzt
**Freigabe** (freigegeben, mit Hinweis, gesperrt) mit Text, vorbelegt „mit Hinweis — nicht im
Medikationsplan", wenn das Mittel nicht im Plan steht. Die Seite **Rezepte** zeigt den Stapel der
Praxis; die Ärztin signiert die Auswahl in einem Schritt (⚠ Stapelsignatur als ein Schritt
abgebildet). Die Karte **E-Rezepte** nennt je Rezept den Stand aus der ePA: nicht gesendet,
Übertragung ausstehend (das Modul fragt nach), in der Medikationsliste, eingelöst mit den
abgegebenen Arzneimitteln, für die Praxis nicht sichtbar (Widerspruch oder ohne Befugnis),
gelöscht. Löschen ist bis zur Einlösung möglich.

---

## 6 ✦ Diagnose-Service für Allergien und Diagnosen

Ein Vorschlag für die Weiterentwicklung der ePA: ein zentraler Dienst, über den Primärsysteme
Allergien und Diagnosen einrichtungsübergreifend führen — nach dem Vorbild der österreichischen
e-Diagnose und mit der Mechanik des Medication Service. Aus diesen Listen soll später die Patient
Summary entstehen; sie selbst wird nie bearbeitet. **Nicht spezifiziert.**

Basis `/epa/vorschlag/diagnosis/api/v1/fhir`, ab Ausbaustand „Weiterentwicklung 3" (sonst 404).

| Operation                                               | Muster im Medication Service                           |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `GET metadata`                                          | CapabilityStatement                                    |
| `GET $condition-list`, `$allergy-list`                  | `$medication-plan`                                     |
| `GET $condition-list-log`, `$allergy-list-log`          | `$medication-plan-log`                                 |
| `POST $add-condition-entry`, `$add-allergy-entry`       | `$add-emp-entry`                                       |
| `POST $update-condition-entry`, `$update-allergy-entry` | `$update-emp-entry`                                    |
| `POST $flag-condition-entry`, `$flag-allergy-entry`     | eigene Operation (✦): Relevanz für die Patient Summary |

Parameter `conditionEntry` bzw. `allergyEntry` und `acknowledgedChronologyId`; Antwort mit
`entry`, `relatedActivity`, `relatedChronology`. Chronologieeinträge tragen
`https://example.org/demo-pvs/fhir/StructureDefinition/is-condition-list-chronology` bzw.
`…/is-allergy-list-chronology`.

**Regeln.** Lesenachweis und Organisation wie im Medication Service. Kodierung eines Eintrags
bleibt fest; SNOMED CT nur mit Version. Berichtigung über `verificationStatus = entered-in-error`
per `$update-…-entry` — durch jede befugte Einrichtung, sichtbar für alle. „Keine bekannte
Allergie" (SNOMED CT 716186003) ist eine ausdrückliche Angabe; eine später eingetragene Allergie
setzt sie außer Kraft. Profile: `ti-condition-diagnosis` (TI 1.5.0-ballot.1, abgeleitet von
`condition-eu-core`) und `allergyIntolerance-eu-core`.

**Relevanz für die Patient Summary (✦).** Jeder Eintrag der Listen kann als relevant markiert
sein — Extension `https://example.org/demo-pvs/fhir/StructureDefinition/ps-relevant`
(`valueBoolean`). Gesetzt wird sie beim Anlegen im Eintrag selbst oder danach über
`$flag-condition-entry` bzw. `$flag-allergy-entry` mit den Parametern `entry` (Reference),
`psRelevant` (boolean) und `acknowledgedChronologyId`. Das Markieren ist eine Schreibung wie jede
andere: Lesenachweis (sonst 409), Organisation, Änderungseintrag, neue Fassung, neuer
Chronologieeintrag. Die Markierung gilt einrichtungsübergreifend; die Liste bleibt vollständig.

### 6.1 Splitscreen im PVS

„Diagnosen und Allergien" zeigt je Block links die Einträge der Praxis, rechts die Liste der ePA,
dazwischen den Abgleich.

**Kompakte Zeilen (ADR 0029).** Je Eintrag eine Zeile: Bezeichnung, darunter ICD-10-GM, Dauer
oder Akut und Zeitraum bzw. Typ, Gewissheit und Kritikalität. Zugeklappt sichtbar bleiben Marke
**neu**, Schalter ★, Zustand, Einstelldatum und Handlungen. Ein Klick auf die Bezeichnung klappt
die Zeile auf beiden Seiten auf: SNOMED CT, Status, Sicherheit, Notiz, Herkunftszeile,
„bearbeiten", „berichtigen …". „alle aufklappen" öffnet die ganze Liste.

**Ordnung.** Voreingestellt nach dem Datum der Einstellung, der jüngste Eintrag zuerst — für
Einträge der ePA der erste Änderungseintrag, für Einträge nur der Praxis die Dokumentation.
Umstellbar über „Sortierung": älteste zuerst, Beginn, Bezeichnung, **eigene Reihenfolge**. Bei
eigener Reihenfolge lassen sich Zeilen ziehen oder mit ↑ ↓ verschieben; neue Einträge erscheinen
oben. Die Ordnung gilt je Person und Liste, auch in der Lesesicht des ePA-Fensters; sie bleibt im
Praxissystem und zählt nicht als Handlung.

| Zustand                           | Bedeutung                                        | Handlungen                                        |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| abgeglichen                       | verknüpft, gleiche Fassung, gleiche Kernangaben  | —                                                 |
| nur in der Praxis                 | kein Gegenstück in der Liste                     | **in die ePA →**                                  |
| nur in der ePA                    | etwa vom Klinikum eingetragen                    | **← in die Praxis** (verknüpft übernommen)        |
| gleicher Eintrag, nicht verknüpft | derselbe Begriff nach SNOMED CT, sonst ICD-10-GM | **verknüpfen**                                    |
| in der ePA geändert               | eine andere Einrichtung hat geändert             | **← ePA-Stand übernehmen** oder **Praxisstand →** |
| lokal geändert                    | Änderung der Praxis noch nicht in der ePA        | **Änderung → ePA** oder **← ePA-Stand**           |
| in der ePA berichtigt             | als fehlerhaft gekennzeichnet                    | **Verknüpfung lösen**                             |

Jeder Eintrag der Liste trägt aufgeklappt eine **Herkunftszeile**: Datum, Quelldokument oder Einrichtung,
erstellende Person, letzte Änderung. „berichtigen …" kennzeichnet einen Eintrag nach Rückfrage als
fehlerhaft.

**Hinweise im Abgleich:** andere ICD-10-GM bei gleicher Erkrankung nach SNOMED CT (E11.90 in der
Praxis, E11.74 in der ePA) und verwandte Substanzen (Amoxicillin in der Praxis, Penicillin in der
ePA).

**Relevanz markieren.** An jedem Eintrag der Liste steht der Schalter ★ „Patient Summary"
(`aria-pressed`), auch zugeklappt. Markierte Einträge sind violett hinterlegt; der Kopf des Blocks zählt sie
(„★ 2 in der Patient Summary"). Aufheben nimmt den Eintrag aus der Patient Summary, nicht aus der
Liste.

**In der Erfassung.** Das Kästchen „In der Diagnosenliste der ePA führen" bzw. „In der
Allergienliste der ePA führen" ist vorbelegt für Dauerdiagnosen und für jede Allergie. Darunter,
eingerückt und violett, **„Relevant für die Patient Summary"** — vorbelegt nach derselben Regel,
gesperrt, solange der Eintrag nicht in die Liste soll. Listenaufnahme und Relevanz sind damit
kein zweiter Dokumentationsschritt. Bei einem verknüpften Eintrag heißt
es „Änderung … übertragen", die Kodierung ist gesperrt. Ohne Befugnis oder im Release 3.1.3 ist es
gesperrt; darunter steht der Grund in einem Satz.

**Wie Einträge zusammenfinden.** Drei Stufen, nur die dritte braucht eine Entscheidung der Praxis:

| Stufe              | Woran                                                                                                                                                 | Grundlage                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Verknüpft        | Das Praxissystem merkt sich zum eigenen Eintrag Kennung und Fassung (`meta.versionId`) des Eintrags in der ePA — beim Einstellen oder beim Übernehmen | FHIR: logische Kennung, `read`/`vread`; in der Demo `epaId`, `epaFassung`                                                                                                                                   |
| 2 Wiedererkannt    | Eine eigene Kennung des Praxissystems am Eintrag (`identifier`), mit der Suche nach `identifier` auch nach einem Systemwechsel auffindbar             | Dokumente: `uniqueId` vergibt der Ersteller, Suche `identifier` (MHD 1.1.3). Medikation: Suche `identifier`; ⚠ ob ein eigener Wert beim Anlegen gesetzt werden darf, ist nicht geprüft. ✦ Listen: Vorschlag |
| 3 Gleicher Eintrag | gleiche Bedeutung ohne Verknüpfung: gleicher SNOMED-CT-Code, sonst gleiche ICD-10-GM; bei Allergien die Substanz                                      | Fachlogik des Praxissystems; keine Spezifikation                                                                                                                                                            |

Stufe 3 ist ein Vorschlag des Systems, nie eine automatische Verknüpfung: „verknüpfen" setzt
Stufe 1. Danach erkennt der Abgleich jede Abweichung an der Fassung — „in der ePA geändert" oder
„lokal geändert". In der Medikation entsteht die Verknüpfung ohne Abgleich, wenn aus dem Plan
verordnet wird: Der eMP-Identifier wandert mit dem E-Rezept (Abschnitt 5.8).

**„Keine bekannten Allergien".** Wo weder Praxis noch ePA eine Allergie führt, lässt sich die
ausdrückliche Angabe eintragen. ▸ Damit ist unterscheidbar: keine Angabe gegen die ärztlich
bestätigte Feststellung, dass nichts bekannt ist.

### 6.2 Offene Fragen des Vorschlags

Schreibrechte je Berufsgruppe ·
Benachrichtigung anderer Einrichtungen · Kodierservice als zentraler Dienst · ⚠ ob feste
Kodierung und Berichtigung durch jede Einrichtung für Diagnosen fachlich trägt.

---

### 6.3 ✦ Impfliste (Weiterentwicklung 3)

Eine dritte zentrale Liste mit derselben Mechanik wie Allergien und Diagnosen (ADR 0026). Basis
`/epa/vorschlag/immunization/api/v1/fhir`, ab Ausbaustand „Weiterentwicklung 3" (sonst 404).
**Nicht spezifiziert.**

| Operation                         | Muster                    |
| --------------------------------- | ------------------------- |
| `GET metadata`                    | CapabilityStatement       |
| `GET $immunization-list`          | `$condition-list`         |
| `GET $immunization-list-log`      | `$condition-list-log`     |
| `POST $add-immunization-entry`    | `$add-condition-entry`    |
| `POST $update-immunization-entry` | `$update-condition-entry` |

Parameter `immunizationEntry` und `acknowledgedChronologyId`; Chronologieeinträge tragen
`https://example.org/demo-pvs/fhir/StructureDefinition/is-immunization-list-chronology`. Einträge
nach `immunization-eu-core` (HL7 Europe): Impfstoff mit ATC, Zielkrankheiten als SNOMED CT,
Datum, Dosisnummer, Charge, impfende Person. Berichtigung über `status = entered-in-error`.

**Keine Relevanzmarkierung.** Für den Impfschutz zählt jede Dosis; die Patient Summary übernimmt
jede durchgeführte Impfung.

⚠ Offen: Verhältnis zum elektronischen Impfpass als Dokument; welche Impfungen aus Daten der
Kostenträger stammen dürfen und wie sie gekennzeichnet werden.

## 7 ✦ Patient Summary

Die Patient Summary ist eine **Sicht der ePA**: Sie wird bei jeder Abfrage aus den Diensten der
ePA gebildet, nicht gespeichert und nie selbst bearbeitet. Jeder Abschnitt nennt seine Quelle; wer
etwas ändern will, geht dorthin. So ist sie Teil der ePA und bleibt doch dort pflegbar, wo es
einen Dienst gibt. **Nicht spezifiziert.**

### 7.1 Zugang

- Knopf **Patient Summary** im Patientenkopf (Alt+P) — öffnet das ePA-Fenster auf diesem Reiter;
- erster Reiter im ePA-Fenster und Kachel in der Übersicht („5/8 Abschnitte mit Inhalt");
- nur, wenn das Aktensystem sie anbietet (CapabilityStatement), und nur mit Befugnis.

### 7.2 Aufbau

Acht Blöcke, in zwei Spalten: Allergien, Diagnosen und Medikation in der
Hauptspalte — was im Notfall zuerst zählt —, Laborwerte, Impfungen, Prozeduren, Implantate und
persönliche Erklärungen daneben.

| Block                   | EPS-Section (LOINC) | Pflicht in EPS | Quelle                                                                                                                                                              | Gepflegt über                    | Sprung                 |
| ----------------------- | ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------- |
| Allergien               | 48765-2             | ja             | ✦ Allergienliste: gültige, **markierte** Einträge; ohne Allergie in der Liste „keine bekannte Allergie". Nur aus automatischen Daten: strukturierte Dokumente (7.5) | Splitscreen in der Kartei        | Zur Allergienübersicht |
| Diagnosen               | 11450-4             | ja             | ✦ Diagnosenliste: gültige, **markierte** Einträge. Nur aus automatischen Daten: strukturierte Dokumente (7.5)                                                       | Splitscreen in der Kartei        | Zur Diagnosenübersicht |
| Medikation              | 10160-0             | ja             | Medikationsplan (aktiv, pausiert); ohne Plan die Medikationsliste                                                                                                   | Medikation in der Kartei         | Zum Medikationsplan    |
| Laborwerte              | 30954-2             | nein           | strukturierte Laborbefunde, je Untersuchung der jüngste Wert                                                                                                        | Labor (nur lesend, aus Befunden) | Zu den Laborwerten     |
| Impfungen               | 11369-6             | nein           | ✦ Impfliste: jede durchgeführte Impfung, die jüngste zuerst. Nur aus automatischen Daten: strukturierte Dokumente (7.5)                                             | Impfungen in der Kartei          | Zur Impfübersicht      |
| Prozeduren              | 47519-4             | ja             | ✦ strukturierte Dokumente: jede Prozedur, mit Quelldokument (ADR 0031)                                                                                              | im Quelldokument                 | In Dokumenten suchen   |
| Implantate              | 46264-8             | ja             | ✦ strukturierte Dokumente: jedes Implantat (DeviceUseStatement mit Device), mit Quelldokument (ADR 0031)                                                            | im Quelldokument                 | In Dokumenten suchen   |
| Persönliche Erklärungen | 42348-3             | nein           | keine                                                                                                                                                               | —                                | In Dokumenten suchen   |

Jeder Block trägt einen Marker mit seiner Quelle und ob sie **geführt** (Listen, Plan — ärztlich
verantwortet) oder **automatisch** (Medikationsliste, Laborbefunde) ist. Jeder Eintrag aus einer
Liste trägt darunter seine Herkunft: Quelldokument oder Einrichtung, Datum, Person, letzte
Änderung. Laborwerte aus demselben Befund nennen die Quelle einmal.

Sind in einer Liste Einträge nicht markiert, nennt der Block ihre Zahl — „+ 2 weitere Einträge in
der Diagnosenliste, nicht markiert ↗" — und führt in die vollständige Liste. Der Kopf der Patient
Summary nennt, wann ein gezeigter Eintrag zuletzt geändert wurde.

### 7.3 Leerangaben

| Lage                                  | FHIR                                                                          | Anzeige                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Keine Quelle oder Quelle ohne Eintrag | `section.emptyReason` = `unavailable` (`list-empty-reason`)                   | „Information nicht verfügbar"                                           |
| Ärztlich bestätigt: keine Allergie    | Eintrag AllergyIntolerance mit SNOMED CT 716186003                            | „Keine bekannten Allergien" mit Herkunft, grün                          |
| Einträge vorhanden, keiner markiert   | `emptyReason` = `unavailable` und ✦ `ps-section-further-entries` mit der Zahl | „Kein Eintrag für die Patient Summary markiert" und Sprung in die Liste |

⚠ Welcher Leercode in welcher Lage zu verwenden ist (`unavailable`, `nilknown`, `notasked`), ist
national noch festzulegen. Die Demo verwendet `unavailable` für jede fehlende Angabe.

### 7.4 Dienst

`GET /epa/vorschlag/patient-summary/api/v1/fhir/Patient/$summary` — Operation nach dem Muster von
`$summary` (HL7 IPS), Akte über `x-insurantid`. Antwort:

- Bundle `document` nach `bundle-eu-eps`, Composition nach `composition-eu-eps` mit LOINC
  60591-5, Titel „Patient Summary", Autor: der Dienst (Device);
- je Block eine Section mit Code, erzeugtem Erzähltext, Einträgen oder `emptyReason`;
- ✦ Extension `https://example.org/demo-pvs/fhir/StructureDefinition/ps-section-source` mit der
  Quelle (`allergy-list`, `condition-list`, `immunization-list`, `medication-plan`,
  `medication-list`, `lab-documents`, `structured-documents`, `none`);
- ✦ Extension `…/ps-section-further-entries` (`valueInteger`): gültige Einträge der Quelle, die
  nicht markiert sind;
- die Einträge mit ihren Änderungseinträgen (Provenance) und Arzneimitteln; Laborwerte mit Verweis
  auf den Befund.

`GET …/metadata` liefert das CapabilityStatement; im Release 3.1.3 antwortet der Dienst mit 404.
⚠ Die Profile sind nachgebaut, nicht gegen die EPS validiert.

### 7.5 Geführt gegen automatisch

Die Demo-Steuerung „Patient Summary aus" stellt beide Wege nebeneinander. „Nur aus automatischen
Daten" bildet die Patient Summary so, wie sie ohne ärztliche Pflege entstünde: aus allem, was in der
Akte strukturiert vorliegt — Medikationsliste, Laborbefunde und die Einträge strukturierter
Dokumente (Allergien, Diagnosen, Impfungen, Prozeduren, Implantate). Übernommen wird, was das
Dokument angibt; widerlegte, irrtümliche, behobene und inaktive Einträge fallen weg, eine
Relevanzauswahl gibt es nicht (ADR 0031). Für Frau Hoffmann:

| Block                   | aus geführten Listen             | nur aus automatischen Daten                                                                                                            |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Allergien               | 2 — Penicillin, Kontrastmittel   | 2 aus dem Entlassbrief                                                                                                                 |
| Diagnosen               | 2 markierte (von 4 in der Liste) | 7 aktive aus dem Entlassbrief, ohne Auswahl — auch die Harnwegsinfektion, die bei Abfassung noch behandelt wurde und heute behoben ist |
| Medikation              | 4 aus dem Plan                   | 5 aus der Liste, auch das nicht verplante Metformin                                                                                    |
| Laborwerte              | 4                                | 4                                                                                                                                      |
| Impfungen               | 5 aus der Impfliste              | Information nicht verfügbar — kein Dokument enthält eine Impfung                                                                       |
| Prozeduren              | 3 aus dem Entlassbrief           | 3 aus dem Entlassbrief                                                                                                                 |
| Implantate              | 1 aus dem Entlassbrief           | 1 aus dem Entlassbrief                                                                                                                 |
| Persönliche Erklärungen | Information nicht verfügbar      | Information nicht verfügbar                                                                                                            |

▸ Gezählt füllt der automatische Weg fast so viel wie der geführte — sechs von acht Blöcken
gegen sieben. Der Unterschied liegt in der Güte: Diagnosen stehen mit dem Stand des Dokuments,
auch eine behobene Infektion als aktiv; nichts ist ausgewählt; die Medikation zeigt, was verordnet
wurde, nicht, was eingenommen werden soll; und was in keinem strukturierten Dokument steht, fehlt
ganz. Erst die geführten Listen machen aus einer Zusammenstellung eine verantwortete Übersicht.

### 7.6 Offene Fragen

- ⚠ **Gespeichertes Dokument für den Abruf aus dem Ausland.** Der NCPeH liest Dokumente, keine
  Sichten. Wann eine Fassung festgeschrieben wird und wer sie verantwortet, ist offen.
- ⚠ **Rechtliche Authentifizierung.** Das EHDS-Logikmodell (Xt-EHR 1.0.0) sieht für den Kopf der
  Patient Summary eine rechtliche Authentifizierung vor; eine automatisch zusammengestellte Sicht
  hat keine.
- **Umfang je Block:** nur aktuelle Diagnosen oder auch frühere Probleme; welche Laborwerte.
- **Prozeduren und Implantate aus unstrukturierten Briefen.** Die EPS erlaubt als Eintrag auch einen
  Verweis auf ein Dokument (`DocumentReference`). Ob ein eArztbrief ohne Einträge so in die
  Patient Summary gehört und wer das entscheidet, ist offen.
- **Persönliche Erklärungen** haben noch keine Quelle.

### 7.7 Neu seit dem letzten Aufruf

Die ePA benachrichtigt Leistungserbringer nicht: Push-Nachrichten sieht das Konzept 3.1.3 nur für
Versicherte über das ePA-FdV vor (Push Notification Management,
`I_Push_Notification_Management_Insurant`). Was sich seit dem letzten Aufruf geändert hat,
ermittelt deshalb das Primärsystem (ADR 0027):

1. Nach jedem Aufruf merkt es sich **je Person und Sicht** — Patient Summary, Diagnosenliste,
   Allergienliste, Impfliste — Kennung und `meta.versionId` jedes Eintrags und den Zeitpunkt.
2. Beim nächsten Aufruf vergleicht es: Kennung unbekannt → **neu**; Fassung höher →
   **geändert**; Kennung fehlt → **entfallen** (nur gezählt).
3. Gemeldet wird nur, was eine **andere Einrichtung** zuletzt geändert hat. Die Einrichtung steht
   im Änderungseintrag (Provenance, `agent.who.identifier`), den Listen und Patient Summary
   mitliefern.
4. Band über der Sicht „Seit dem letzten Aufruf am …: n neu · n geändert (andere Einrichtungen)",
   Marke **neu** oder **geändert** am Eintrag. Beim ersten Aufruf kein Band.

Das geht für die Patient Summary genauso wie für jede Liste, weil sie aus Einträgen der Dienste
besteht und deren Kennungen und Fassungen unverändert mitträgt.

**Was die ePA dafür heute schon bietet.** Für Dokumente und Medikation gibt es die Abfrage „seit"
bereits verbindlich (SHALL in den CapabilityStatements der Implementation Guides):

| Bestand           | Abfrage „seit dem letzten Aufruf"                                                                                                                                                                                 | Grundlage                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Dokumente         | ITI-67 `DocumentReference?_lastUpdated=gt…` oder `date=gt…`; `identifier` findet ein bekanntes Dokument wieder                                                                                                    | `de.gematik.epa.mhd` 1.1.3        |
| Medikationsplan   | Chronologieeinträge `Provenance?is-emp-chronology=true&recorded=gt…`, mit `agent-identifier` nach Einrichtung; den früheren Stand liefert `$medication-plan` zu einem Chronologieeintrag — daraus der Unterschied | `de.gematik.epa.medication` 1.3.5 |
| Medikationsliste  | `$medication-list` mit Parameter `date` (Unter- und Obergrenze)                                                                                                                                                   | ebd.                              |
| einzelne Einträge | `_lastUpdated` an jeder Suche, Versionsgeschichte über `_history` und `vread`                                                                                                                                     | ebd.                              |

Als Lesezeichen dient der Zeitpunkt des Aktensystems aus der letzten Antwort, nicht die Uhr der
Praxis. Für die ✦ Listen und die Patient Summary gibt es nichts Entsprechendes — sie sind nicht
spezifiziert. Der Vorschlag ist, dieselbe Mechanik zu übernehmen (Tabelle unten).

**So nutzt die Demo beide Wege (ADR 0030).** Medikation und Dokumente fragen mit den
spezifizierten Parametern ab; Patient Summary und ✦ Listen vergleichen im Primärsystem (oben).

| Ansicht          | Abfrage beim Öffnen                                                                                                                                               | Anzeige                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Medikationsplan  | Chronologieeinträge seit dem Lesezeichen; stammt einer von einer anderen Einrichtung, `$medication-plan` zum Chronologieeintrag des letzten Aufrufs und Vergleich | Band mit „n neu · n geändert · entfallen: Name", Marken am Eintrag, Einrichtung |
| Medikationsliste | `$medication-list?date=gt…`                                                                                                                                       | Band „n neu", Marke am Eintrag                                                  |
| Dokumentenablage | `DocumentReference?_lastUpdated=gt…`                                                                                                                              | Band „n Dokumente neu", Marke am Dokument                                       |

Lesezeichen ist je Person und Bestand der Zeitpunkt des Aktensystems aus der letzten Antwort
(`Bundle.meta.lastUpdated`), beim Plan dazu der Chronologieeintrag. Es gilt ab dem nächsten Öffnen
der Ansicht. Gemeldet wird nur, was andere Einrichtungen geändert haben.

▸ Grenzen des Wegs ohne Hilfe der ePA: Der Stand liegt im Primärsystem — ein anderer Arbeitsplatz
oder ein Systemwechsel beginnt ohne Vergleich. Entfallene Einträge lassen sich nur zählen, nicht
zeigen. Jede Sicht muss vollständig geladen werden, um ihre Änderungen zu kennen.

✦ Wege für die Listen und die Patient Summary (nicht spezifiziert; die ersten beiden nach dem
Vorbild des Medication Service):

| Weg                                       | Wie                                                                                                                     | Vorbild                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Parameter „seit" an den Listenoperationen | `$condition-list?_since=…` liefert nur Einträge mit Änderung danach, dazu entfallene als Kennung                        | `_since` der FHIR-History                                                          |
| Operation „Änderungen seit"               | Auszug aus dem Änderungsprotokoll (`…-list-log`) ab einem Chronologieeintrag, den das Primärsystem als Lesezeichen hält | Lesenachweis `acknowledgedChronologyId`                                            |
| Änderungsstand im Information Service     | je Akte und Liste der jüngste Chronologieeintrag — ein billiger Abruf vor der Tagesliste                                | Information Service                                                                |
| Benachrichtigung für Leistungserbringer   | Abonnement je Akte mit Befugnis, z. B. für die Termine des Tages                                                        | Push Notification Management der ePA — bisher nur für Versicherte über das ePA-FdV |

▸ Der dritte Weg reicht für eine Tagesübersicht „Neu seit dem letzten Besuch" (Abschnitt 10.1) und
belastet das Aktensystem am wenigsten.

---

## 8 ✦ Aktenlotse

**Nicht spezifiziert.** Ein Dienst der Telematikinfrastruktur, der Fragen an den Aktenbestand
beantwortet — für Versicherte und ihre Angehörigen in Alltagssprache, für Behandelnde
fachsprachlich. Dieselbe Grundlage, dieselben Belege, zwei Lesarten. Antwortet ab dem Ausbaustand
**„Weiterentwicklung 4"** (ADR 0032, 0034). Basis `/epa/vorschlag/aktenlotse/api/v1`.

Er ist **kein FHIR-Dienst**: Er bildet keine Ressource ab, sondern gibt Auskunft über vorhandene.

### 8.1 Vier Prinzipien

| Prinzip                            | Was es heißt                                                                                                                                                                                                                                                                      | Wo es steht                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Keine eigenen Rechte**           | Der Dienst sieht ausschließlich, was die fragende Seite ohnehin einsehen darf. Er hängt an derselben Prüfkette wie jeder andere ePA-Weg und liest nur die Akte aus `x-insurantid`, und dort nur, was im Ausbaustand sichtbar ist. Eine Auswertung über Akten hinweg gibt es nicht | `wege.ts`, `aktenlotse.ts` (`quellenFuer`) |
| **Die Daten bleiben drin**         | Auswertung im Dienst, kein Schreibweg, nichts wird gespeichert                                                                                                                                                                                                                    | `aktenlotse.ts`                            |
| **Jede Antwort nennt ihre Quelle** | Nicht als Zitat unter jedem Satz, sondern als Verweis auf die Unterlage — anklickbar, öffnet sie zum Nachlesen (`…/quelle/{id}`). Ein Absatz ohne Quelle entsteht nicht; die Antwortbildung kann keinen freien Text erzeugen                                                      | `kern/fachlogik/lotse.ts`                  |
| **Keine Bewertung**                | Keine Diagnose, keine Therapie, keine Triage, keine Prognose, kein Risikoscore. Der Dienst gibt wieder, was dasteht — auch eine Richtung („von 46 auf 38") —, ordnet sie aber nicht ein                                                                                           | ebd., und `metadata` nennt die Grenzen     |

Die Antwort steht in **zusammenhängenden Sätzen**, nicht in Stichpunkten oder Zitaten: „Sie waren
vom 12.07.2026 bis zum 18.07.2026 im Klinikum Sonnenschein. Festgehalten sind drei Diagnosen: …"
Darunter steht die Unterlage, in der es nachzulesen ist — einmal je Quelle, nicht unter jedem Satz.

⚠ Die Antworten entstehen **regelbasiert**, nicht mit einem Sprachmodell: aus Satzvorlagen über dem,
was in den Quellen steht. Geprüft werden soll der Umgang — Quellenangabe, Umfangsangabe,
Rechteerbung, Grenze zur Bewertung —, nicht die Sprachleistung. Ein echter Dienst bediente dieselbe
Schnittstelle mit einem Modell innerhalb der TI.

### 8.2 Wege

| Weg                      | Was er liefert                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET …/metadata`         | Fähigkeiten, Lesarten, Vorschlagsfragen und die Liste dessen, was der Dienst nicht tut                                                                |
| `POST …/frage`           | `{ frage, lesart }` → Absätze mit Fundstellen, Hinweis, Umfangsangabe, erläuterte Begriffe                                                            |
| `GET …/kontext?anlass=…` | Verlauf zum Anlass des Kontakts und auseinandergehende Angaben zwischen Dokument und Medikationsplan                                                  |
| `GET …/vorschlaege`      | Einträge, die eine strukturierte Liste aus unstrukturiertem Text aufnehmen könnte — als Vorschlag, mit Herkunft                                       |
| `GET …/quelle/{id}`      | Eine Unterlage öffnen und nachlesen — der Weg, auf den die Quellenangabe einer Antwort zeigt. Liefert nichts, was der Lotse nicht ohnehin gelesen hat |

Die Frage wird einer von fünf Absichten zugeordnet (Laborverlauf, Krankenhaus, Allergien,
Medikation, Stellensuche). Was keine davon trifft, beantwortet der Dienst als Stellensuche — und
sagt das in seinem Hinweis.

### 8.3 Umfangsangabe

Jede Antwort nennt, wie viele Quellen gelesen wurden und welche nicht, mit Grund.

▸ Das ist keine Fußnote. Die Belegpflicht fängt erfundene Aussagen ab; sie fängt nicht ab, dass eine
Antwort einen relevanten Befund **nicht** nennt und trotzdem vollständig wirkt. Auslassung ist das
größere Risiko als Erfindung. Der Startbestand führt dafür einen eingescannten Vorbefund ohne
Textebene: Für Frau Hoffmann lautet die Angabe „6 von 7 Unterlagen gelesen".

### 8.4 Zwei Lesarten

`fach` gibt den Text wieder wie im Dokument. `alltag` setzt die Umschreibung hinter den Fachbegriff —
der Fachbegriff bleibt stehen, damit wer ihn kennt weiterliest und wer ihn nachschlägt dasselbe Wort
im Originaldokument wiederfindet. Ersetzt wird nur an Wortgrenzen und ohne Überschneidung; der
längste Treffer gewinnt.

Glossar: `kern/kataloge/alltagssprache.ts`. ⚠ Auszug, eigene Formulierung, nicht gegen eine

Die Quellen einer Antwort sind die sichtbaren Dokumente **und der Medikationsplan**. Er ist kein
Dokument, aber die geführte Antwort auf „Welche Medikamente nehme ich und wofür?" — der Grund steht
nur dort (`reasonCode`).
Terminologie geprüft.

### 8.5 Zwei Sichten

**Praxissicht** — Reiter „Aktenlotse" der Patientenkartei. Der Lotse liefert vier verschiedene
Dinge; sie stehen deshalb in **aufklappbaren Abschnitten** und nicht nebeneinander:

| Abschnitt                     | Zustand                                       | Inhalt                                         |
| ----------------------------- | --------------------------------------------- | ---------------------------------------------- |
| **Zu klären**                 | offen, hervorgehoben, nur wenn etwas vorliegt | auseinandergehende Angaben, mit Zähler im Kopf |
| **Kontext · Anlass**          | offen, zunächst ein Satz                      | der Rest über „N weitere Angaben anzeigen"     |
| **Frage an die Akte**         | offen                                         | Fragefeld und Antwort                          |
| **Vorschläge für die Listen** | zu, mit Zähler                                | Extraktionsvorschläge zur Bestätigung          |

▸ Der Zähler im Kopf sagt ohne Aufklappen, ob sich das Öffnen lohnt. Offen ist, was
Handlungsbedarf trägt — in acht Minuten liest niemand eine Wand.

**Ohne Befugnis** steht dort nicht der Fehler der ePA, sondern der Weg aus ihm heraus: der Zustand
„keine Befugnis für diese Akte" und die Schaltfläche „eGK einlesen".

**Beide erscheinen erst im Ausbaustand „Weiterentwicklung 4"** — in der aktuellen Spezifikation gibt
es den Lotsen nicht, also auch keinen Reiter und keinen Navigationspunkt. In der Praxissicht führen
zwei Wege hin: der Reiter und eine Schaltfläche im Patientenkopf neben „Patient Summary".

**✦ Versichertensicht** — unter `/versicherte`, kein Teil des Praxissystems: Was dort zu sehen ist,
liefe im **Frontend des Versicherten** (FdV), der App der Krankenkasse. Die Demo zeigt es im selben
Fenster, weil der Entwurf erst nebeneinander verständlich wird.

Aufgebaut wie ein FdV: Die Akte besteht aus **Bereichen**, und der Einstieg ist die
**Dokumentenliste** — das, was eine versicherte Person heute vorfindet. Sie kommt über ITI-67, die
Dokumente über ITI-68, dargestellt mit demselben Betrachter wie im Praxissystem. Der ✦ Aktenlotse
ist **ein Bereich unter anderen**, gekennzeichnet als neu.

▸ Das ist eine fachliche Aussage und keine Gestaltungsfrage: Der Lotse tritt nicht an die Stelle
der Akte, er führt hinein. Jede Quellenangabe seiner Antworten öffnet das Dokument im Bereich
„Dokumente" — nicht in einem eigenen Fenster des Lotsen.

Im Bereich „Aktenlotse": Frage in Alltagssprache, Antwort mit Quellenangabe, Vorlesen über die
Sprachausgabe des Browsers, Umschaltung der Lesart.

Drei Berechtigungen sind umschaltbar: eigene Akte, Vertretung, **Vertretung entzogen**. Ohne
Vertretung bleibt **auch die Dokumentenliste leer** — der Lotse hält sich nicht zurück, er sieht
nichts, und die Akte zeigt ihm nichts. Das ist Prinzip 1, vorführbar.

### 8.6 Zweiter Zugangsweg im Simulator

Versicherte kommen nicht über die Befugnis einer Einrichtung an ihre Akte; die entsteht durch das
Stecken der eGK und gilt für eine Praxis. Der Simulator akzeptiert deshalb neben einer gültigen
Befugnis den ✦ Versichertenzugang über die Kopfzeile `x-demo-versicherte`, geprüft gegen
`x-insurantid`. Wer sich so meldet, kommt an genau eine Akte.

⚠ Demo-Ersatz für GesundheitsID und Vertretungsverwaltung. **Keine ePA-Schnittstelle.**

### 8.7 Was der Dienst nicht tut

Keine Triage und keine Dringlichkeitseinstufung · keine Diagnose- oder Therapievorschläge · keine
Prognosen und Risikoscores · kein selbsttätiges Schreiben in die Akte · keine Erstellung
meldepflichtiger oder abrechnungsrelevanter Angaben ohne menschliche Bestätigung · keine Auswertung
über Akten hinweg.

▸ Diese Liste ist kein Vorbehalt, sondern der Entwurf: Sie ist die Zweckbestimmung, und die
entscheidet über die regulatorische Einordnung.

## 9 Erfassung und Terminologie

**Diagnosen.** Gesucht wird ein Begriff, auch über Synonyme. Ein Kodierservice-Auszug (38 Begriffe,
nach dem Vorbild des zentralen Kodierservice in Österreich) hinterlegt ICD-10-GM und SNOMED CT in
einem Schritt. Wo er nichts kennt, bleibt die ICD-10-GM allein, sichtbar als „ohne SNOMED CT";
Altbestand lässt sich nachkodieren. Bei klinischem Status „Aktiv" gibt es nur einen Beginn.
⚠ Die Zuordnungen sind nicht gegen einen Terminologieserver geprüft; ungeprüfte sind markiert.

**Allergien.** Substanz und Manifestationen aus den veröffentlichten Wertelisten des Zentralen
Terminologieservers (197 und 37 SNOMED-CT-Konzepte), Expositionsweg aus den KBV-Basisprofilen (63). Freitext ist zulässig (Bindung _extensible_), bleibt aber ohne AMTS-Prüfung
und ohne europäischen Austausch. Eine gekennzeichnete Demo-Zuordnung verbindet 34 Substanzen mit
ATC-Codes für die AMTS-Prüfung; sie wird nie in eine FHIR-Ressource geschrieben.

**Impfungen (✦ Weiterentwicklung 3).** Impfstoff aus einem Katalogauszug (9 Impfstoffe, ATC real,
PZN fiktiv, ohne Handelsnamen); die Zielkrankheiten als SNOMED CT kommen aus dem Katalog.
Dazu Datum, Dosisnummer, Charge, impfende Person und Notiz. ⚠ Die Zielkrankheiten sind nicht gegen
einen Terminologieserver geprüft. Profil `immunization-eu-core`.

**Erfasste Angaben.**

| Diagnose                                                                                                                                                                                                                         | Allergie                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kategorie (Dauer-/Akutdiagnose), ICD-10-GM mit Diagnosesicherheit (G, V, Z, A) und Seite, SNOMED CT, klinischer Status, Zeitraum, Diagnosesicherheit, Schweregrad, Körperstelle, Feststellungsdatum, feststellende Person, Notiz | Typ, Substanz mit SNOMED CT, Wirkstoffkategorie, klinischer Status, Zeitraum, Gewissheit, Kritikalität, Reaktionen mit Manifestation, Schweregrad, Ereignisdatum und Expositionsweg, Notiz |

Nicht erfasst: Stadium, externe Referenzen, Orphanet- und Alpha-ID-Code; bei Allergien ASK- und
EMA-SPOR-Code und der zeitliche Verlauf der Reaktion. Dokumentationsdatum und dokumentierende
Person setzt das System.

Jede Maske hat eine aufklappbare **FHIR-Vorschau**: Condition nach `ti-condition-diagnosis`,
AllergyIntolerance nach `allergyIntolerance-eu-core`.

**Kataloge.** Auszüge mit Kopfzeile zu Herkunft und Einschränkung, nicht amtlich: ICD-10-GM
(68 Schlüssel), EBM (10 Ziffern, ohne Bewertung), Arzneimittel (46, ohne Handelsnamen, ATC mit
Version, PZN fiktiv), LOINC (18), Impfstoffe (9), registrierte Dokumenttypen (31, aus `gematik/ePA-XDS-Document`).

---

## 10 Grenzen

Nicht nachgebildet: Anmeldung am Aktensystem (ID-Token, VAU), Einstellen von Dokumenten (XDS
ITI-41), XDS ITI-18/43, Render API, Befugnisse durch die versicherte Person, Vertretungen,
Widerspruch gegen einzelne Dokumente, Protokollierung, QES und Signaturprüfung, VSDM, PoPP, NCPeH,
grenzüberschreitender Abruf, Profilvalidierung über die genannten Prüfungen hinaus, Paginierung
über `_count`/`_offset` des Plan-Logs hinaus. Vom E-Rezept-Fachdienst nur die Wege der
verordnenden Praxis (Abschnitt 5.8), keine Versicherten- und Apothekenschnittstellen, keine
weiteren Flowtypes, keine Mehrfachverordnung. Die Patient Summary wird nicht als Dokument
gespeichert; ein Abruf durch den NCPeH ist nicht nachgebildet (Abschnitt 7.6).

### 10.1 Ausblick: Verordnen und Praxisabläufe

Stand 29.09.2026: **umgesetzt** sind Verordnen aus dem Plan, Abgabe und Stornierung, der Hinweis
bei Mehrfachabgabe, Vorbereiten und gesammelt signieren sowie Zustand und Aktualität (Abschnitte
4.1, 5.7, 5.8). Offen:

| Erweiterung                          | Was sie zeigt                                                                                                                                                                                           | Grundlage                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Hochladen mit Metadaten              | Vorschau, Klasse und Typ vorbelegt nach Art des Karteieintrags, mehrere Dokumente zugleich, im Hintergrund; „auch in die ePA" beim Drucken oder Versenden eines Briefs; doppeltes Einstellen verhindert | IHE ITI-41, IG `de.gematik.epa`                  |
| Widerspruch gegen einzelne Dokumente | In der Praxis dokumentieren, dass die Person dem Einstellen eines Dokuments oder einer Dokumentart widersprochen hat; solche Dokumente werden nicht angeboten und in der Karteikarte gekennzeichnet     | § 347 ff. SGB V; Praxisablauf                    |
| Neu seit dem letzten Besuch          | Tagesübersicht und Kopf zeigen je Person, was in der ePA seit dem letzten Abruf neu ist; die Anmeldung kann vorab übernehmen. **Teilweise umgesetzt:** Vergleich je Sicht (Abschnitt 7.7)               | Praxisablauf                                     |
| Dokumentliste gruppieren und filtern | nach Klasse, Einstelldatum, einstellender Einrichtung, Übernahmestatus; Zeitraum; gemerkte Filter                                                                                                       | Praxisablauf; Metadaten nach IG `de.gematik.epa` |
| „in der ePA nicht mehr vorhanden"    | Kennzeichen für übernommene Dokumente, die in der Akte gelöscht oder verborgen wurden                                                                                                                   | Praxisablauf                                     |

▸ Leitgedanke: Aufwand sinkt nicht durch Sammeln allein, sondern durch **Verknüpfen** — wer aus
dem Plan verordnet, pflegt Plan und Liste in einem Schritt.

---

## 11 Vorführung

| Ablauf                                          | So geht es                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zugriff erst nach dem Einlesen                  | Frau Hoffmann → „ePA öffnen" → keine Befugnis → „eGK einlesen" → Befugnis bis …                                                                                                                                                                                                                                                                                        |
| Einträge des Klinikums abgleichen               | Frau Hoffmann, „Diagnosen und Allergien": Vorhofflimmern „← in die Praxis", Diabetes „verknüpfen"                                                                                                                                                                                                                                                                      |
| Eintrag der Liste in den Plan                   | Frau Hoffmann, „Medikation": Metformin „in den Plan" → AMTS-Hinweis zur Nierenfunktion → „übernehmen"                                                                                                                                                                                                                                                                  |
| Konflikt beim Schreiben                         | Konfiguration → „Andere Einrichtung ändert zwischendurch" → im Plan „pausieren" → 409, neu geladen → erneut „pausieren"                                                                                                                                                                                                                                                |
| Laborbefund als PDF und als FHIR                | Ausbaustand „Release 3.1.3" → ePA-Fenster, Laborbefunde → PDF; „Weiterentwicklung 1" → strukturierter Befund; dort auch die Volltextsuche, im Release fehlt das Suchfeld                                                                                                                                                                                               |
| Volltextsuche                                   | ePA-Fenster, Dokumente → „Kreatinin"                                                                                                                                                                                                                                                                                                                                   |
| ✦ Suche gegen Auskunft                          | ePA-Fenster, Dokumente → „Kreatinin“ findet zwei Dokumente. Dann Reiter „Aktenlotse“ → „Wie haben sich die Nierenwerte entwickelt?“ → eGFR 46 → 38 mit je zwei Belegen. Die Suche findet Dokumente, der Lotse beantwortet die Frage                                                                                                                                    |
| ✦ Lotse: Kontext und Widerspruch                | Frau Hoffmann nach dem Einlesen → Reiter „Aktenlotse“: Kontext zum Krankenhausaufenthalt, „4 von 5 Unterlagen gelesen“ mit dem eingescannten Vorbefund, und genau eine Abweichung — Metformin steht im Entlassbrief, nicht im Plan                                                                                                                                     |
| ✦ Lotse: Vorschläge für die Listen              | Derselbe Reiter, unten: Echokardiographie aus dem eArztbrief als Prozedur vorgeschlagen, mit Herkunft und Beleg → „Bestätigen“. Vorschlag, kein Eintrag                                                                                                                                                                                                                |
| ✦ Versichertensicht                             | Navigation „Versichertensicht“ → „Was stand im Brief vom Krankenhaus?“ → Antwort in Alltagssprache mit Belegen, „Vorlesen“, Umschaltung „Wie im Dokument“                                                                                                                                                                                                              |
| ✦ Keine eigenen Rechte                          | Versichertensicht → Rolle „Sabine Hoffmann — Tochter · Vertretung“: dieselbe Antwort. Dann „Vertretung entzogen“: „Keine Quellen · keine Antwort“ — der Lotse sieht die Akte nicht                                                                                                                                                                                     |
| Befugnis verloren                               | Konfiguration → „Befugnisse entziehen" → nächster Abruf 403                                                                                                                                                                                                                                                                                                            |
| Release 3.1.3                                   | Ausbaustand umschalten → die Listen verschwinden, der Splitscreen zeigt nur die Praxisseite                                                                                                                                                                                                                                                                            |
| Patient Summary in einem Klick                  | Frau Hoffmann nach dem Einlesen → „Patient Summary" im Kopf → sieben von acht Abschnitten mit Inhalt (ab Weiterentwicklung 3)                                                                                                                                                                                                                                          |
| Pflege an der Quelle                            | Patient Summary → „Zur Diagnosenübersicht" → Nierenkrankheit „in die ePA →" → Patient Summary zeigt drei Diagnosen                                                                                                                                                                                                                                                     |
| Geführt gegen automatisch                       | Konfiguration → „Patient Summary aus: nur automatischen Daten" → sechs von acht Abschnitten mit Inhalt; Diagnosen aus dem Entlassbrief, darunter die behobene Harnwegsinfektion als aktiv; Medikation fünf aus der Liste statt vier aus dem Plan                                                                                                                       |
| Relevanz markieren                              | „Diagnosen und Allergien" → Obstipation ★ „Patient Summary" → violett, Zähler 3 → Patient Summary zeigt sie, „+ 1 weiterer Eintrag"                                                                                                                                                                                                                                    |
| Auswahl ohne Verstecken                         | Patient Summary → „+ 2 weitere Einträge in der Diagnosenliste" → vollständige Liste mit markierten und unmarkierten Einträgen                                                                                                                                                                                                                                          |
| Relevanz in der Erfassung                       | neue Dauerdiagnose → beide Kästchen vorbelegt → speichern → sofort in der Patient Summary                                                                                                                                                                                                                                                                              |
| Was nur im Dokument steht                       | Patient Summary → Prozeduren: Kardioversion aus dem Entlassbrief; „In Dokumenten suchen" → „Echokardiographie" → Befundbericht Kardiologie — steht nur im Text, fehlt deshalb in der Patient Summary                                                                                                                                                                   |
| Verlauf nur mit Struktur                        | Laborbefunde übernehmen → Labor → Kumulativbefund mit zwei Spalten; im Release zwei PDFs ohne Verlauf                                                                                                                                                                                                                                                                  |
| Zustand vor Inhalt                              | Frau Weber → „keine ePA", „ePA öffnen" gesperrt; Herr Krüger → „Widerspruch Medikationsprozess", Medikation zeigt „gesperrt"                                                                                                                                                                                                                                           |
| Akte gesperrt                                   | Konfiguration → Akten → Hoffmann „gesperrt" → Kopf „ePA vorübergehend gesperrt"                                                                                                                                                                                                                                                                                        |
| Rezept aus dem Plan                             | Frau Hoffmann, „Medikation": Ramipril „Rezept" → Reichweite 100 Tage → „Signieren und senden" → „Übertragung ausstehend" → nach 3 s „in der Medikationsliste", am Planeintrag „verordnet …"                                                                                                                                                                            |
| Austausch in der Apotheke                       | Konfiguration → Apotheke → Ramipril „mit Austausch" → „↻ aktualisieren" → Planeintrag 2,5 mg, Dosierung 2-0-0-0, Fassung erhöht                                                                                                                                                                                                                                        |
| Pflichthinweis Mehrfachabgabe                   | Apixaban „Rezept" → senden → Apotheke „zwei Arzneimittel" → Warnband über dem Plan, Marker am Eintrag                                                                                                                                                                                                                                                                  |
| Lücke schließen mit der Verordnung              | Metformin in der Medikationsliste „Rezept" → „Auch in den Medikationsplan aufnehmen" → senden → Metformin im Plan, verknüpft                                                                                                                                                                                                                                           |
| Delegieren                                      | Rolle „MFA" → Frau Yildiz, Levothyroxin „Rezept" → „Zur Signatur vorbereiten" → Rolle „Ärztin" → „Rezepte" (Zahl in der Kopfleiste) → Auswahl signieren                                                                                                                                                                                                                |
| Rezept löschen                                  | E-Rezepte → „löschen" vor der Einlösung → Stand „gelöscht", die Medikationsliste zeigt es nicht mehr                                                                                                                                                                                                                                                                   |
| Verordnen trotz Widerspruch                     | Herr Krüger → „neues E-Rezept" → Salbutamol → senden → Stand „in der ePA für die Praxis nicht sichtbar"                                                                                                                                                                                                                                                                |
| Woher und wohin                                 | Karteikarte → Filter „ePA: ↓ aus der ePA" oder „↑ in der ePA"                                                                                                                                                                                                                                                                                                          |
| Verlauf je Besuch                               | Frau Hoffmann, Karteikarte → Block „heutiger Besuch" mit Termin → Notiz speichern, Diagnose anlegen → beides im selben Block; frühere Tage als Besuch oder Eingang                                                                                                                                                                                                     |
| Impfliste                                       | Frau Hoffmann → Patient Summary → Impfungen (fünf, jüngste zuerst) → „Zur Impfübersicht"; Ausbaustand „Weiterentwicklung 2" → keine Patient Summary, keine Impfliste                                                                                                                                                                                                   |
| Impfung in die ePA                              | Frau Yildiz, „Impfungen" → Grippeimpfung „in die ePA →" → rechts in der Impfliste, verknüpft                                                                                                                                                                                                                                                                           |
| Neu seit dem letzten Aufruf                     | Frau Hoffmann → Patient Summary öffnen und schließen → Konfiguration → Akten → Hoffmann „andere Einrichtung trägt ein" → Patient Summary: Band „2 neu", Marken **neu** an Herzinsuffizienz und Grippeimpfung; ebenso in „Diagnosen und Allergien" und „Impfungen"                                                                                                      |
| Neu seit dem letzten Aufruf, nach Spezifikation | Frau Hoffmann nach eGK → „Medikation" und „Dokumente" einmal öffnen → Konfiguration → Akten → Hoffmann „andere Einrichtung trägt ein" → „Medikation": Band „1 neu · 1 geändert", Torasemid **neu**, Bisoprolol **geändert**; „Dokumente": Kontrollbefund **neu**; im Aufrufprotokoll `recorded=gt…`, `$medication-plan?provenance=…`, `_lastUpdated=gt…` mit Grundlage |
| Kompakt und geordnet                            | Frau Hoffmann, „Diagnosen und Allergien" → Zeilen nach Einstellung, jüngste oben; nach „in die ePA →" steht der Eintrag ganz oben → Bezeichnung anklicken → Details beider Seiten → Sortierung „Eigene Reihenfolge" → Zeile ziehen oder ↑ ↓ → ePA-Fenster, Diagnosen und Allergien: dieselbe Reihenfolge                                                               |

---

## 12 Änderungsverlauf

| Datum      | Anlass                                                                                             | Änderungen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 06.10.2026 | Kopfleiste                                                                                         | „ePA-Aufrufe" heißt „Konfiguration" (Demo-Steuerung und Aufrufprotokoll); neuer Verweis „Dokumentation ↗" auf die Dokumentation im Repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 06.10.2026 | Ausbaustände neu geordnet                                                                          | Vier aufeinander aufbauende Weiterentwicklungen (1, ADR 0034): 1 Laborbefunde und Volltextsuche (`_content` erst ab hier, im Release 400 und kein Suchfeld; CapabilityStatement des Dokumentendienstes unter `…/metadata`), 2 strukturierte Arzt- und Entlassbriefe, 3 Listen, Impfliste und Patient Summary, 4 Aktenlotse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 06.10.2026 | Briefe wie in der Versorgung                                                                       | Arzt- und Entlassbriefe im Release als mehrseitige PDF mit Fließtext nach realen Vorbildern; ambulanter eArztbrief als PDF/A nach der Richtlinie der KBV; ✦ ab der Weiterentwicklung neue Briefe zusätzlich als FHIR nach dem Vorbild des HL7 Europe Hospital Discharge Report mit den Überschriften des MIO KH-E, ältere bleiben PDF (5.4, ADR 0033); neuer Brief B20 (2019); strukturierter Brief im PVS Abschnitt für Abschnitt; Patient Summary automatisch mit sieben Diagnosen und drei Prozeduren                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 05.10.2026 | ✦ Aktenlotse                                                                                       | Neuer Ausbaustand „Weiterentwicklung 3“ mit dem ✦ Aktenlotsen (8, ADR 0032): Fragen an den Aktenbestand mit Belegpflicht und Umfangsangabe, zwei Lesarten, Kontext zum Anlass, Abgleich Entlassbrief gegen Medikationsplan, Vorschläge für die Listen; ✦ Versichertensicht unter `/versicherte` mit Vertretung und Vorlesen; ✦ Versichertenzugang im Simulator (`x-demo-versicherte`, 8.6); Glossar Alltagssprache; eingescannter Vorbefund ohne Textebene (B19); Standard-Ausbaustand ist Stufe 3. **Nachtrag desselben Tages:** Antworten in zusammenhängenden Sätzen statt in Zitaten, Quellenangabe je Unterlage statt je Satz, Weg `…/quelle/{id}` zum Nachlesen (8.1, 8.2); Medikationsplan als Quelle, damit „und wofür?" beantwortbar ist (8.4); Reiter, Kopfschaltfläche und Navigationspunkt erscheinen nur im Ausbaustand (8.5); **Standard-Ausbaustand ist wieder die aktuelle Spezifikation** — die Prüfungen der ✦ Dienste stellen ihn jetzt ausdrücklich ein. **Zweiter Nachtrag:** Versichertensicht als FdV mit Bereichen — Dokumentenliste (ITI-67/68) als Einstieg, der Lotse als neuer Bereich daneben; Quellenangaben führen in die Dokumente statt in ein eigenes Fenster (8.5). Praxissicht in aufklappbaren Abschnitten mit Zähler, ohne Befugnis die Schaltfläche „eGK einlesen" statt einer Fehlermeldung (8.5) |
| 02.10.2026 | Sachlichere Gestaltung                                                                             | Keine fachliche Änderung. Ruhigere Farbwerte, dunkle Kopfleiste, kleine Rundungen, keine Farbverläufe; Zähler neutral, Farbe nur für Zustände mit Handlungsbedarf und für die Bestände (U19); Pfeile als → und ←; schmale Bildschirme scrollen Reiter und Tabellen in ihrem Rahmen (GESTALTUNG.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 01.10.2026 | Automatische Patient Summary konsequent                                                            | „Nur aus automatischen Daten" übernimmt auch Allergien, Diagnosen und Impfungen aus strukturierten Dokumenten (7.2, 7.5, Nachtrag ADR 0031); Frau Hoffmann: sechs von acht Abschnitten, darunter die behobene Harnwegsinfektion als aktiv                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 01.10.2026 | Prozeduren und Implantate                                                                          | ✦ Patient Summary übernimmt Prozeduren und Implantate automatisch aus strukturierten Dokumenten, mit Quelldokument (7.2, 7.5, 7.6, ADR 0031); Entlassbrief mit Implantat; „Inhalte aus Dokumenten" mit Implantaten; B1, B4, Vorführung angepasst                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 01.10.2026 | Abfrage „seit" nach Spezifikation                                                                  | Medikationsplan, Medikationsliste und Dokumente fragen Änderungen seit dem letzten Aufruf mit den spezifizierten Parametern ab (7.7, ADR 0030); entfallene Planeinträge mit Namen; Simulator: `_lastUpdated`, `recorded`, `when`, `agent-identifier`, `target`, `identifier`, Zeitpunkt in jeder Antwort, Uhr mit Millisekunden; „andere Einrichtung trägt ein" in jedem Ausbaustand mit Befund und Planänderung (B18)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 01.10.2026 | Verknüpfung und Abfrage „seit"                                                                     | 6.1: wie Einträge zusammenfinden (verknüpft, wiedererkannt, gleicher Eintrag) mit Grundlage; 7.7 berichtigt: Für Dokumente und Medikation gibt es die Abfrage „seit" bereits (`_lastUpdated`, Chronologie nach `recorded`, `$medication-list` mit `date`); ✦ nur noch für Listen und Patient Summary; Nachtrag ADR 0027                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 01.10.2026 | Veröffentlichte Allergie-Wertelisten                                                               | Substanzen und Manifestationen vom Zentralen Terminologieserver übernommen (1.0.0): Bezeichnungen der veröffentlichten Fassung, Manifestationen 37 statt 41; Quellen der Expositionswege und Schweregrade benannt (8, QUELLEN.md, Nachtrag ADR 0015); Manifestation im Startbestand angepasst                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 01.10.2026 | Mitarbeit im Team                                                                                  | Keine Änderung an der Demo. Regeln für Claude-Sitzungen (`CLAUDE.md`), Zusammenarbeit und Gestaltung als eigene Dokumente, Vorlagen für Issues und Pull Requests, Vertraulichkeitsprüfung in `npm run pruefen`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 30.09.2026 | Kompakte Listen                                                                                    | Diagnosen und Allergien in kompakten, aufklappbaren Zeilen; Ordnung nach Einstelldatum, umstellbar bis zur eigenen Reihenfolge, auch im ePA-Fenster (6.1, 4.1, 4.2, ADR 0029); UX-Grundsätze U29, U30                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 30.09.2026 | Verlauf je Besuch; Impfungen; neu seit dem letzten Aufruf                                          | Karteikarte als Verlauf je Besuch (4.1, ADR 0028); Ausbaustand „Weiterentwicklung 2" mit ✦ Impfliste (6.3, ADR 0026), Bereich Impfungen mit Impfstoffkatalog, Block „Impfungen" der Patient Summary aus der Liste; „Neu seit dem letzten Aufruf" für Patient Summary und Listen (7.7, ADR 0027) mit Demo-Steuerung „andere Einrichtung trägt ein"; Beispiele B16–B18; UX-Grundsätze U27, U28; Befugnisse laufen nach dem Demo-Tag ab (3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 30.09.2026 | Gehostete Demo                                                                                     | Simulator im Browser für GitHub Pages, gleiche Wege und Antworten (ADR 0025); Workflow prüft, baut und veröffentlicht nach Freigabe; Betriebsarten in Abschnitt 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 29.09.2026 | Zustand der Akte; E-Rezept aus dem Plan                                                            | Information Service (5.7) mit Zugangszustand im Kopf und Marker „Widerspruch Medikationsprozess"; 423 am Medication Service, `withheld` in der Patient Summary (ADR 0023); „Stand hh:mm:ss / ↻ aktualisieren" an jeder ePA-Ansicht; Karteikarte mit Dokumenten, E-Rezepten und Kennzeichen ↓/↑ samt Filter; E-Rezept-Fachdienst als Demo-Ersatz mit asynchroner Zulieferung (5.8, ADR 0024); Rezept aus Plan, Liste und Katalog mit Reichweite; Freigabe durch die MFA, Signaturstapel „Rezepte"; Stand je Rezept aus der ePA; Verordnung und Abgabe am Planeintrag; Warnband bei Mehrfachabgabe; Demo-Steuerung für Apotheke, Akten und Übertragungszeit; Beispiele B11–B15, Frau Weber ohne Akte; UX-Grundsätze U21–U26; Ausblick 9.1 fortgeschrieben                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 29.09.2026 | Recherche E-Rezept und Praxisabläufe                                                               | Ausblick 9.1: Verordnen aus dem Plan mit eMP-Identifier, Abgabe und Stornierung, Pflichthinweis Mehrfachabgabe, Vorbereiten und gesammelt signieren, Hochladen mit Metadaten, Zustand und Aktualität, „neu seit dem letzten Besuch"; README-Meilensteine um „E-Rezept und Plan" ergänzt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 29.09.2026 | Relevanzmarkierung; Durchsicht der Patient Summary                                                 | ✦ Relevanz für die Patient Summary je Listeneintrag (ADR 0022): Operationen `$flag-…-entry`, Extension `ps-relevant`, Schalter ★ im Splitscreen, Kästchen in der Erfassung, violette Hervorhebung; Patient Summary zeigt nur Markiertes und nennt die übrigen; Block „Persönliche Erklärungen"; Schweregrad an Diagnosen; „zuletzt geändert" im Kopf; UX-Grundsätze U18–U20; Beispiel B10; „Zurücksetzen" setzt Praxis und Aktensystem gemeinsam zurück                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 28.09.2026 | Grundfunktion der Patient Summary; mehr Beispiele; UX-Grundsätze                                   | ✦ Patient Summary als Sicht aus den Diensten der ePA (Abschnitt 7, ADR 0021): Knopf im Patientenkopf, erster Reiter im ePA-Fenster, Blöcke mit Quelle und Sprung in den pflegenden Bereich, Leerangaben unterschieden, Demo-Steuerung „geführt gegen automatisch"; Beispiele B3 (Vorbefund März) und B4 (kardiologischer Brief mit Text), XML-Briefe lesbar; UX-Grundsätze als Blaupause (2.2); Beispielbestand mit Zweck (3.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 27.09.2026 | Abgleich mit den aktuellen Spezifikationen; eigenständiges Repository; selbsterklärende Oberfläche | Medication Service auf IG 1.3.5 (Operationen, Chronologie, Lesenachweis, 409), MHD auf IG 1.1.3 (Pfade, Profile, Volltext, PDF), `X-Requesting-Organization` nach IG 1.3.2 an den FHIR Data Services, Laborbefund nach `epa.laboratory` 1.0.0-ballot.1 als Vorschau auf ePA 3.2, im Release als PDF; Entwurfspfad für serverseitige Zerlegung entfernt; ✦ Diagnose-Service auf das Muster des dgMP 1.3.5 umgestellt; Erklärtexte aus der Oberfläche in diese Datei verlegt; Simulator in-process testbar (ADR 0019, 0020)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 11.09.2026 | Befugnis und Weiterentwicklung                                                                     | Befugnis über die eGK (ADR 0017), ✦ Diagnose-Service mit Splitscreen (ADR 0018)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10.09.2026 | Spezifikationstreue                                                                                | ePA-Zugriffe nach Release 3.1.3 (ADR 0013), ePA als Fenster (0014), Terminologie im Hintergrund (0015), Laborwerte nur aus Befunden (0016)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
