# Datenmodell — einmal dokumentieren, überall verwenden

Wie das Praxissystem Daten hält und wie daraus FHIR entsteht: für die ePA, den Arztbrief, das
E-Rezept und die Abrechnung. Entscheidung: [ADR 0039](entscheidungen/0039-einmal-dokumentieren.md).

Kennzeichnung: ⚠ = unbelegt, zu verifizieren · ▸ = Bewertung · ✦ = Vorschlag, nicht spezifiziert.

![Datenmodell im Überblick: Bestände im Praxissystem, Abbildung nach FHIR im Kern, Ausgaben an ePA, KIM, E-Rezept-Fachdienst und ohne FHIR im Praxissystem; darunter der Weg einer Diagnose](abbildungen/datenmodell.svg)

_Überblick:_ Grau durchgezogen der Weg über den Kern — dort entsteht FHIR und geht nach außen; blau
gestrichelt der Rückweg in die Bestände; grün der Weg ohne FHIR. Die Abbildung ist eine Datei
([`abbildungen/datenmodell.svg`](abbildungen/datenmodell.svg)) — wer Bestände oder Abbildungen
ändert, zieht sie nach.

## 1 Grundsatz

**Jede Angabe wird an genau einer Stelle erfasst** — in dem Bestand, zu dem sie gehört. Alles
andere ist eine **Ausgabe**: der Eintrag in einer Liste der ePA, der Arztbrief, das E-Rezept, die
Abrechnungsprüfung, der Verlauf der Karteikarte.

**FHIR ist Austauschformat, nicht Datenhaltung.** Die Bestände sind fachliche Typen
(`packages/kern/src/typen`). Wo FHIR Codes vorgibt, führen sie die Werte über eine feste Tabelle
auf diese Codes, etwa `KLINISCHER_STATUS_CODE`. Ressourcen entstehen erst an den Übergängen — und
nur im Kern:

| Übergang                                         | Abbildung im Kern                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| ePA: Diagnosen-, Allergien-, Impfliste ✦         | `fhir/abbildung.ts`                                                 |
| ePA: Medikationsplan (`$add-emp-entry`)          | `fhir/medikation.ts`                                                |
| ePA: Kopfzeile `X-Requesting-Organization`       | `praxisNachFhir` in `fhir/abbildung.ts`                             |
| Arztbrief als FHIR-Dokument                      | `fachlogik/arztbrief.ts` — nutzt `abbildung.ts` und `medikation.ts` |
| ePA: Dokument einstellen (ITI-41); KIM-Nachricht | `fachlogik/xds.ts`, `fachlogik/kim.ts`                              |
| E-Rezept-Fachdienst (⚠ Demo-Ersatz)              | `fhir/erezept.ts` — nutzt `abbildung.ts`                            |
| Laborbefund nach dgLP (Beispielbefunde)          | `fachlogik/laborbefund.ts`                                          |

Die Oberfläche baut keine Ressourcen. Zurück in die Bestände führt `fhir/lesen.ts`.

## 2 Bestände und wofür sie verwendet werden

| Bestand                      | Art                                | Verbindung zur ePA                          | Verwendet in                                                                                                     |
| ---------------------------- | ---------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Patient                      | erfasst (eGK)                      | KVNR = Kennung der Akte                     | jede Ausgabe: `Patient`, `subject.identifier`, XDS-Patientenkennung, E-Rezept, Betreff der KIM-Nachricht         |
| Praxisstammdaten             | erfasst, einmal je Praxis          | Telematik-ID                                | `X-Requesting-Organization`, XDS-Autor, Absender des Arztbriefs, Organisation im E-Rezept, KIM-Absender, Kontakt |
| Nutzer                       | erfasst                            | —                                           | Verfasser mit LANR (Brief, E-Rezept), Herkunft jedes Eintrags                                                    |
| Diagnosen                    | erfasst                            | `epaId`, `epaFassung` ↔ Diagnosenliste ✦    | Diagnosenliste, Arztbrief, Abrechnungsprüfung, Karteikarte, Patient Summary (über die Liste)                     |
| Allergien                    | erfasst                            | `epaId`, `epaFassung` ↔ Allergienliste ✦    | Allergienliste, Arztbrief, AMTS-Prüfung, Patient Summary                                                         |
| Impfungen                    | erfasst                            | `epaId`, `epaFassung` ↔ Impfliste ✦         | Impfliste, Arztbrief, Patient Summary                                                                            |
| Karteikarte                  | erfasst, nur Freitext (A, B, T, S) | —                                           | Verlauf, Arztbrief (Anamnese, Befunde)                                                                           |
| Dokumente                    | Ablage                             | `epaId` (Kennung in der Akte)               | Abgleich mit der ePA, Laborwerte, Arztbrief, Einstellen über ITI-41                                              |
| Laborwerte                   | **abgeleitet** aus Laborbefunden   | —                                           | Labor, AMTS, Arztbrief                                                                                           |
| Rezepte                      | erfasst                            | `empId`, `rezeptId`                         | E-Rezept → Medikationsliste der ePA, Verknüpfung mit dem Plan                                                    |
| Medikationsplan der Praxis   | erfasst, mit dem eMP abgeglichen   | `epaId`, `epaStand` (Fassung beim Abgleich) | Medikation, Karteikarte, Arztbrief, AMTS; Abgleich mit dem eMP (ADR 0046)                                        |
| Behandlungsfälle, Leistungen | erfasst                            | — (Abrechnung geht nicht in die ePA)        | Abrechnungsprüfung                                                                                               |
| Verlauf je Besuch            | **abgeleitet**                     | —                                           | Karteikarte                                                                                                      |

