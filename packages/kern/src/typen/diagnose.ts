import type { Herkunft } from './herkunft.js';
import type { Kodierung } from './kodierung.js';

/**
 * Diagnose nach dem Informationsmodell der Patient Summary (Element „Diagnose").
 *
 * Die Codierung ist 1..1, aber mehrfach belegbar: ICD-10-GM, Alpha-ID, SNOMED CT und
 * Orphanet stehen nebeneinander. Das Praxissystem führt die ICD-10-GM für die Abrechnung,
 * die Patient Summary braucht SNOMED CT für den europäischen Austausch. Der Kodierservice
 * hinterlegt beides in einem Schritt.
 *
 * Nicht abgebildet sind die Modellelemente Stadium, Fachliche:r Ansprechpartner:in,
 * Externe Referenzen, der Orphanet-Code und das Codierungskennzeichen der ICD-10-GM.
 * Die Bezeichnungen der Codes folgen der Spalte „Konzept" des Modells.
 */

/**
 * ICD-Diagnosesicherheit — im Modell ein Unterelement des ICD-10-GM-Codes, in FHIR eine
 * Extension an der ICD-Kodierung. Nicht zu verwechseln mit der Diagnosesicherheit der
 * Diagnose selbst (ConditionVerificationStatus).
 */
export type Zusatzkennzeichen = 'G' | 'V' | 'Z' | 'A';

export const ZUSATZKENNZEICHEN_BEZEICHNUNG: Record<Zusatzkennzeichen, string> = {
  G: 'gesicherte Diagnose',
  V: 'Verdacht auf',
  Z: 'Zustand nach',
  A: 'ausgeschlossen',
};

export type Seitenlokalisation = 'R' | 'L' | 'B';

export const SEITENLOKALISATION_BEZEICHNUNG: Record<Seitenlokalisation, string> = {
  R: 'rechts',
  L: 'links',
  B: 'beidseitig',
};

/** Kategorie nach ConditionCategoryCodes (required). */
export type Diagnoseart = 'dauer' | 'akut';

export const DIAGNOSEART_BEZEICHNUNG: Record<Diagnoseart, string> = {
  dauer: 'Dauerdiagnose',
  akut: 'Akutdiagnose',
};

export const DIAGNOSEART_CODE: Record<Diagnoseart, string> = {
  dauer: 'problem-list-item',
  akut: 'encounter-diagnosis',
};

/** Klinischer Status nach ConditionClinicalStatusCodes (required, 6 Codes). */
export type KlinischerStatus =
  'aktiv' | 'wiederauftreten' | 'rezidiv' | 'inaktiv' | 'remission' | 'behoben';

export const KLINISCHER_STATUS_BEZEICHNUNG: Record<KlinischerStatus, string> = {
  aktiv: 'Aktiv',
  wiederauftreten: 'Wiederauftreten',
  rezidiv: 'Rezidiv',
  inaktiv: 'Inaktiv',
  remission: 'Remission',
  behoben: 'Behoben',
};

export const KLINISCHER_STATUS_CODE: Record<KlinischerStatus, string> = {
  aktiv: 'active',
  wiederauftreten: 'recurrence',
  rezidiv: 'relapse',
  inaktiv: 'inactive',
  remission: 'remission',
  behoben: 'resolved',
};

/** Ist die Erkrankung derzeit gegenwärtig? Aktiv, Wiederauftreten und Rezidiv. */
export function istGegenwaertig(status: KlinischerStatus): boolean {
  return status === 'aktiv' || status === 'wiederauftreten' || status === 'rezidiv';
}

/** Diagnosesicherheit nach ConditionVerificationStatus (required, 6 Codes). */
export type Diagnosesicherheit =
  'gesichert' | 'vorläufig' | 'differential' | 'unbestätigt' | 'ausgeschlossen' | 'irrtümlich';

export const DIAGNOSESICHERHEIT_BEZEICHNUNG: Record<Diagnosesicherheit, string> = {
  gesichert: 'Gesicherte Diagnose',
  vorläufig: 'Vorläufige Diagnose',
  differential: 'Differentialdiagnose',
  unbestätigt: 'Unbestätigte Diagnose',
  ausgeschlossen: 'Ausgeschlossene Diagnose',
  irrtümlich: 'Irrtümliche Eingabe',
};

export const DIAGNOSESICHERHEIT_CODE: Record<Diagnosesicherheit, string> = {
  gesichert: 'confirmed',
  vorläufig: 'provisional',
  differential: 'differential',
  unbestätigt: 'unconfirmed',
  ausgeschlossen: 'refuted',
  irrtümlich: 'entered-in-error',
};

/**
 * Vorbelegung der Diagnosesicherheit aus dem Zusatzkennzeichen. Beide Angaben stehen im
 * Modell nebeneinander; die Vorbelegung erspart die doppelte Eingabe, die Auswahl bleibt
 * änderbar.
 */
export function sicherheitAusZusatzkennzeichen(zusatz: Zusatzkennzeichen): Diagnosesicherheit {
  if (zusatz === 'V') return 'vorläufig';
  if (zusatz === 'A') return 'ausgeschlossen';
  return 'gesichert';
}

/** „Zustand nach" ist eine behobene Erkrankung; alle anderen Kennzeichen beginnen aktiv. */
export function statusAusZusatzkennzeichen(zusatz: Zusatzkennzeichen): KlinischerStatus {
  return zusatz === 'Z' ? 'behoben' : 'aktiv';
}

export interface Diagnose {
  id: string;
  patientId: string;
  fallId: string | null;
  /** ICD-10-GM-Diagnosecode — geführt für die Abrechnung. */
  code: string;
  bezeichnung: string;
  /** SNOMED CT aus dem Kodierservice. Liegt es vor, ist die Diagnose mehrfach kodiert. */
  snomed: Kodierung | null;
  alphaId: string | null;
  /** ICD-Diagnosesicherheit (Unterelement des ICD-10-GM-Codes). */
  zusatzkennzeichen: Zusatzkennzeichen;
  /** ICD-Seitenlokalisation (Unterelement des ICD-10-GM-Codes). */
  seitenlokalisation: Seitenlokalisation | null;
  diagnosesicherheit: Diagnosesicherheit;
  art: Diagnoseart;
  klinischerStatus: KlinischerStatus;
  /** Schweregrad als SNOMED-CT-Konzept aus ConditionDiagnosisSeverity. */
  schweregrad: Kodierung | null;
  /** Körperstelle als Bezeichnung; die SNOMED-CT-Kodierung ist in der Demo nicht belegt. */
  koerperstelle: string | null;
  /** Klinisch relevanter Zeitraum, von (ISO). */
  beginn: string;
  /** Klinisch relevanter Zeitraum, bis (ISO), sonst null. */
  ende: string | null;
  /** Feststellungsdatum (ISO). */
  festgestelltAm: string | null;
  /** Dokumentationsdatum (ISO). */
  dokumentiertAm: string;
  feststellendePerson: string | null;
  notiz: string | null;
  herkunft: Herkunft;
  /**
   * Verknüpfung mit dem Eintrag in der Diagnosenliste der ePA (✦ Diagnose-Service,
   * Weiterentwicklung nach ADR 0018). Die Liste ist die ärztlich verantwortete Auswahl — wie
   * der Medikationsplan neben der Medikationsliste — und die autorisierte Quelle der
   * späteren Patient Summary. Null, solange die Diagnose nur im Praxissystem geführt wird.
   */
  epaId: string | null;
  /** Fassung des ePA-Eintrags beim letzten Abgleich — daran zeigt sich eine Änderung dort. */
  epaFassung: string | null;
}
