# 0019 — Konformität mit den veröffentlichten Implementation Guides

**Datum:** 27.09.2026 · **Status:** angenommen · **ersetzt Teile von:** 0013, 0018

## Zusammenhang

0013 legte die ePA-Wege nach den Konzepten 3.1.0 und 3.1.3 fest; Operationsnamen und Parameter
waren dort nur logisch beschrieben und als ⚠ markiert. Inzwischen liegen die Implementation Guides
vor: `de.gematik.epa` 1.3.2, `de.gematik.epa.medication` 1.3.5, `de.gematik.epa.mhd` 1.1.3, dazu
der Content-IG `de.gematik.epa.laboratory` 1.0.0-ballot.1 und `de.gematik.ti` 1.5.0-ballot.1.
Ein Abgleich ergab:

- Die Operationen des Medication Service heißen anders (`$add-emp-entry`, `$update-emp-entry`,
  `$link-emp`, `$medication-plan-log` …), und statt eines Parameters `performer` gilt der
  Lesenachweis `acknowledgedChronologyId` über Chronologieeinträge (Provenance).
- `X-Requesting-Organization` ist **Pflicht** an den FHIR Data Services (IG 1.3.2, Generelle
  Prinzipien). 0013 hatte ihn gestrichen, weil er in keiner Client-Schnittstelle stehe — das war
  falsch.
- Der MHD Service hat feste Pfade (`/epa/mhd/api/v1/fhir`, `/epa/mhd/retrieve/v1/content`),
  eigene Profile und eine Volltextsuche über `_content`.
- Laborbefunde liegen im Release 3.1.3 als PDF vor; der strukturierte Befund gehört zur
  Vorschau auf ePA 3.2.
- Der Pfad `/epa/dglp-entwurf` bildete eine serverseitige Zerlegung nach einem nicht
  veröffentlichten Entwurf nach.

## Entscheidung

1. Der Simulator folgt den genannten IGs in Pfaden, Operationen, Parametern, Profilen und
   Fehlercodes. Die Details stehen in [SPEZIFIKATION.md](../SPEZIFIKATION.md), Abschnitt 5.
2. Jede schreibende Operation verlangt `X-Requesting-Organization` und den aktuellen
   Chronologieeintrag; sonst 422/403/431 bzw. 409.
3. Laborbefund und Entlassbrief liegen im Ausbaustand „Release 3.1.3" als PDF, in der
   „Weiterentwicklung" strukturiert. Das PVS zeigt PDFs im ePA-Fenster an.
4. Der Entwurfspfad `/epa/dglp-entwurf` entfällt.
5. Der ✦ Diagnose-Service (0018) übernimmt das Muster des Medication Service 1.3.5:
   `$condition-list`, `$add-condition-entry`, `$update-condition-entry` usw., Lesenachweis und
   Chronologie wie beim eMP, Berichtigung über `$update-…-entry`. Die Einschränkung
   „Berichtigung nur durch die anlegende Einrichtung" entfällt, weil der IG 1.3.5 sie für den eMP
   nicht kennt. Eigene Kennzeichen liegen im Namensraum `https://example.org/demo-pvs/fhir/`.
6. Der Simulator ist als Funktion `simulatorBauen()` aufgebaut und wird in Tests über `inject`
   geprüft — ohne laufenden Dienst.

## Begründung

Eine Demo, die in Gesprächen mit Herstellern und der gematik bestehen soll, muss dieselben Namen
sprechen wie die IGs. ▸ Der Lesenachweis ist zugleich fachlich interessant: Er zeigt, wie ein
zentraler Bestand mit mehreren schreibenden Einrichtungen umgeht, und ist damit das Vorbild für
die Listen der Patient Summary.

## Verworfen

**Bei den Konzeptnamen bleiben** — hätte die Demo gegen den Stand der IGs veralten lassen.
**`X-Requesting-Organization` nur im Simulator vorsehen** — der IG verlangt ihn vom Client.
**Den Entwurfspfad als Ausblick behalten** — er beruht auf nicht veröffentlichtem Material.