**Weiterer Zustand des Praxissystems** — im selben Zustandsobjekt (`pvs/src/speicher/zustand.ts`),
ohne eigene fachliche Abbildung nach FHIR:

| Bestand                     | Art                             | Verbindung zur ePA                        | Verwendet in                                            |
| --------------------------- | ------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Termine                     | erfasst                         | —                                         | Tagesübersicht, Kommende Termine                        |
| Befugnisse der Praxis       | Ergebnis von `setEntitlementPs` | `validTo` je Akte                         | Kopf, Tagesübersicht, „eGK einlesen"                    |
| Planabgleiche               | Ergebnis des Abgleichs          | Stand des eMP beim Abgleich               | Medikationsplan der Praxis (ADR 0046)                   |
| Gesehen, Lesezeichen        | Ergebnis von Abrufen            | Zeitpunkte der Antworten des Aktensystems | „neu seit dem letzten Aufruf" (ADR 0027)                |
| Listenordnung               | Einstellung                     | —                                         | Sortierung der Listen je Person (6.1 der SPEZIFIKATION) |
| Handlungen, Aufrufprotokoll | Zählung, Protokoll              | jeder Aufruf an die ePA                   | Handlungszähler, Konfiguration                          |

Außerhalb des Zustandsobjekts halten einzelne Module Zustand des Klienten — Sitzung, offene
Anfragen, Protokoll, Fenster (`pvs/src/epa/klient.ts`, `protokoll.ts`, `fenster.ts`) —, der beim
Zurücksetzen mit zurückgesetzt wird. Die Praxisstammdaten sind keine erfasste Größe, sondern eine
Konstante des Kerns (`PRAXIS_STAMMDATEN`). ⚠ Verweise zwischen Beständen (Planeintrag → Rezept,
Rezept → Diagnose, Eintrag → Fall) prüft das Praxissystem nicht; ein verworfenes Rezept kann als
Kennung im Plan stehen bleiben (ohne sichtbare Folge, die Auswertung filtert über vorhandene
Rezepte).

Strukturierte Sachverhalte stehen nie als Karteitext, Laborwerte nie als eigener Bestand — sie
entstehen aus den Befunden (ADR 0016). Ein unterschriebener Brief liegt als FHIR-Dokument in der
Ablage: eine Momentaufnahme, keine zweite Quelle.

▸ **Bewertung.** Für Diagnosen, Allergien, Impfungen, Notizen, Labor und Stammdaten ist der
Grundsatz erfüllt: Eine Diagnose wird einmal erfasst und erscheint in der Liste der ePA, im Brief,
in der Abrechnungsprüfung und in der Patient Summary. **Die Medikation ist die Ausnahme**
(Abschnitt 7).

## 3 Vom Eintrag zur Ressource — die Regeln

| #   | Regel                                                           | Umsetzung                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Pflicht im Profil ist Pflicht im Typ oder in der Erfassung**  | Die KVNR ist Pflichtparameter jeder Abbildung: `patient` 1..1 bei Allergie und Impfung; `subject.identifier` ist in `ti-condition-diagnosis` 1.5.0 Must Support und in der `EMPReasonCondition` des Ballots 1.4.0 Pflicht. Die Allergiemaske speichert keine Reaktion ohne Manifestation (`reaction.manifestation` 1..\*) |
| R2  | **Pflicht, aber unbekannt: `data-absent-reason`**               | Impfdosis (`protocolApplied.doseNumber[x]` 1..1) und Einnahmebeginn (`effective[x]` 1..1 in EPS) mit `unknown`, statt sie wegzulassen — `wertFehlt()`                                                                                                                                                                     |
| R3  | **Must Support: befüllen, wenn bekannt**                        | Alpha-ID, Seitenlokalisation, SNOMED CT neben ICD-10-GM, Schweregrad                                                                                                                                                                                                                                                      |
| R4  | **Optional und leer: weglassen**                                | keine leeren Listen, Objekte oder Zeichenketten (ele-1)                                                                                                                                                                                                                                                                   |
| R5  | **Kodierung: System und Code, Version wo verlangt, Text immer** | ICD-10-GM und Alpha-ID mit Version; SNOMED CT mit Version der deutschen Edition; ATC mit Version; PZN; dazu `text` — die Bezeichnung, die die Ärztin gewählt hat. An HL7-Codes steht die Anzeige der Terminologie (`Active`, `Confirmed` …); deutsche Bezeichnungen nur in der Oberfläche                                 |
| R6  | **Invarianten in Erfassung und Abbildung**                      | „irrtümlich" (`entered-in-error`) ohne klinischen Status (con-5, ait-2), ebenso Zusatzkennzeichen „A" (icd-4 der Basisprofile) und ohne Ende (con-4). Ein Ende nur bei inaktivem, behobenem oder remittiertem Status (con-4)                                                                                              |
| R7  | **Zeitpunkte intern ohne Zone, in FHIR mit Zone**               | Uhr `uhr.ts`: deutsche Uhrzeit, unabhängig vom Rechner (ADR 0049); `fhir/zeit.ts`: +01:00 oder +02:00 nach deutscher gesetzlicher Zeit                                                                                                                                                                                    |
| R8  | **Verweise lösen sich im Bundle auf**                           | Dokumente mit `urn:uuid:`, andere Bundles mit absoluter `fullUrl` (`fhir/vollurl.ts`)                                                                                                                                                                                                                                     |
| R9  | **Eine Abbildung je Inhalt, das Profil je Ziel**                | `patientNachFhir(p, profil)`, `praxisNachFhir(p, profil)`, `personNachFhir(…, profil)` für ePA, Brief und E-Rezept                                                                                                                                                                                                        |
| R10 | **Zurück aus FHIR: unbekannt statt Vorbelegung**                | `fhir/lesen.ts` leitet ab, wo eine andere Angabe es ergibt (Zusatzkennzeichen aus Diagnosesicherheit und Status), und lässt sonst `null`; Impfung `not-done` bleibt „nicht erfolgt“; Zeitpunkte mit Zone werden zum Tag in deutscher Zeit (ADR 0053)                                                                      |

