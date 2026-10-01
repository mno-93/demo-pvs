/** Ein Code aus einem Codesystem, wie ihn FHIR in `Coding` führt. */
export interface Kodierung {
  /** Kanonische Kennung des Codesystems. */
  system: string;
  code: string;
  anzeige: string;
}

export const CODESYSTEM = {
  icd10gm: 'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
  alphaId: 'http://fhir.de/CodeSystem/bfarm/alpha-id',
  snomed: 'http://snomed.info/sct',
  atc: 'http://fhir.de/CodeSystem/bfarm/atc',
  loinc: 'http://loinc.org',
  ops: 'http://fhir.de/CodeSystem/bfarm/ops',
} as const;

/**
 * Version für SNOMED-CT-Kodierungen: deutsche Edition, Stand 15.05.2026.
 *
 * Das TI-Common-Profil `ti-condition-diagnosis` 1.5.0 (Paket `de.gematik.ti` 1.5.0-ballot.1)
 * verlangt an der SNOMED-CT-Kodierung eine Versionsangabe (min 1). Diese Kennung führen die
 * veröffentlichten Pakete `de.gematik.ti` 1.5.0-ballot.1 und `de.gematik.epa.laboratory`
 * 1.0.0-ballot.1 durchgängig.
 */
export const SNOMED_VERSION = 'http://snomed.info/sct/11000274103/version/20260515';

/** Version für ICD-10-GM-Kodierungen. Der Katalogauszug der Demo folgt der Fassung 2026. */
export const ICD10GM_VERSION = '2026';
