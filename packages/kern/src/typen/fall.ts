export type Fallart = 'ambulant' | 'notfall' | 'ueberweisung' | 'selbstzahlend';

export const FALLART_BEZEICHNUNG: Record<Fallart, string> = {
  ambulant: 'Ambulanter Behandlungsfall',
  notfall: 'Notfall',
  ueberweisung: 'Überweisungsfall',
  selbstzahlend: 'Selbstzahlend',
};

/**
 * Der Behandlungsfall ist die Abrechnungsklammer eines Quartals. Alles, was in einem
 * Quartal dokumentiert und abgerechnet wird, hängt an ihm.
 */
export interface Behandlungsfall {
  id: string;
  patientId: string;
  jahr: number;
  /** 1 bis 4. */
  quartal: number;
  fallart: Fallart;
  /** ISO-Datum des ersten Kontakts im Quartal. */
  beginn: string;
  ueberweiserLanr: string | null;
}