## 4 Abbildungen im Einzelnen

Spalte „Kard.": Basis R4 → Profil. Pflicht = min 1; MS = Must Support.

### 4.1 Diagnose → `Condition` nach `ti-condition-diagnosis`

Paket `de.gematik.ti` 1.5.0-ballot.2, abgeleitet von `condition-eu-core`. Pflichtangaben gegen den
Snapshot 1.5.0 geprüft (15.10.2026). Gegenüber 1.4.0 ist `subject.identifier` nur noch Must Support;
neu ist der Slice `orphanet`.

| Feld im PVS                                      | FHIR-Element                                       | Kard.                   | Kodierung, Bindung                                                                                                               | Wenn leer                                                                                          |
| ------------------------------------------------ | -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| KVNR der Person                                  | `subject.identifier`                               | 0..1 → MS (1.4.0: 1..1) | `http://fhir.de/sid/gkv/kvid-10`                                                                                                 | kommt nicht vor (R1)                                                                               |
| `code`, `bezeichnung`                            | `code.coding:ICD-10-GM` (system, version, code)    | 0..1 → **1..1**, MS     | `http://fhir.de/CodeSystem/bfarm/icd-10-gm`, Version `2026`                                                                      | Pflicht in der Erfassung                                                                           |
| `zusatzkennzeichen`                              | Extension Diagnosesicherheit an der ICD-Kodierung  | MS                      | `KBV_CS_SFHIR_ICD_DIAGNOSESICHERHEIT` (required); `icd-4` bis `icd-7` koppeln es an klinischen und Verifikationsstatus (Warnung) | immer gesetzt (G, V, Z, A)                                                                         |
| `seitenlokalisation`                             | Extension Seitenlokalisation                       | MS                      | `KBV_CS_SFHIR_ICD_SEITENLOKALISATION` (required)                                                                                 | weglassen                                                                                          |
| `alphaId`                                        | `code.coding:alphaId`                              | MS, version 1..1        | `http://fhir.de/CodeSystem/bfarm/alpha-id`, Version `2026`                                                                       | weglassen                                                                                          |
| `snomed`                                         | `code.coding:snomed`                               | MS, **version 1..1**    | SNOMED CT, deutsche Edition                                                                                                      | weglassen                                                                                          |
| `bezeichnung`                                    | `code.text`                                        | MS                      | —                                                                                                                                | immer                                                                                              |
| `klinischerStatus`                               | `clinicalStatus`                                   | 0..1, MS; con-3 bis -5  | `condition-clinical` (required)                                                                                                  | bei „irrtümlich" und Zusatzkennzeichen „A" weglassen (R6)                                          |
| `diagnosesicherheit`                             | `verificationStatus`                               | 0..1, MS                | `condition-ver-status` (required)                                                                                                | immer gesetzt                                                                                      |
| `art` (Dauer, akut)                              | `category`                                         | 0..\*                   | `problem-list-item`, `encounter-diagnosis`                                                                                       | immer gesetzt                                                                                      |
| `beginn`                                         | `onsetDateTime`                                    | 0..1                    | —                                                                                                                                | Pflicht in der Erfassung                                                                           |
| `ende`                                           | `abatementDateTime`                                | 0..1; con-4             | nur bei inaktiv, behoben, Remission                                                                                              | Die Maske sperrt das Ende, solange die Diagnose gegenwärtig ist; bei „irrtümlich" entfällt es (R6) |
| `dokumentiertAm`; `festgestelltAm`               | `recordedDate`; Extension `condition-assertedDate` | 0..1                    | —                                                                                                                                | Feststellungsdatum weglassen                                                                       |
| `herkunft.verantwortlich`; `feststellendePerson` | `recorder.display`; `asserter.display`             | 0..1                    | —                                                                                                                                | feststellende Person weglassen                                                                     |
| `schweregrad`, `koerperstelle`, `notiz`          | `severity`, `bodySite.text`, `note.text`           | 0..1, 0..\*             | Schweregrad SNOMED CT                                                                                                            | weglassen                                                                                          |
| `herkunft.dokumentId`                            | Extension `source-document` ✦                      | —                       | Namensraum der Demo                                                                                                              | weglassen                                                                                          |

⚠ Nicht abgebildet ist das **Mehrfachkodierungs-Kennzeichen** (†, \*, !): Im Profil ist es Must
Support, im Diagnosemodell fehlt das Feld (Abschnitt 7).

### 4.2 Allergie → `AllergyIntolerance` nach `allergyIntolerance-eu-core` 2.0.0

