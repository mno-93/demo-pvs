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
  /** Viererschema oder Freitext, wie im Plan. */
  dosierung: string;
  grund: string | null;
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
