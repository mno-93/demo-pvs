# 0033 — Arzt- und Entlassbriefe wie in der Versorgung: PDF heute, ✦ FHIR nach europäischem Vorbild

**Datum:** 06.10.2026 · **Status:** angenommen · **ergänzt:** 0013, 0031

## Zusammenhang

Die Briefe des Startbestands waren Platzhalter: ein Entlassbrief als einseitiges PDF mit
Stichworten, ein Befundbericht als CDA-XML mit sechs Absätzen. Die Demo behauptete damit mehr
Struktur und weniger Text, als in der Akte tatsächlich liegt — und unterschätzte so genau das, was
sie zeigen soll: wie viel Inhalt heute in Fließtext steckt und für Listen und Patient Summary
verloren ist.

Belege:

- **Richtlinie elektronischer Brief** der KBV (§ 383 SGB V, Fassung vom 17.05.2024, Abschnitt 2.1):
  Ein elektronischer Brief besteht mindestens aus einer **PDF/A-Datei**, die **alle**
  Informationen des Briefs enthält, und einer XML-Datei nach dem VHitG-Leitfaden „Arztbrief" auf
  Basis von CDA R2 (Version 1.50), deren `body` **leer sein darf**.
- **MIO Krankenhaus-Entlassbrief 1.0.0** (`KBV_PR_MIO_KHE_Composition`, Simplifier `khe`):
  Gliederung in Einweisung, Aufnahme, Anamnese, Diagnosen, Allergien, Prozeduren, Implantate,
  Verlauf, Entlassung; Abschnittscodes überwiegend SNOMED CT, Ableitung von der KBV-Basis.
- **HL7 Europe Hospital Discharge Report** (`hl7.fhir.eu.hdr`, CI-Build 1.0.0 vom 30.09.2026;
  veröffentlicht ist nur 0.1.0-ballot): `Composition.type` LOINC 34105-7, `encounter` 1..1,
  23 Abschnitte mit LOINC-Codes, alle 0..1; inhaltliche Einträge über EU Core.

## Entscheidung

1. **Im Release 3.1.3 liegen alle Briefe als PDF vor**, mit Briefkopf, Anschrift, Anrede,
   Abschnitten in Fließtext, Gruß und Seitenzahl — mehrseitig, mit echter Textebene
   (`kern/fachlogik/pdf.ts`, `briefPdfErzeugen`). Das PVS zeigt sie nur als PDF.
2. **Ambulante Arztbriefe** folgen dem Aufbau eines Befundberichts (Diagnosen, Anamnese, Befunde,
   Beurteilung, Procedere). In der Akte liegt das PDF/A; ⚠ ob und wie der CDA-Teil eines
   eArztbriefs in die ePA gelangt, ist nicht geprüft. Der formatCode für PDF/A-2, das die
   Richtlinie verlangt, ist im übernommenen Katalog nicht belegt; die Demo führt PDF/A-1.
3. **Ab „Weiterentwicklung 2" liegen neue Briefe zusätzlich strukturiert vor (✦)** (seit ADR 0034; zuvor ab Stufe 1) — der
   Entlassbrief vom Juli 2026 und der Kontrollbefund, den die Kardiologie über die Demo-Steuerung
   einstellt. **Ältere Briefe bleiben PDF**: der Entlassbrief von 2019 und der Befundbericht vom
   Juni 2026. So liegen beide Welten nebeneinander, wie es nach einer Einführung wäre.
4. **Das FHIR-Dokument folgt dem europäischen Vorbild**: `Composition.type` LOINC 34105-7 wie
   `composition-eu-hdr`, dazu SNOMED CT 373942005 wie das MIO KH-E; `encounter` 1..1; Abschnitte
   mit den LOINC-Codes des HDR und den Überschriften des MIO KH-E, jeder mit Erzähltext;
   Diagnosen, Allergien, Prozeduren, Implantate und Entlassmedikation zusätzlich als Einträge.
   Profilkonformität wird nicht behauptet.
5. **Laborwerte stehen im Brief nur als Text.** Strukturiert kommen sie aus dem Laborbefund nach
   dgLP — sonst stünde derselbe Wert zweimal in der Patient Summary.
6. Brieftext und FHIR-Inhalt entstehen aus **einer Quelle** (`epa-sim/src/briefe.ts`), damit PDF
   und strukturierte Fassung nicht auseinanderlaufen.

## Begründung

▸ **Die Demo soll die Lücke zeigen, nicht verkleinern.** Ein realistischer Entlassbrief trägt
acht Diagnosen, drei Prozeduren und ein Implantat — als Text. Erst mit der strukturierten Fassung
erreichen sie Patient Summary und Listen, und erst dann wird sichtbar, dass „automatisch" auch
„ungefiltert" heißt: Die automatisch gebildete Patient Summary übernimmt sieben aktive Diagnosen
aus dem Brief, die geführte zeigt zwei markierte.

▸ **Europäisches Vorbild statt Eigenbau.** Für strukturierte Arzt- und Entlassbriefe gibt es keine
verbindliche nationale Vorgabe; erarbeitet werden soll sie nach europäischem Vorbild. Die Demo
nimmt das vorweg, ohne eine Festlegung vorzutäuschen: Codes aus dem HDR, Überschriften aus dem
MIO, Kennzeichnung ✦.

## Folgen

- Volltextsuche und ✦ Aktenlotse lesen mehr: Der Lotse meldet für Frau Hoffmann „6 von 7
  Unterlagen gelesen" (vorher 4 von 5) und findet mehr Vorschläge für die Listen.
- Die automatisch gebildete Patient Summary zeigt sieben Diagnosen und drei Prozeduren aus dem
  Entlassbrief; die behobene Obstipation fällt weg, die bei Abfassung noch behandelte
  Harnwegsinfektion nicht.
- Der ältere Entlassbrief führt „Allergien sind nicht bekannt" — Stand 2019. Ein Dienst, der
  Dokumente ausliest, sieht beide Stände nebeneinander.
- ⚠ OPS 3-052 und 3-222, LOINC 11488-4 und 42349-1 sowie SNOMED CT 40701008 sind nicht gegen
  amtliche Kataloge oder einen Terminologieserver geprüft.

## Verworfen

**Den eArztbrief als CDA mit gefülltem Body belassen** — die Richtlinie erlaubt den leeren Body, und
der Inhalt steht im PDF/A. Ein CDA-Brief mit strukturiertem Text zeichnete ein zu gutes Bild.

**Alle Briefe ab der Weiterentwicklung strukturiert** — so wäre es nie: Was vor einer Einführung
geschrieben wurde, bleibt, wie es ist.

**Das MIO KH-E unverändert nachbauen** — es leitet von der KBV-Basis ab und hat keine Berührung mit
der europäischen Ableitungskette; eine Weiterentwicklung folgt dem HDR.