| Feld im PVS                                               | FHIR-Element                                        | Kard.                 | Kodierung, Bindung                             | Wenn leer                                                            |
| --------------------------------------------------------- | --------------------------------------------------- | --------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| KVNR                                                      | `patient` (Verweis mit Kennung)                     | **1..1**              | `kvid-10`                                      | kommt nicht vor (R1)                                                 |
| `substanz`, `snomed`                                      | `code` (`coding` SNOMED CT, `text`)                 | 0..1 → **1..1**       | SNOMED CT mit Version; Freitext nur als `text` | `text` immer                                                         |
| `klinischerStatus`                                        | `clinicalStatus`                                    | 0..1; ait-1, ait-2    | `allergyintolerance-clinical` (required)       | bei „irrtümlich" weglassen (R6)                                      |
| `gewissheit`                                              | `verificationStatus`                                | 0..1                  | `allergyintolerance-verification` (required)   | immer gesetzt                                                        |
| `typ`, `kritikalitaet`; `kategorien`                      | `type`, `criticality`; `category`                   | 0..1; 0..\*           | required                                       | `category` ohne Eintrag weglassen (R4)                               |
| `reaktionen[].manifestationen`                            | `reaction.manifestation`                            | **1..\*** je Reaktion | SNOMED CT                                      | keine Reaktion ohne Manifestation (R1)                               |
| `reaktionen[]`, übrige Angaben                            | `reaction.severity`, `onset`, `exposureRoute`       | 0..1                  | required bzw. SNOMED CT                        | weglassen                                                            |
| `beginn`                                                  | `onsetDateTime`                                     | 0..1                  | —                                              | weglassen                                                            |
| `ende`                                                    | Extension `allergyintolerance-abatement`            | 0..1                  | HL7 FHIR Extensions Pack                       | weglassen; die Maske sperrt das Ende, solange die Allergie aktiv ist |
| `herkunft.verantwortlich`; `feststellendePerson`; `notiz` | `recorder.display`; `asserter.display`; `note.text` | 0..1, 0..\*           | —                                              | weglassen                                                            |
| „keine bekannte Allergie"                                 | `code` = SNOMED CT 716186003                        | —                     | —                                              | eigene Abbildung `keineBekannteAllergieNachFhir`                     |

`onset[x]` ist der Beginn. Ein `onsetPeriod` beschreibt den Zeitraum, in dem die Allergie begann —
sein Ende ist nicht das Ende der Allergie. AllergyIntolerance hat in R4 kein `abatement[x]`; dafür
steht die Extension.

### 4.3 Impfung → `Immunization` nach `immunization-eu-core` 2.0.0

| Feld im PVS          | FHIR-Element                                                                                  | Kard.                         | Kodierung                                   | Wenn leer                               |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------- | --------------------------------------- |
| `status`             | `status`                                                                                      | **1..1**                      | `completed`, `not-done`, `entered-in-error` | immer                                   |
| `impfstoff`          | `vaccineCode`                                                                                 | **1..1**                      | ATC mit Version, PZN; `text`                | ATC und `text` immer                    |
| KVNR                 | `patient`                                                                                     | **1..1**                      | `kvid-10`                                   | kommt nicht vor (R1)                    |
| `datum`              | `occurrenceDateTime`; ungefähr `occurrenceString` (aus fremden Einträgen, im Dienst änderbar) | **1..1** (`occurrence[x]`)    | —                                           | Pflicht in der Erfassung                |
| `dosis`              | `protocolApplied.doseNumberPositiveInt`                                                       | **1..1** je `protocolApplied` | —                                           | **`data-absent-reason` `unknown`** (R2) |
| `zielkrankheiten`    | `protocolApplied.targetDisease`                                                               | 0..\*                         | SNOMED CT                                   | weglassen (R4)                          |
| `geimpftVon`         | `performer.actor.display`                                                                     | 0..\*                         | —                                           | immer gesetzt                           |
| `herkunft.zeitpunkt` | `recorded` (Datum)                                                                            | 0..1                          | —                                           | immer gesetzt                           |
| `charge`, `notiz`    | `lotNumber`, `note.text`                                                                      | 0..1, 0..\*                   | —                                           | weglassen                               |

### 4.4 Patient, Praxis, Person

| Quelle              | Ressource      | Pflicht                                            | Profil je Ziel                                                                             |
| ------------------- | -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Patient             | `Patient`      | `name` 1..\*, `birthDate` 1..1 (EU Core), eu-pat-1 | `ti-patient` (Listen, Brief) · `KBV_PR_FOR_Patient` (E-Rezept)                             |
| Praxisstammdaten    | `Organization` | Name oder Kennung (org-1)                          | `ti-organization` (Kopfzeile) · ohne Profil (Brief) · `KBV_PR_FOR_Organization` (E-Rezept) |
| Nutzer (Name, LANR) | `Practitioner` | —                                                  | ohne Profil (Brief) · `KBV_PR_FOR_Practitioner` (E-Rezept)                                 |

Kennungen: KVNR `http://fhir.de/sid/gkv/kvid-10`, Telematik-ID
`https://gematik.de/fhir/sid/telematik-id`, BSNR `https://fhir.kbv.de/NamingSystem/KBV_NS_Base_BSNR`,
LANR `https://fhir.kbv.de/NamingSystem/KBV_NS_Base_ANR`.

### 4.5 Medikation

