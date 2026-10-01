# 0013 — ePA-Zugriffe nur nach Release 3.1.3

**Datum:** 10.09.2026 · **Status:** angenommen, Wege und Kopfzeilen ersetzt durch 0019 · **ersetzt Teile von:** 0002

## Zusammenhang

Eine Prüfung gegen die Spezifikation ergab, dass der Simulator Wege anbot, die es in der ePA
nicht gibt: eine FHIR-Suche nach Diagnosen und Allergien über `?patient=`, ein Einstellen von
Dokumenten per FHIR-POST, eine eigene Operation `$inhalt`, eigene Pfade für eML und eMP, einen
Planeintrag `$beenden` und zwei erfundene formatCodes. Der Header `X-Requesting-Organization`
wurde vom Praxissystem gesendet, obwohl ihn — nach damaligem Kenntnisstand — keine
Client-Schnittstelle vorsah (berichtigt in 0019: er ist Pflicht).

Eine Demo, die zeigen soll, „wie es wirklich wäre", verliert mit einem einzigen erfundenen
Weg ihre Aussagekraft — gerade in Gesprächen mit der gematik.

## Entscheidung

Der Simulator bietet nur Wege, die im Release **ePA 3.1.3** belegt sind. Jeder Weg trägt seine
Grundlage im Quelltext, in der Übersicht unter `GET /` und im Aufrufprotokoll des Praxissystems.

| Bereich          | Weg                                                                                                                                               | Grundlage                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Adressierung     | Header `x-insurantid`, dazu `x-useragent`, `X-Request-ID` (wird gespiegelt)                                                                       | OpenAPI ePA-Basic 3.1.3, Medication Service 3.0.2                |
| Dokumente suchen | `GET /epa/mhd/DocumentReference` (ITI-67)                                                                                                         | Konzept 3.1.3, `mhd_service.adoc` — ⚠ Basispfad nicht festgelegt |
| Dokument abrufen | `GET /epa/mhd/Binary/{id}` (ITI-68)                                                                                                               | Konzept 3.1.3                                                    |
| eML, eMP         | `$medication-list`, `$medication-plan` (GET und HEAD)                                                                                             | Funktion: Konzept 3.1.3; Namen: Konzept 3.1.0 ⚠                  |
| Schreiben        | `$provide-medication`, `$add-medication-information`, `$manage-medication-information`, `$manage-medication-plan`, `$medication-entered-in-error` | Konzept 3.1.0 ⚠                                                  |
| Chronologie      | `GET …/Provenance`                                                                                                                                | Konzept 3.1.3                                                    |
| formatCodes      | nur registrierte (31 Typen, übernommen aus ePA-XDS-Document)                                                                                      | `ePA-XDS-Document`, Branch ePA-3.1.3                             |

**Nicht nachgebildet, weil anders spezifiziert:** Einstellen von Dokumenten (nur XDS ITI-41,
SOAP), Einzelabfrage von Diagnosen, Allergien und Laborwerten (keine FHIR Data Services dafür
im Release), AMTS-rZI im Medication Service (im Release 3.1.3 zurückgestellt).

**Eine Ausnahme, schon in der Adresse gekennzeichnet:** ein Entwurfspfad für die serverseitige
Zerlegung von Dokumenten. Entfallen mit 0019.

## Begründung

▸ Die Einschränkung ist selbst eine Aussage: Im Release 3.1.3 muss jedes Primärsystem
strukturierte Dokumente abrufen und selbst zerlegen, um Diagnosen oder Allergien aus der ePA
zu zeigen. Genau diese Last ist ein Argument in der Debatte um die Patient Summary. Eine Demo
mit Einzelabfrage hätte sie verdeckt.

⚠ Die Operationsnamen stammen aus dem Konzept 3.1.0; das Konzept 3.1.3 beschreibt die
Funktionen ohne Namen. Das Konzept 3.1.0 ist bei den Lesewegen uneinheitlich
(`$medication-list` / `$get-medication-list`, `$get-medication-plan` / `$medication-plan`).
Der Datentyp des Standardparameters `performer` ist nur logisch beschrieben; die Demo sendet
eine Referenz mit Telematik-ID. Beides ist im Implementation Guide zu verifizieren.

## Verworfen

**Bequeme FHIR-Suche für alles** — schneller gebaut, aber falsch; sie hätte die Kernaussage
umgedreht.
**Erfundene formatCodes für Laborbefund und Entlassbrief** — ersetzt durch „kein formatCode":
Beide Typen sind im Release 3.1.3 nicht registriert, und genau das zeigt die Demo jetzt an.
