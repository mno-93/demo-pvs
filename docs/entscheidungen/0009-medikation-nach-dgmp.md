# 0009 — Medikation nach dem digital gestützten Medikationsprozess

**Datum:** 09.09.2026 · **Status:** angenommen · **Ressourcen und Operationen fortgeschrieben durch:** 0019 (Planeinträge als EMP-MedicationRequest nach IG 1.3.5)

## Entscheidung

Das Medikationsmodul bildet die beiden Ebenen des dgMP getrennt ab: die **elektronische
Medikationsliste** aus `MedicationRequest` und `MedicationDispense`, die ohne Zutun
entsteht, und den **elektronischen Medikationsplan** aus `MedicationStatement`, der nur
durch eine ärztliche Handlung entsteht. Beide Sichten greifen auf denselben
Ressourcenbestand des Simulators zu.

Übernommen sind die Festlegungen des Medication Service, soweit sie im Konzept belegt
sind:

- Die **Versionsangabe der ATC-de-Kodierung ist verpflichtend**; ohne sie antwortet der
  Dienst mit **422**.
- Ein zu großer `X-Requesting-Organization` führt zu **431** — mit JSON-Körper, nicht mit
  einem `OperationOutcome`.
- Es gibt **keine physische Löschung**. Ein Eintrag wird auf `entered-in-error` gesetzt,
  bleibt sichtbar und behält seine Historie; zugehörige Verweise werden bereinigt.
- Jede Änderung erhöht die Fassungsnummer.

## Begründung

Die Medikation ist den Weg, der für die Patient Summary vorgeschlagen ist, bereits
gegangen: erst ein automatisch abgeleiteter Bestand, dann eine ärztlich verantwortete Ebene
darüber. ▸ Damit ist das Modul nicht nur ein Baustein des Praxissystems, sondern das
belastbarste verfügbare Vorbild für die Architekturentscheidung — und zwar eines, das man
vorführen kann.

Die Fehlerfälle sind mit Absicht bedienbar. Dass eine fehlende Versionsangabe einen Eintrag
scheitern lässt, ist fachlich eine Kleinigkeit und in der Umsetzung ein Ablehnungsgrund —
genau die Art von Detail, die in Spezifikationsgesprächen unterschätzt wird.

## Verworfen

**Nur den Medikationsplan abbilden** — verlöre die Unterscheidung, um die es geht.
**Fehlerfälle auslassen** — ein Dienst, der immer annimmt, führt Implementierende in die Irre.
