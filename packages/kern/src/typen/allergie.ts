import type { Herkunft } from './herkunft.js';
import type { Kodierung } from './kodierung.js';

/**
 * Allergie oder Unverträglichkeit nach dem Informationsmodell der Patient Summary
 * (Arbeitsstand, Element „Allergie/Unverträglichkeit").
 *
 * Die Substanz ist 1..1 und über SNOMED CT gegen KBV_VS_AllergyIntolerance_Substance_SNOMED_CT gebunden
 * (extensible, 197 Konzepte). Reaktionen stehen als eigene Struktur mit Manifestationen aus
 * KBV_VS_AllergyIntolerance_Manifestation_SNOMED_CT (extensible, 37 Konzepte) und dem Expositionsweg aus
 * KBV_VS_Base_Route_of_Administration_SNOMED_CT (example).
 *
 * Nicht abgebildet sind ASK- und EMA-SPOR-Codes der Substanz und der zeitliche Verlauf der
 * Reaktion. Das Modell kennt für Allergien kein Feststellungsdatum, sondern einen klinisch
 * relevanten Zeitraum; dem folgt der Typ.
 */

/** Typ nach AllergyIntoleranceType (required). */
export type AllergieTyp = 'Allergie' | 'Unverträglichkeit';

export const ALLERGIETYP_CODE: Record<AllergieTyp, string> = {
  Allergie: 'allergy',
  Unverträglichkeit: 'intolerance',
};

/** Klinischer Status nach AllergyIntoleranceClinicalStatusCodes (required, 1..1). */
export type AllergieStatus = 'aktiv' | 'inaktiv' | 'behoben';

export const ALLERGIESTATUS_BEZEICHNUNG: Record<AllergieStatus, string> = {
  aktiv: 'Aktiv',
  inaktiv: 'Inaktiv',
  behoben: 'Behoben',
};

export const ALLERGIESTATUS_CODE: Record<AllergieStatus, string> = {
  aktiv: 'active',
  inaktiv: 'inactive',
  behoben: 'resolved',
};

/** Gewissheit nach AllergyIntoleranceVerificationStatusCodes (required, 4 Codes). */
export type Gewissheit = 'bestätigt' | 'unbestätigt' | 'widerlegt' | 'irrtümlich';

export const GEWISSHEIT_BEZEICHNUNG: Record<Gewissheit, string> = {
  bestätigt: 'Bestätigt',
  unbestätigt: 'Unbestätigt',
  widerlegt: 'Widerlegt',
  irrtümlich: 'Irrtümliche Eingabe',
};

export const GEWISSHEIT_CODE: Record<Gewissheit, string> = {
  bestätigt: 'confirmed',
  unbestätigt: 'unconfirmed',
  widerlegt: 'refuted',
  irrtümlich: 'entered-in-error',
};

/** Kritikalität nach AllergyIntoleranceCriticality (required). */
export type Kritikalitaet = 'niedriges Risiko' | 'hohes Risiko' | 'Risiko nicht einschätzbar';

export const KRITIKALITAET_CODE: Record<Kritikalitaet, string> = {
  'niedriges Risiko': 'low',
  'hohes Risiko': 'high',
  'Risiko nicht einschätzbar': 'unable-to-assess',
};

/** Wirkstoffkategorie nach AllergyIntoleranceCategory (required, 0..*). */
export type Wirkstoffkategorie = 'Lebensmittel' | 'Medikation' | 'Umwelt/Chemikalie' | 'Biologisch';

export const WIRKSTOFFKATEGORIE_CODE: Record<Wirkstoffkategorie, string> = {
  Lebensmittel: 'food',
  Medikation: 'medication',
  'Umwelt/Chemikalie': 'environment',
  Biologisch: 'biologic',
};

/** Schweregrad einer Reaktion nach AllergyIntoleranceSeverity (required). */
export type Reaktionsschweregrad = 'leicht' | 'mittelschwer' | 'schwer';

export const REAKTIONSSCHWEREGRAD_BEZEICHNUNG: Record<Reaktionsschweregrad, string> = {
  leicht: 'Leicht',
  mittelschwer: 'Mittelschwer',
  schwer: 'Schwer',
};

export const REAKTIONSSCHWEREGRAD_CODE: Record<Reaktionsschweregrad, string> = {
  leicht: 'mild',
  mittelschwer: 'moderate',
  schwer: 'severe',
};

export interface Reaktion {
  /** Mindestens eine Manifestation (1..* im Modell). */
  manifestationen: Kodierung[];
  schweregrad: Reaktionsschweregrad | null;
  /** Ereignisdatum der Reaktion (ISO), sonst null. */
  datum: string | null;
  expositionsweg: Kodierung | null;
}

export interface Allergie {
  id: string;
  patientId: string;
  /** Bezeichnung der auslösenden Substanz. */
  substanz: string;
  /** SNOMED CT aus KBV_VS_AllergyIntolerance_Substance_SNOMED_CT, bei Freitext null. */
  snomed: Kodierung | null;
  typ: AllergieTyp;
  kategorien: Wirkstoffkategorie[];
  gewissheit: Gewissheit;
  kritikalitaet: Kritikalitaet;
  reaktionen: Reaktion[];
  klinischerStatus: AllergieStatus;
  /** Klinisch relevanter Zeitraum, von (ISO), sonst null. */
  beginn: string | null;
  /** Klinisch relevanter Zeitraum, bis (ISO), sonst null. */
  ende: string | null;
  /** Wann der Eintrag im Praxissystem dokumentiert wurde (ISO). */
  dokumentiertAm: string;
  feststellendePerson: string | null;
  notiz: string | null;
  herkunft: Herkunft;
  /** Verknüpfung mit dem Eintrag der Allergienliste der ePA (✦ Diagnose-Service). */
  epaId: string | null;
  epaFassung: string | null;
}

/** Lesbare Kurzfassung der Reaktionen, etwa für den Verlauf der Karteikarte. */
export function reaktionenAlsText(reaktionen: readonly Reaktion[]): string {
  return reaktionen
    .map((r) => {
      const teile = r.manifestationen.map((m) => m.anzeige).join(', ');
      return r.schweregrad
        ? `${teile} (${REAKTIONSSCHWEREGRAD_BEZEICHNUNG[r.schweregrad].toLowerCase()})`
        : teile;
    })
    .filter(Boolean)
    .join('; ');
}