| Ausgabe                              | Ressource                                             | Pflicht                                                        | Hinweis                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| neuer Planeintrag (`$add-emp-entry`) | `MedicationRequest` nach `EMPMedicationRequest` 1.4.0 | `status`, `intent`, `subject`, `authoredOn`                    | `medicationReference` auf das Arzneimittel des Parameters `medication` (Kennungen vom Primärsystem, wie in den Beispielen des IG; der Dienst schreibt sie um). Dosierung nach `DosageDgMP` mit `renderedDosageInstruction` und `GeneratedDosageInstructionsMeta`; Grund über `reasonReference` (SPEZIFIKATION 5.14) |
| Behandlungsgrund (`reasonCondition`) | `Condition` nach `EMPReasonCondition` 1.4.0           | `code` (ICD-10-GM mit Version), `subject`                      | aus der Diagnose der Praxis: Diagnosesicherheit, klinischer und Verifikationsstatus wie `ti-condition-diagnosis`                                                                                                                                                                                                    |
| Arzneimittel des Planeintrags        | `Medication` nach `EMPMedication`                     | —                                                              | ATC mit Version — ohne Version weist der Dienst ab (SPEZIFIKATION 5.3); PZN; `text`                                                                                                                                                                                                                                 |
| Mittel im Brief und in Dokumenten    | `MedicationStatement`                                 | `status`, `medication[x]`, `subject`; EPS: `effective[x]` 1..1 | Einnahmebeginn unbekannt → `data-absent-reason` (R2)                                                                                                                                                                                                                                                                |
| Verordnung                           | KBV-Verordnungsdatensatz                              | ⚠ vereinfacht (`fhir/erezept.ts`)                              | Patient, Praxis, Ärztin aus denselben Abbildungen wie oben; Dosierung aus `Rezept.dosis` wie im Planeintrag, sonst aus dem Text (ADR 0052)                                                                                                                                                                          |

### 4.6 Arztbrief als Dokument

