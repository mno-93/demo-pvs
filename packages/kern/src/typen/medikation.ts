import type { Herkunft } from './herkunft.js';

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

/** Einnahmeschema morgens–mittags–abends–zur Nacht. */
export interface Dosierung {
  morgens: string;
  mittags: string;
  abends: string;
  zurNacht: string;
  einheit: string;
  hinweis: string | null;
}

export function dosierungAlsText(d: Dosierung): string {
  return `${d.morgens}-${d.mittags}-${d.abends}-${d.zurNacht}`;
}

/** Angabe zum Arzneimittel, wie sie der Medication Service verlangt. */
export interface Arzneimittelangabe {
  /** Pharmazentralnummer, sofern das Fertigarzneimittel bekannt ist. */
  pzn: string | null;
  atc: string;
  /** Verpflichtend: ohne Version ist eine ATC-de-Kodierung nicht eindeutig. */
  atcVersion: string;
  bezeichnung: string;
  wirkstoff: string;
  staerke: string;
  darreichung: string;
}

/** Eintrag der elektronischen Medikationsliste: eine Verordnung oder eine Abgabe. */
export interface EmlEintrag {
  id: string;
  art: 'Verordnung' | 'Abgabe';
  arzneimittel: Arzneimittelangabe;
  /** ISO-Datum. */
  datum: string;
  /** Verordnende Praxis oder abgebende Apotheke. */
  einrichtung: string;
  person: string;
  /** Dosierungsangabe der Verordnung, bei Abgaben meist nicht belegt. */
  dosierung: string | null;
  /** Verweis der Abgabe auf die zugehörige Verordnung. */
  basiertAuf: string | null;
}

/**
 * Status eines eMP-Eintrags nach `EMPMedicationRequest` (IG Medication Service 1.3.5):
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
 * Eintrag des elektronischen Medikationsplans — ärztlich verantwortet.
 *
 * Es gibt keine physische Löschung. Ein Eintrag wird auf `entered-in-error` gesetzt;
 * er bleibt über die Historie abrufbar (IG Medication Service 1.3.5).
 */
export interface EmpEintrag {
  id: string;
  /** Kennung des Plans, zu dem der Eintrag gehört. */
  planId: string;
  arzneimittel: Arzneimittelangabe;
  dosierung: Dosierung;
  behandlungsgrund: string | null;
  hinweis: string | null;
  status: EmpStatus;
  /** Wer den Eintrag verantwortet. */
  verantwortlich: string;
  einrichtung: string;
  /** ISO-Zeitpunkt der letzten Änderung. */
  zeitpunkt: string;
  /** Fortlaufende Version; jede Änderung erhöht sie. */
  version: number;
  /** Verweis auf den eML-Eintrag, aus dem der Planeintrag übernommen wurde. */
  ausEml: string | null;
}

/** Lokale Verordnung im Praxissystem, vor dem Einstellen in die Akte. */
export interface Verordnung {
  id: string;
  patientId: string;
  fallId: string | null;
  arzneimittel: Arzneimittelangabe;
  dosierung: Dosierung;
  /** ISO-Datum. */
  verordnetAm: string;
  verordnetVon: string;
  behandlungsgrund: string | null;
  dauermedikation: boolean;
  herkunft: Herkunft;
}

/**
 * Lokaler Spiegel des Medikationsplans.
 *
 * Ein Praxissystem führt den Plan nicht nur als Fernsicht. Es hält den zuletzt
 * abgeglichenen Stand vor, damit im Sprechzimmer etwas dasteht, wenn die ePA gerade nicht
 * antwortet. Der Spiegel ist deshalb ausdrücklich datiert: Was er zeigt, ist der Stand des
 * letzten Abgleichs — nicht notwendig der heutige.
 *
 * ▸ Der Unterschied zur ePA-Ansicht ist beabsichtigt und gehört zur Aussage der Demo: Die
 * ePA-Ansicht ist eine Fernsicht und zeigt bei fehlender Verbindung nichts. Der Spiegel ist
 * eine lokale Kopie und zeigt den letzten Stand — mit Datum, damit niemand ihn für aktuell
 * hält.
 */
export interface SpiegelEintrag {
  id: string;
  bezeichnung: string;
  atc: string;
  dosierung: string;
  grund: string | null;
  status: EmpStatus;
  verantwortlich: string;
  fassung: string;
  /** Zeitpunkt der letzten Änderung des Planeintrags — ordnet ihn im Verlauf dem richtigen Tag zu. */
  geaendertAm?: string;
}

export interface Medikationsspiegel {
  patientId: string;
  planId: string;
  /** ISO-Zeitpunkt des letzten erfolgreichen Abgleichs mit der ePA. */
  abgeglichenAm: string;
  eintraege: readonly SpiegelEintrag[];
}
