/** Kopfangaben, die jeder Katalogauszug mitführt — Herkunft und Einschränkung. */
export interface Katalogkopf {
  _katalog?: string;
  _art?: string;
  _hinweis?: string;
  [weitere: string]: unknown;
}

export interface IcdEintrag {
  code: string;
  bezeichnung: string;
  gruppe: string;
}

export interface EbmEintrag {
  ziffer: string;
  bezeichnung: string;
  hinweis: string;
}

/** Orientierungswerte zur Nierenfunktion. Vereinfacht, siehe Kopfzeile des Katalogs. */
export interface Nierengrenze {
  /** Unterhalb dieser eGFR ist zu prüfen. */
  warnungAb: number;
  /** Unterhalb dieser eGFR gilt das Mittel als kontraindiziert. */
  kontraindiziertAb: number | null;
  text: string;
}

export interface ArzneimittelEintrag {
  pzn: string;
  wirkstoff: string;
  atc: string;
  /**
   * Versionsangabe der ATC-de-Kodierung. Im Medication Service verpflichtend, weil die
   * Eindeutigkeit einer Kodierung über Versionen hinweg nicht sichergestellt ist
   * (`EPAMedication`, `code.coding:atc-de.version` 1..1).
   */
  atcVersion: string;
  nierengrenze: Nierengrenze | null;
  staerke: string;
  darreichung: string;
  bezeichnung: string;
  /** Gruppen, gegen die eine dokumentierte Allergie eine Warnung auslöst. */
  allergiegruppen: string[];
  warnhinweis: string;
}

export interface LoincEintrag {
  loinc: string;
  bezeichnung: string;
  einheit: string;
  referenz: string;
  gruppe: string;
}

/**
 * Eintrag einer veröffentlichten SNOMED-CT-Werteliste (etwa
 * KBV_VS_AllergyIntolerance_Substance_SNOMED_CT). Übernommen, nicht nachgebildet.
 */
export interface SnomedWerteintrag {
  snomed: string;
  anzeigeEn: string;
  bezeichnung: string;
  synonyme: string[];
  system: string;
  bindung: string;
}

/**
 * Eintrag des Kodierservice: Aus einem Suchbegriff werden SNOMED CT und ICD-10-GM zugleich
 * hinterlegt — nach dem Vorbild des zentralen Kodierservice in Österreich.
 */
export interface KodierserviceEintrag {
  snomed: string;
  anzeigeEn: string;
  begriff: string;
  synonyme: string[];
  icd10gm: string;
  alphaId: string | null;
  /** Aus dem Gedächtnis ergänzt und besonders zu verifizieren. */
  unsicher: boolean;
  hinweis: string | null;
}

/**
 * Brücke von einer auslösenden Substanz (SNOMED CT) zu den ATC-Codes der Arzneimittel, die
 * sie enthalten oder zu ihrer Gruppe gehören. Ein Prüfhilfsmittel für die AMTS, keine
 * Übersetzung — deshalb wird sie nie in eine FHIR-Ressource geschrieben.
 */
export interface AmtsZuordnungEintrag {
  snomed: string;
  bezeichnung: string;
  /** ATC-Codes oder -Präfixe; ein Präfix trifft die ganze Gruppe. */
  atc: string[];
  /** Wie die Zuordnung entstanden ist: über den Wirkstoffnamen oder von Hand als Gruppe. */
  weg: string;
  hinweis: string | null;
}

export interface DokumentKodewert {
  code: string | null;
  system: string | null;
  anzeige: string | null;
}

/** Im XDS Document Service registrierter Dokumenttyp (aus ePA-XDS-Document übernommen). */
export interface DokumenttypEintrag {
  datei: string;
  bezeichnung: string;
  element: string;
  formatCode: string;
  formatSystem: string | null;
  formatAnzeige: string;
  mimeTypes: string[];
  classCode: DokumentKodewert | null;
  typeCode: DokumentKodewert | null;
}

/** Impfstoff mit den Krankheiten, gegen die er schützt (SNOMED CT). */
export interface ImpfstoffEintrag {
  pzn: string;
  bezeichnung: string;
  atc: string;
  atcVersion: string;
  zielkrankheiten: { code: string; anzeige: string }[];
}
