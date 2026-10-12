# 0038 — Arztbrief: strukturiert schreiben, über ITI-41 einstellen, per KIM senden

**Datum:** 12.10.2026 · **Status:** angenommen · **ergänzt:** 0013, 0033, 0034

## Zusammenhang

Bisher las die Demo Dokumente nur: über MHD ITI-67 und ITI-68. Ein Praxissystem schreibt aber
täglich Briefe. Sie gehen per KIM an die mitbehandelnde Einrichtung und zunehmend auch in die ePA.
Drei Fragen standen offen:

- **Wie kommt ein Dokument in die ePA?** Laut Konzept 3.1.3 nur über den XDS Document Service
  (ITI-41, SOAP). Der MHD Service ist lesend.
- **Was nimmt die ePA heute an?** Der Implementation Guide des eArztbriefs (`ig-eab.json`, CDA,
  `urn:gematik:ig:Arztbrief:r3.1`) ist seit dem 01.04.2026 nur noch lesbar
  (`clientReadOnlyFromDate`). Für einen strukturierten Brief nach FHIR gibt es keinen
  registrierten formatCode.
- **Wie geht ein Brief per KIM?** Als gewöhnliche Mail an das Clientmodul (`gemSpec_CM_KOMLE`
  1.16.6), mit `X-KIM-Dienstkennung: Arztbrief;VHitG-Versand;V1.2` (PDF und optional strukturierte
  Anhänge).

## Entscheidung

1. **✦ Arztbrief als FHIR-Dokument** nach dem Aufbau des MIO KH-Entlassbrief 1.0.0 (Entwurf):
   Composition mit Abschnitten und Erzähltext. Diagnosen und Allergien stehen als Einträge aus
   denselben Abbildungen wie die ePA-Listen, die Medikation als MedicationStatement. Ambulante
   Abweichungen sind als ✦ markiert: Typ LOINC 11488-4, `AMB` und eine Empfänger-Extension.
2. **Die Druckansicht entsteht aus dem FHIR-Dokument** (`briefAusFhir`). Vorschau, PDF für KIM
   und die Textebene für den Aktenlotsen sind derselbe Text.
3. **Einstellen über ITI-41** am Endpunkt der WSDL, SOAP 1.2, mit Metadaten nach IHE ITI TF-3
   4.2. Die entryUUID vergibt das Praxissystem, der MHD Service findet das Dokument darunter.
   Der Simulator prüft Aktion, Patientenkennung, Inhalt, Pflichtcodes, formatCode und uniqueId.
   Registrierte Dokumenttypen gelten nur innerhalb von `validFromDate` und
   `clientReadOnlyFromDate`.
4. **✦ formatCode im Namensraum der Demo**, angenommen ab „Weiterentwicklung 2" — der Stufe, ab
   der die ePA strukturierte Briefe kennt.
5. **KIM über einen Demo-Ersatz des Clientmoduls:** die Client-Mail Byte für Byte als
   `message/rfc822` per HTTP, Antwort mit SMTP-Statuscode. Anhänge: PDF (alle Inhalte) und ✦ das
   FHIR-Dokument.
6. **Das Modul erscheint mit der Patient Summary** („Weiterentwicklung 3") als Reiter
   „Arztbrief ✦".
7. **Wenig schreiben:** Dauerdiagnosen, aktive Allergien, Befunde der letzten 90 Tage, der
   jüngste Laborbefund (lokal oder aus der ePA) und der Medikationsplan der ePA sind
   vorausgewählt. Selbst geschrieben werden Fragestellung, Beurteilung und Empfehlungen. Zwei
   Marker zählen beides.

## Begründung

▸ Der strukturierte Brief ist der Zulieferer der Patient Summary. Wer Diagnosen und Allergien im
Brief aus denselben Abbildungen schreibt wie in die Listen, schafft keine zweite Wahrheit.

▸ Ein Brief, zwei Wege — das ist auch die Empfehlung der KBV an die Praxen (Praxisinformation
eArztbrief, Mai 2026): weiter per KIM versenden, auch wenn der Brief zusätzlich in die ePA
gestellt wird.

▸ ITI-41 statt eines erfundenen FHIR-Schreibwegs: Die Demo zeigt, was ein Praxissystem heute
bauen muss, und wo die Lücke liegt — beim formatCode, nicht beim Transport.

## Folgen

- Der Dokumenttypen-Katalog führt jetzt `gueltigAb` und `nurLesbarAb` aus den Implementation
  Guides; `werkzeuge/formatcodes-aus-xds.mjs` übernimmt sie.
- Für den Versand wird GOP 86900 erfasst (EBM-Auszug ergänzt).
- ⚠ Nicht nachgebildet: QES mit dem eHBA, der CDA-Anteil des eArztbriefs, MTOM/XOP, S/MIME,
  Verzeichnisdienst (die Demo führt ein Adressbuch), Anhangsdienst über 15 MiB,
  Eingangsbestätigung.
- ⚠ Ob die KBV-Spezifikation „KIM eArztbrief" V1.2.2 einen FHIR-Anhang zulässt, ist nicht geprüft.
  Sie ist nicht öffentlich.

## Verworfen

**Nur PDF in die ePA** — entspricht dem heutigen Stand. Dann bleibt der Brief für Patient Summary
und Listen stumm, und genau das soll die Weiterentwicklung ändern.

**Einstellen über MHD (ITI-65)** — in der ePA 3.1.3 nicht vorgesehen; wäre ein erfundener Weg.

**CDA nach VHitG erzeugen** — seit 01.04.2026 nimmt die ePA ihn nicht mehr an, und er führt nicht
zur europäischen Richtung.

**Nur KIM** — die ePA bekäme den Brief nie, die Versicherte sähe ihn nicht.
