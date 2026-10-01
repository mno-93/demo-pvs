// Erzeugt aus daten/kataloge/schweregrade-diagnose.json — nicht von Hand ändern.
// Neu erzeugen mit: node werkzeuge/kataloge-erzeugen.mjs
import type { SnomedWerteintrag, Katalogkopf } from './typen.js';

export const schweregradeKopf: Katalogkopf = {
  "_katalog": "condition-severity",
  "_art": "veröffentlichte Werteliste, HL7 FHIR R4",
  "_hinweis": "Von Hand gepflegt. Drei SNOMED-CT-Konzepte für den Schweregrad einer Diagnose; deutsche Bezeichnungen sind Übersetzungen der Demo.",
  "_stand": {
    "quelle": "HL7 FHIR R4 4.0.1",
    "kanonisch": "http://hl7.org/fhir/ValueSet/condition-severity"
  }
};

export const schweregrade: readonly SnomedWerteintrag[] = [
  {
    "snomed": "24484000",
    "anzeigeEn": "Severe",
    "bezeichnung": "Schwer",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "required"
  },
  {
    "snomed": "6736007",
    "anzeigeEn": "Moderate severity",
    "bezeichnung": "Moderat",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "required"
  },
  {
    "snomed": "255604002",
    "anzeigeEn": "Mild",
    "bezeichnung": "Leichtgradig",
    "synonyme": [],
    "system": "http://snomed.info/sct",
    "bindung": "required"
  }
];