`Bundle` vom Typ `document`: Kennung mit System und Wert (bdl-9), Zeitstempel (bdl-10), die
Composition als erster Eintrag (bdl-11). Was die Composition referenziert — Patient, Verfasser,
Praxis, Begegnung, Empfänger ✦, Einträge der Abschnitte —, liegt im Bundle, und alles im Bundle ist
von ihr aus erreichbar (FHIR R4, Documents). Abschnitte stehen nur mit Inhalt da, jeder mit
Erzähltext (cmp-1). Der Abschnitt Allergien steht immer — ohne Eintrag mit `emptyReason` (cmp-2
erlaubt ihn nur ohne Einträge). Einzelheiten: [SPEZIFIKATION 7.8](SPEZIFIKATION.md#78--arztbrief-adr-0038).

## 5 Abrechnung — dieselben Diagnosen

Die Abrechnung ist kein FHIR. Sie liest dieselben Diagnoseeinträge wie ePA-Liste und Brief:

- **Abrechnungsprüfung der Demo:** Der Chronikerzuschlag setzt eine gesicherte (Zusatzkennzeichen
  G), gegenwärtige Dauerdiagnose voraus — Zusatzkennzeichen, klinischer Status und Art aus dem
  Diagnosebestand.
- **Abrechnungsdatei:** Diagnosen gehen mit ICD-10-GM-Code, Zusatzkennzeichen für die
  Diagnosensicherheit und, wo sie zutrifft, Seitenlokalisation in die Abrechnung — dieselben
  Angaben, die in FHIR an der ICD-Kodierung stehen. ⚠ Die Demo erzeugt keine Abrechnungsdatei; die
  Satzbeschreibung ist nicht geprüft.

## 6 Prüfung gegen die FHIR-Spezifikation

**Was geprüft wird.** `fhirPruefen` (`kern/src/fhir/pruefung.ts`) prüft bei jedem Testlauf:

- die Pflichtelemente der Basis R4 je Ressourcentyp und der verwendeten Profile;
- die Invarianten con-3, con-4, con-5, ait-1, ait-2, org-1, eu-pat-1, cmp-1, cmp-2, bdl-7, bdl-9,
  bdl-10, bdl-11 und ele-1 — con-4 nach dem Ausdruck der Spezifikation, also auch für ein Ende ohne
  klinischen Status;
- die Dokumentregeln;
- Zeitzonen an `dateTime` und `instant`;
- die Versionen an ICD-10-GM, Alpha-ID und SNOMED CT — Fehler in den TI-Profilen, sonst Warnung.

**Wo.**

- `kern/src/fhir/pruefung.test.ts`: jede Abbildung, mit jeder Kombination aus Diagnosesicherheit
  und klinischem Status bzw. Gewissheit und Allergiestatus, jeweils mit Ende.
- `epa-sim/src/fhir-konformitaet.test.ts`: jede HTTP-Antwort des Simulators und jedes strukturierte
  Dokument beider Akten.

Ergebnis: **keine Fehler, keine Warnungen.**

**Was die Prüfung fand und was behoben ist.**

| Befund                                                                                                | Regel                                      | Behoben                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Diagnose ohne KVNR, wenn der Aufrufer sie nicht mitgab                                                | `subject.identifier` (1..1 im Stand 1.4.0) | KVNR ist Pflichtparameter (R1)                                                                  |
| Irrtümliche Diagnose und Allergie mit klinischem Status                                               | con-5, ait-2                               | Status entfällt (R6)                                                                            |
| Diagnose mit Ende bei gegenwärtigem Status (Wiederauftreten, Rezidiv) oder bei „irrtümlich"           | con-4                                      | Die Maske sperrt das Ende; Abbildung, Berichtigen in der Liste und Simulator lassen es weg (R6) |
| Ende einer Allergie als Ende des Beginnzeitraums (`onsetPeriod.end`)                                  | Bedeutung von `onset[x]`                   | Extension `allergyintolerance-abatement`, nur bei nicht mehr aktiver Allergie                   |
| Impfung ohne Dosis: `protocolApplied` ohne `doseNumber[x]`; ohne Zielkrankheit eine leere Liste       | Pflicht R4, ele-1                          | `data-absent-reason` (R2); Liste entfällt (R4)                                                  |
| Allergie ohne Kategorie: leere Liste                                                                  | ele-1                                      | entfällt (R4)                                                                                   |
| „Keine bekannte Allergie" ohne `patient`                                                              | `patient` 1..1                             | Abbildung im Kern mit KVNR                                                                      |
| Zeitpunkte mit Uhrzeit ohne Zone — in Brief, Laborbefund, E-Rezept und allen Antworten des Simulators | FHIR-Datentypen                            | `fhir/zeit.ts` an den Übergängen (R7)                                                           |
| Abschnittscodes des E-Rezepts ohne Codesystem                                                         | Kodierung                                  | System ergänzt (⚠ nicht gegen das KBV-Paket geprüft)                                            |
| Kontrollbefund der Kardiologie ohne Dokumentkennung                                                   | bdl-9                                      | Kennung ergänzt                                                                                 |
| SNOMED CT ohne Version in den Briefen des Simulators                                                  | Kodierung (Warnung)                        | Version ergänzt                                                                                 |

**Was die Prüfung nicht abdeckt (⚠).**

- Ob ein Code im gebundenen ValueSet liegt — dafür braucht es einen Terminologieserver.
- Slicing und Feinheiten der Profile über die Pflichtangaben hinaus.
- Die KBV-Profile des E-Rezepts in Gänze.
- Das Profil `ti-organization` im Einzelnen.
- Die Obligations der EPS je Akteur.

Die verbindliche Prüfung leistet der HL7 FHIR Validator gegen die veröffentlichten Pakete:
`npm run fhir:validieren` legt ihm alle Ausgaben vor, die `fhirPruefen` in den Tests ohne Fehler
prüft; in der CI läuft dasselbe im Job „FHIR-Validator“. **Stand 15.10.2026: keine Fehler.** Der
erste Lauf fand 965; was er fand und welche Ausnahmen mit welchem Grund gelten, steht in
ENTWICKLUNG, Abschnitt „FHIR-Validator“. Seit der Angleichung an `de.gematik.epa.laboratory`
1.0.0-ballot.1 ist auch der Laborbefund geprüft; offen sind dort nur zwei Meldungen, die keine
Instanz beheben kann (SPEZIFIKATION 5.5). Seit 16.10.2026 prüft ein Vorschau-Lauf die Ausgaben
der Vorschau auf ePA 3.2 gegen die Ballot-Pakete — die erzeugte ePS und ihre DocumentReference nach
MHD 1.2.0 (ADR 0042): keine Fehler.

Was der Validator ohne Terminologieserver nicht leistet, prüfen Tests: den Abschnitt des
Laborbefunds nach `section:result` und die Auflösung jedes Verweises im Befund
(`fachlogik/laborbefund.test.ts`).

## 7 Offene Punkte der Architektur

1. ~~Medikation ohne lokalen Primärbestand~~ — erledigt mit ADR 0046: Medikationsplan der Praxis
   mit `epaId` und Abgleich. ⚠ Einnahmebeginn fehlt weiter im Plan der Praxis.
2. **Mehrfachkodierungs-Kennzeichen** (†, \*, !) fehlt im Diagnosemodell, obwohl Must Support.
3. **Namen von Personen** stehen beim Verfasser als `name.text`. ⚠ Die KBV-Profile verlangen
   strukturierte Namen.
4. **Abrechnungsdatei.** Die Angaben liegen vor (Abschnitt 5), eine Ausgabe fehlt.
5. **Diagnosesicherheit und klinischer Status.** Die Deutschen Basisprofile koppeln beide über
   `icd-4` bis `icd-7` (Warnung): G → aktiv/bestätigt, V → aktiv/vorläufig oder Differential,
   Z → behoben/bestätigt, A → ohne Status/widerlegt. Die Abbildung setzt „A“ ohne Status um. ⚠ Offen:
   Wird eine Diagnose behoben, müsste das Kennzeichen auf „Z“ wechseln; die Maske tut das nicht. Der
   Startbestand zeigt den Fall (Harnwegsinfektion, „G“ und behoben — Warnung `icd-5`).
6. **Ballot 1.4.0.** Was eine Übernahme an Abbildungen und Wegen ändert — Grund im Plan als
   `reasonReference`, Common Query API, Patient Service mit `$summary` —, steht in
   [SPEZIFIKATION 5.12](SPEZIFIKATION.md#512-abgleich-mit-den-ballots-140-15102026).
7. **Herkunft je Eintrag in der Patient Summary.** Das ✦ Dokument trägt die Änderungseinträge
   aller Fassungen, damit die Herkunftszeile „angelegt von“ zeigen kann. Im Dokument liegt aber nur
   die aktuelle Fassung; die Provenance früherer Fassungen ist dort nicht auflösbar (HL7-Validator).
   ✦ Zu klären: nur die Provenance der enthaltenen Fassung und die Herkunft am Eintrag selbst.
8. **Laborbefund nach dgLP.** Angeglichen an den Ballot `de.gematik.epa.laboratory`
   1.0.0-ballot.1 (15.10.2026): Hierarchie Gruppe → Einzelwert, Einsender als Organisation,
   Pflichtangaben an Probe, Auftrag und Composition (SPEZIFIKATION 5.5). Offen bleiben Punkte im
   Ballot selbst:
   - ▸ `dr-comp-identifier` ist mit den dgLP-Profilen nicht erfüllbar (Ausnahme im Validator).
   - ▸ `obs-range-2` schließt einseitige Referenzbereiche aus; die Demo setzt die fehlende Grenze
     mit `data-absent-reason` — ⚠ ob das dgLP das so vorsieht, ist offen.
   - Die gematik-Codesysteme `laboratory-identificator` und `laboratory-study-group` stehen in
     Version 1.1.0 in `de.gematik.terminology` 1.1.0-ballot.2. Das Laborpaket führt es bewusst
     nicht als Abhängigkeit; der Validator lädt es eigens (SPEZIFIKATION 5.5, Befund 4).
   - Die Laborbefunde tragen keinen Laborbereich an der Gruppe und keine optionalen Angaben
     (Akkreditierung, kritisches Ergebnis, alternative Ergebnisse).

## 8 Abgleich mit dem Informationsmodell der Patient Summary

Quelle: Informationsmodell „MIO ePA EU Patient Summary“ im öffentlichen CI-Build des Implementation
Guide (Branch `ePS-0.0.1`, Datei `infomodell_js_treeview_epa-ps.json`, Stand 17.11.2026; Verweis in
[QUELLEN.md](QUELLEN.md)). Das Modell ist ein Arbeitsstand, kein FHIR-Profil: Es nennt Elemente,
Kardinalitäten und Wertelisten, die Profile folgen später. Die Demo bildet ab, was ihre Abläufe
brauchen; Abweichungen stehen hier.

### 8.1 Patient Summary

| Element im Modell                                                                                               | Kard.         | Demo                                                                                           | Stand            |
| --------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| Subjekt (TI Patient)                                                                                            | 1..1          | `subject`                                                                                      | abgebildet       |
| Zuletzt bearbeitet                                                                                              | 1..1          | `Composition.date`, „zuletzt geändert“ im Kopf                                                 | abgebildet       |
| Autor:in (TI Practitioner, PractitionerRole)                                                                    | 1..\*         | `author` ist der Dienst (Device), wie in der gematik-EPS                                       | **abweichend** ▸ |
| Allergien/Unverträglichkeiten                                                                                   | 1..1          | Abschnitt 48765-2 mit Leergrund                                                                | abgebildet       |
| Diagnosen: Aktive Diagnosen, Vergangene Diagnosen                                                               | 1..1; je 0..1 | Abschnitt 11450-4, im Erzähltext und in der Anzeige geteilt, aktive zuerst (SPEZIFIKATION 7.2) | abgebildet ⚠     |
| Impfungen/Prophylaxen                                                                                           | 1..1          | Abschnitt 11369-6                                                                              | abgebildet       |
| Implantate/Geräte                                                                                               | 1..1          | Abschnitt 46264-8                                                                              | abgebildet       |
| Medikationen                                                                                                    | 1..1          | Abschnitt 10160-0 aus eMP bzw. eML                                                             | abgebildet       |
| Prozeduren                                                                                                      | 1..1          | Abschnitt 47519-4                                                                              | abgebildet       |
| Diagnostische Resultate (Laborbefund dgLP)                                                                      | 0..1          | Abschnitt 30954-2 aus dgLP-Befunden                                                            | abgebildet       |
| Persönliche Erklärungen                                                                                         | 0..1          | Abschnitt 42348-3, leer                                                                        | abgebildet       |
| Medizinische Warnungen, Funktionszustand, Anamnese, Schwangerschaft, Sozial- und Reiseanamnese, Versorgungsplan | je 0..1       | —                                                                                              | nicht abgebildet |

- ⚠ **Aktive und vergangene Diagnosen:** `composition-eu-eps` (1.0.0-ballot) kennt keine
  Unterabschnitte und hat den Abschnitt der früheren Probleme gestrichen; das EHDS-Modell (Xt-EHR
  1.0.0) schlägt vor, beide Problemabschnitte zusammenzulegen. Die IPS führt sie getrennt (11348-0).
  Die Demo bleibt bei einem Abschnitt und teilt nach dem klinischen Status: inaktiv, Remission und
  behoben gelten als vergangen, ohne Status als aktiv. Wie das Modell die Teilung in FHIR abbildet,
  ist offen.
- ▸ **Autor:in:** Das Modell nennt eine verantwortliche Person. Die gematik-EPS und die Demo nennen
  den Dienst, weil niemand die zusammengestellte Übersicht verantwortet (SPEZIFIKATION 6.4, „Wer
  darf ändern?“).

### 8.2 Diagnose

| Element im Modell                                                        | Kard.                                                        | Demo (4.1)                                                                             | Stand                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------ |
| Codierung: ICD-10-GM, SNOMED CT, ORPHANET, Alpha-ID                      | je 0..1; mindestens einer von ICD-10-GM, SNOMED CT, ORPHANET | ICD-10-GM Pflicht (Abrechnung), SNOMED CT und Alpha-ID dazu                            | strenger; ORPHANET nicht |
| ICD-10-GM: Diagnosesicherheit, Seitenlokalisation, Codierungskennzeichen | 0..1                                                         | Zusatzkennzeichen, Seite; Codierungskennzeichen nicht                                  | teilweise                |
| Diagnosesicherheit                                                       | 0..1                                                         | `verificationStatus`                                                                   | abgebildet               |
| Klinischer Status                                                        | **1..1**                                                     | `clinicalStatus`; fehlt bei „irrtümlich“, Zusatzkennzeichen „A“ und unbekanntem Status | **abweichend** ▸         |
| Kategorie: SNOMED-CT-Code, HL7 ConditionCategory                         | SNOMED CT **1..1**, HL7 0..1                                 | nur ConditionCategory (`problem-list-item`, `encounter-diagnosis`)                     | **offen** ⚠              |
| Klinisch relevanter Zeitraum (von, bis)                                  | 0..1                                                         | `onsetDateTime`, `abatementDateTime`                                                   | abgebildet               |
| Feststellungsdatum, Dokumentationsdatum                                  | 0..1                                                         | Extension `condition-assertedDate`, `recordedDate`                                     | abgebildet               |
| Schweregrad (SNOMED CT), Körperstelle, Notiz                             | 0..1, 0..\*                                                  | abgebildet, Körperstelle als Text                                                      | teilweise                |
| Stadium, Externe Referenzen, Körperstruktur                              | 0..\*                                                        | —                                                                                      | nicht abgebildet         |
| Beteiligte Personen                                                      | 0..\*                                                        | Namen als `recorder.display`, `asserter.display`                                       | teilweise                |

- ▸ **Klinischer Status 1..1** widerspricht FHIR für irrtümliche Einträge (`con-5`: kein Status bei
  `entered-in-error`) und den Deutschen Basisprofilen für ausgeschlossene Diagnosen (`icd-4`).
  `ti-condition-diagnosis` führt ihn 0..1. Die Demo folgt dem Profil.
- ⚠ **Kategorie als SNOMED CT 1..1:** Das Modell nennt dafür keine Werteliste. Die Demo führt nur
  die HL7-Kategorie, wie das Profil sie bindet.

### 8.3 Allergie/Unverträglichkeit

| Element im Modell                                                | Kard.                                        | Demo (4.2)                                                             | Stand                     |
| ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| Substanz: SNOMED CT oder EMA SPOR SMS                            | Code-Auswahl 1..\*, einer von beiden Pflicht | SNOMED CT aus der Werteliste der KBV; Freitext möglich; EMA SPOR nicht | **abweichend** (Freitext) |
| Klinischer Status                                                | 1..1                                         | `clinicalStatus`, fehlt nur bei „irrtümlich“ (`ait-2`)                 | abgebildet                |
| Gewissheit, Typ, Kritikalität, Wirkstoffkategorie                | 0..1, 0..\*                                  | abgebildet                                                             | abgebildet                |
| Klinisch relevanter Zeitraum                                     | 0..1                                         | Beginn, Ende (Extension)                                               | abgebildet                |
| Reaktion: Manifestation (SNOMED CT)                              | 1..\*, Code **1..1**                         | SNOMED CT aus der Werteliste; Freitext möglich                         | **abweichend** (Freitext) |
| Reaktion: Schweregrad, Ereignisdatum, Expositionsweg             | 0..1                                         | abgebildet                                                             | abgebildet                |
| Reaktion: Zeitliche Latenz, mit Vorauswahl < 6 h, 6–24 h, > 24 h | 0..1                                         | —                                                                      | nicht abgebildet          |
| Beteiligte Personen, Notiz                                       | 0..\*                                        | Namen als Text; Notiz                                                  | teilweise                 |

▸ Seit dem Stand vom 17.11.2026 verlangt das Modell für Substanz und Manifestation einen Code. Die
Erfassung der Demo lässt Freitext zu und kennzeichnet ihn („Freitext — nicht kodiert“, ADR 0015);
ein solcher Eintrag entspricht dem Modell nicht.

### 8.4 Impfung

| Element im Modell                                           | Kard.                    | Demo (4.3)                                                      | Stand                  |
| ----------------------------------------------------------- | ------------------------ | --------------------------------------------------------------- | ---------------------- |
| Impfstoff: ATC oder SNOMED CT (IPS-Wertelisten)             | einer von beiden Pflicht | ATC mit PZN und Text                                            | abgebildet ⚠           |
| Impfzeitpunkt                                               | 1..1 (Datum und Zeit)    | Datum                                                           | abgebildet             |
| Status: abgeschlossen, nicht durchgeführt                   | 1..1                     | dazu `entered-in-error` für die Berichtigung in der ✦ Impfliste | **erweitert**          |
| Zielerkrankung (SNOMED CT)                                  | 0..\*, Code 1..1         | abgebildet                                                      | abgebildet             |
| Impfende Person/Einrichtung, Verantwortliche Einrichtung    | 0..1                     | Name als `performer.actor.display`                              | teilweise              |
| Verabreichtes Produkt (Arzneimittel des Medication Service) | 0..1                     | —                                                               | nicht abgebildet       |
| Notiz                                                       | 0..\*                    | abgebildet                                                      | abgebildet             |
| —                                                           | —                        | Dosisnummer, Charge (aus `immunization-eu-core`)                | über das Modell hinaus |

⚠ **ATC:** Das Modell bindet die IPS-Werteliste `vaccines-whoatc-uv-ips` mit dem System der WHO
(`http://www.whocc.no/atc`). Die Demo führt die amtliche deutsche Fassung des BfArM
(`http://fhir.de/CodeSystem/bfarm/atc`); die Codes J07… sind gleich, das System nicht. Welches im
Profil gilt, ist offen.
