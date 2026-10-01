export type Rolle = 'aerztin' | 'mfa';

export const ROLLE_BEZEICHNUNG: Record<Rolle, string> = {
  aerztin: 'Ärztin / Arzt',
  mfa: 'Medizinische Fachangestellte',
};

export interface Nutzer {
  id: string;
  name: string;
  rolle: Rolle;
  /** Lebenslange Arztnummer, in der Demo fiktiv. Nur bei ärztlicher Rolle belegt. */
  lanr: string | null;
}

/**
 * Rechte in der Demo. Bewusst grob: Die Unterscheidung soll zeigen, dass es sie gibt,
 * und die Frage nach dem Rollenmodell — wer darf lesen, vorbereiten, signieren — diskutierbar machen;
 * sie bildet kein reales Berechtigungskonzept ab.
 */
export interface Rechte {
  darfDiagnosenStellen: boolean;
  darfVerordnen: boolean;
  darfStammdatenPflegen: boolean;
  darfAbrechnen: boolean;
  darfInAkteSchreiben: boolean;
}

export function rechteFuer(rolle: Rolle): Rechte {
  if (rolle === 'aerztin') {
    return {
      darfDiagnosenStellen: true,
      darfVerordnen: true,
      darfStammdatenPflegen: true,
      darfAbrechnen: true,
      darfInAkteSchreiben: true,
    };
  }
  return {
    darfDiagnosenStellen: false,
    darfVerordnen: false,
    darfStammdatenPflegen: true,
    darfAbrechnen: true,
    darfInAkteSchreiben: false,
  };
}
