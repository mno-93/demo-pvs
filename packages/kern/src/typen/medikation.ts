/**
 * Medikation nach dem digital gestützten Medikationsprozess.
 *
 * Zwei Bestände sind auseinanderzuhalten, und ihre Unterscheidung ist der Kern des
 * Verfahrens:
 *
 * - Die **elektronische Medikationsliste (eML)** entsteht automatisch aus Verordnungs-
 *   und Abgabedaten. Sie ist vollständig in dem, was verordnet und abgegeben wurde, aber
 *   sie ist nicht ärztlich verantwortet: Sie weiß nicht, was tatsächlich eingenommen wird.
 * - Der **elektronische Medikationsplan (eMP)** ist die ärztlich verantwortete Auswahl.
 *   Er entsteht nicht von selbst, sondern durch eine Handlung.
 *
 * Dasselbe Verhältnis ist für die Patient Summary vorgeschlagen — automatisch
 * abgeleiteter Bestand plus ärztlich verantwortete Ebene darüber. Die Medikation ist
 * diesen Weg bereits gegangen und deshalb das belastbarste Vorbild.
 */

import type { Dosierung, EmpKategorie } from '../fachlogik/dosierung.js';

/**
 * Eine Medikationsangabe, wie sie Brief, Patient Summary und Plan teilen: Arzneimittel mit
 * Kodierung, Dosierung als Text und Grund. ATC und PZN sind optional — kodiert wird, was
 * bekannt ist; die Bezeichnung steht immer da.
 */
export interface Medikationsangabe {
  bezeichnung: string;
  /** ATC-de; ohne `atcVersion` nicht eindeutig. */
  atc: string | null;
  atcVersion?: string | null;
  pzn?: string | null;
  /** Dosierungstext — bei strukturierter Dosierung der erzeugte Text nach Algorithmus 2.0.0. */
  dosierung: string;
  grund: string | null;
}

/**
 * Status eines eMP-Eintrags nach `EMPMedicationRequest` (IG Medication Service 1.4.0-ballot.1):
 * aktiv und pausiert gehören zum gültigen Plan; beendet, abgesetzt und fehlerhaft nicht.
 */
export type EmpStatus = 'aktiv' | 'pausiert' | 'beendet' | 'abgesetzt' | 'entered-in-error';

export const EMP_STATUS_BEZEICHNUNG: Record<EmpStatus, string> = {
  aktiv: 'aktiv',
  pausiert: 'pausiert',
  beendet: 'beendet',
  abgesetzt: 'abgesetzt',
  'entered-in-error': 'fehlerhaft',
};

export const EMP_STATUS_CODE: Record<EmpStatus, string> = {
  aktiv: 'active',
  pausiert: 'on-hold',
  beendet: 'completed',
  abgesetzt: 'stopped',
  'entered-in-error': 'entered-in-error',
};

/**
 * Ein Eintrag des Medikationsplans, wie ihn die ePA führt (eMP) — gelesen und auf das Nötige
 * gebracht. Grundlage für den Abgleich mit dem Medikationsplan der Praxis (ADR 0046).
 */
export interface SpiegelEintrag {
  id: string;
  bezeichnung: string;
  atc: string;
  /** Erzeugter Dosierungstext (`renderedDosageInstruction`), sonst der Freitext. */
  dosierung: string;
  /**
   * Strukturierte Dosierung nach `DosageDgMP`; `null`, wenn der Eintrag eine Form trägt, die das
   * Praxissystem nicht selbst erfasst.
   */
  dosis?: Dosierung | null;
  /** Behandlungsgrund in Worten der Patient:innen (`reasonPatientInstruction`). */
  grund: string | null;
  /** Diagnose als Behandlungsgrund (`EMPReasonCondition`, ICD-10-GM). */
  grundDiagnose?: { code: string; bezeichnung: string } | null;
  /** Kategorie des eMP (Zwischenüberschrift); im Praxisplan bis zum Abgleich `null`. */
  kategorie?: EmpKategorie | null;
  status: EmpStatus;
  verantwortlich: string;
  fassung: string;
  /** Zeitpunkt der letzten Änderung des Planeintrags — ordnet ihn im Verlauf dem richtigen Tag zu. */
  geaendertAm?: string;
}

/** Wann der Medikationsplan der Praxis zuletzt mit dem eMP abgeglichen wurde (ADR 0046). */
export interface Planabgleich {
  patientId: string;
  /** Lesenachweis des eMP beim Abgleich. */
  planId: string;
  /** ISO-Zeitpunkt des letzten erfolgreichen Abgleichs mit der ePA. */
  abgeglichenAm: string;
}

/** Stand eines eMP-Eintrags beim letzten Abgleich — woran sich Änderungen beider Seiten zeigen. */
export interface EpaStand {
  fassung: string;
  dosierung: string;
  grund: string | null;
  status: EmpStatus;
}

/**
 * Eintrag im Medikationsplan der Praxis — der Primärbestand des Praxissystems (ADR 0045, 0046).
 *
 * Die Praxis führt den Plan selbst, für jede Person: ohne Akte, ohne eingelesene eGK, bei
 * Widerspruch und bei Störung. Gibt es einen eMP, ist der Eintrag mit seinem eMP-Eintrag
 * verknüpft (`epaId`) und trägt dessen Stand beim letzten Abgleich (`epaStand`). Daran zeigt
 * sich, welche Seite seither geändert hat.
 */
export interface PraxisplanEintrag extends SpiegelEintrag {
  patientId: string;
  atcVersion: string;
  pzn: string | null;
  /** Diagnose der Praxis, auf die der Behandlungsgrund verweist (`Diagnose.id`). */
  grundDiagnoseId?: string | null;
  angelegtAm: string;
  geaendertAm: string;
  /** Kennungen der E-Rezepte der Praxis, die zu diesem Eintrag gehören. */
  rezeptIds: readonly string[];
  /** Kennung des verknüpften eMP-Eintrags (`MedicationRequest.id`), sonst `null`. */
  epaId: string | null;
  epaStand: EpaStand | null;
}
