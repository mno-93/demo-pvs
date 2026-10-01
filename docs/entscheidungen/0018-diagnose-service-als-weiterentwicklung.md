# 0018 — ✦ Diagnose-Service für Allergien und Diagnosen als Weiterentwicklung der ePA

**Datum:** 11.09.2026 · **Status:** angenommen für die Demo; Operationen und Schreibregeln
ersetzt durch 0019 · **Kennzeichnung:** ✦ Vorschlag, nicht spezifiziert · **ergänzt:** 0013

## Zusammenhang

Die Demo soll zeigen, wie eine Weiterentwicklung der ePA aussähe, in der die Patient Summary nach
österreichischem Vorbild zentral aus mehreren Quellen entsteht. Dafür braucht es zuerst die
Quellen: Dienste, über die Primärsysteme Allergien und Diagnosen zentral in der ePA speichern und
bearbeiten. Die Erzeugung der Patient Summary folgt später.

Belegte Ausgangspunkte:

- **Österreich, e-Diagnose:** ein zentraler Dienst, über den Allergien _und_ Diagnosen
  sektorenübergreifend erfasst und kollaborativ angepasst werden; nachgenutzt als „autorisierte
  Quelle" einer automatisiert erstellten Patientenkurzakte.
- **dgMP, Medication Service:** Provenance je Schreibung, Versionierung, Berichtigung über den
  Status (Konzept 3.1.3; seit 0019 nach IG 1.3.5 mit Chronologie und Lesenachweis). Das Konzept
  3.1.0 beschreibt dazu die AMTS-Allergien („No known allergy" SNOMED CT 716186003) — im
  Release 3.1.3 zurückgestellt.
- **Zielbild:** Splitscreen aus Allergienliste (ePA) und lokalen Allergien, aus Diagnosenliste
  (ePA) und lokalen Diagnosen; Herkunftszeile je Eintrag. Die Patient Summary ist eine Sicht auf
  eigenständig gepflegte Listen und wird nie selbst bearbeitet.

## Entscheidung

Der Simulator bietet — nur im Ausbaustand „Weiterentwicklung" — einen **Diagnose-Service** mit
zwei Listen je Akte. Der Pfad kennzeichnet den Vorschlag:
`/epa/vorschlag/diagnosis/api/v1/fhir`.

Die Operationen folgen seit 0019 dem Muster des Medication Service 1.3.5 (`$condition-list`,
`$add-condition-entry`, `$update-condition-entry`, entsprechend für Allergien); die Tabelle steht
in [SPEZIFIKATION.md](../SPEZIFIKATION.md), Abschnitt 6. Profile: `ti-condition-diagnosis`
(TI 1.5.0-ballot.1) mit Pflicht zur SNOMED-CT-Version — ✦ die Demo verlangt sie auch für
Allergien —, `allergyIntolerance-eu-core`. Ohne Befugnis gilt 0017.

Das **Praxissystem** zeigt „Diagnosen und Allergien" als Splitscreen: links die eigenen
Einträge, rechts die Liste der ePA mit Herkunftszeile, dazwischen der Abgleich (`kern`,
`fachlogik/listenabgleich.ts`) mit den Handlungen _in die ePA_, _in die Praxis_, _verknüpfen_,
_ePA-Stand übernehmen_, _Änderung übertragen_, _berichtigen_. In der Erfassungsmaske ersetzt das
Kästchen „In der Diagnosenliste der ePA führen" die frühere Markierung „für die Patient Summary
vorsehen" — vorbelegt für Dauerdiagnosen und für jede Allergie. Die AMTS-Prüfung der Medikation
berücksichtigt die Allergienliste der ePA. Das ePA-Fenster zeigt die Listen als Lesesicht.

Der Ausbaustand ist in der Demo-Steuerung umschaltbar; im Release 3.1.3 antwortet der Dienst mit
404, und das Praxissystem sagt, dass es die Listen dort nicht gibt.

## Begründung

▸ Ein Dienst für beide Listen folgt dem österreichischen Vorbild:
Allergien sind nicht künstlich an die Medikation gebunden, Diagnosen bekommen denselben
Mechanismus. Die Operationen des Medication Service zu übernehmen, statt neue zu erfinden, hält
den Vorschlag anschlussfähig — Primärsysteme kennen das Muster aus dem dgMP.

▸ Die Liste ist die ärztlich verantwortete Auswahl, wie der Medikationsplan gegenüber der
Medikationsliste. Damit ist die Relevanzauswahl, um die es in der Debatte geht, kein zweiter
Dokumentationsschritt, sondern ein Kästchen im laufenden Vorgang — und die spätere Patient
Summary hat eine autorisierte Quelle.

▸ Die feste Kodierung (ändern ja, umkodieren nein) beantwortet eine der offenen
Governance-Fragen — widersprüchliche Angaben aus unterschiedlichen Quellen — für die Demo so, wie
es der dgMP für Medikamente tut. ⚠ Ob das für Diagnosen trägt, ist fachlich zu prüfen.

## Grenzen des Vorschlags

Nicht Teil der Demo: Erzeugung der Patient Summary aus den Listen (seit 0021 als Sicht umgesetzt), Zugriffsrechte je Berufsgruppe
(Apotheken schreiben?), Benachrichtigung
anderer Einrichtungen über Änderungen, Kodierservice als zentraler Dienst. Namen, Parameter und
Pfad sind Vorschläge; keiner davon ist spezifiziert.

## Verworfen

**Allergien im Medication Service** — belegt und nah am Konzept 3.1.0, aber fachlich
künstlich und ohne Platz für Diagnosen.
**Die Patient Summary als bearbeitbarer Datenbestand** — widerspricht dem Zielbild, nach dem sie
eine Sicht auf die Listen ist.
**Ein Dienst je Liste** — doppelte Mechanik ohne fachlichen Gewinn; e-Diagnose führt beide.
**Freie Namen für die Operationen** — hätte den Vorschlag vom dgMP gelöst und die
Anschlussfähigkeit verschenkt.
