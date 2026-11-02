/**
 * Wege der ePA und der Demo-Ersätze, die Praxissystem und Simulator gemeinsam nutzen — an einer
 * Stelle, damit beide Seiten nicht auseinanderlaufen. Jeder Weg folgt einem veröffentlichten
 * Implementation Guide (ADR 0013); ✦ Vorschläge liegen unter `/epa/vorschlag/…`.
 */
export const WEG = {
  /** MHD Service (`de.gematik.epa.mhd` 1.1.3): ITI-67. */
  mhd: '/epa/mhd/api/v1/fhir',
  /** MHD Service: ITI-68, Abruf eines Dokuments. */
  mhdAbruf: '/epa/mhd/retrieve/v1/content',
  /** Medication Service (`de.gematik.epa.medication` 1.4.0-ballot.1). */
  medikation: '/epa/medication/api/v1/fhir',
  /** Common Query API (`de.gematik.epa` 1.4.0-ballot.1). */
  query: '/epa/query/api/v1/fhir',
  /** Render API des Medication Service: Einstellung der Zwischenüberschriften. */
  renderEinstellung: '/epa/medication/render/v1/emp/settings',
  /** ePA-Basic: `setEntitlementPs`. */
  befugnis: '/epa/basic/api/v1/ps/entitlements',
  /** Information Service (`I_Information_Service` 1.5.1). */
  information: '/information/api/v1/ehr',
  /** ⚠ Demo-Ersatz des E-Rezept-Fachdienstes. */
  erp: '/erp',
  /** ⚠ Demo-Ersatz des KIM-Clientmoduls. */
  kim: '/kim/demo/clientmodul/smtp',
  /** ✦ Patient Summary (ADR 0021). */
  patientSummary: '/epa/vorschlag/patient-summary/api/v1/fhir',
  /** ✦ Diagnose-Service (ADR 0018). */
  diagnosedienst: '/epa/vorschlag/diagnosis/api/v1/fhir',
  /** ✦ Impfliste. */
  impfliste: '/epa/vorschlag/immunization/api/v1/fhir',
  /** ✦ Aktenlotse (ADR 0032). */
  aktenlotse: '/epa/vorschlag/aktenlotse/api/v1',
  /** ✦ Kontaktauskunft. */
  kontakt: '/epa/vorschlag/kontakt/api/v1',
} as const;

/**
 * Welche ePA der Simulator darstellt: das Release oder eine Stufe der Weiterentwicklung (ADR 0034).
 * Jede Stufe enthält die vorige.
 */
export type Ausbaustand =
  | 'release-3.1.3'
  | 'weiterentwicklung'
  | 'weiterentwicklung-2'
  | 'weiterentwicklung-3'
  | 'weiterentwicklung-4';

/** ✦ Kontakt einer Einrichtung für eine Rückfrage. */
export interface Kontakteintrag {
  name: string;
  telefon: string;
  /** Die Einrichtung ist für Versicherte über den TI-Messenger erreichbar (✦, Annahme). */
  tiMessenger: boolean;
}

let zaehler = 0;
/** Kennung, die im Ablauf eindeutig ist — für eine Demo ohne Nebenläufigkeit genug. */
export function neueId(praefix: string): string {
  zaehler += 1;
  return `${praefix}-${Date.now().toString(36)}-${zaehler}`;
}
