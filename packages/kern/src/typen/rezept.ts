/**
 * E-Rezept im Praxissystem.
 *
 * Das Praxissystem führt, was es selbst veranlasst hat: vorbereitet, signiert und gesendet,
 * gelöscht. Ob ein Rezept in der Medikationsliste steht oder eingelöst ist, weiß es nicht aus
 * dem E-Rezept-Fachdienst, sondern nur aus der ePA — die Abgabe erfährt die verordnende Praxis
 * über die eML.
 */

/** Normgröße der Packung. */
export type Normgroesse = 'N1' | 'N2' | 'N3';

/**
 * ⚠ Stückzahl je Normgröße — vereinfachte Annahme der Demo. Die Messzahlen sind je
 * Therapiegebiet festgelegt; für die Reichweite reicht hier eine Näherung.
 */
export const NORMGROESSE_STUECK: Record<Normgroesse, number> = { N1: 20, N2: 50, N3: 100 };

/**
 * Freigabe einer von der MFA vorbereiteten Verordnung für die signierende Ärztin — nach dem
 * in Praxissystemen verbreiteten Muster: freigegeben, mit Hinweis, gesperrt.
 */
export type Rezeptfreigabe = 'freigegeben' | 'hinweis' | 'gesperrt';

export const REZEPTFREIGABE_BEZEICHNUNG: Record<Rezeptfreigabe, string> = {
  freigegeben: 'freigegeben',
  hinweis: 'mit Hinweis',
  gesperrt: 'gesperrt',
};

export type Rezeptstatus = 'vorbereitet' | 'gesendet' | 'geloescht';

export interface Rezept {
  id: string;
  patientId: string;
  arzneimittel: {
    bezeichnung: string;
    pzn: string;
    atc: string;
    atcVersion: string;
  };
  /** Viererschema oder Freitext, wie im Plan. */
  dosierung: string;
  packungen: number;
  normgroesse: Normgroesse;
  /** eMP-Identifier des Planeintrags, aus dem verordnet wird — verknüpft Liste und Plan. */
  empId: string | null;
  /** Grund, wenn nicht aus dem Plan verordnet wird. */
  grund: string | null;
  status: Rezeptstatus;
  freigabe: Rezeptfreigabe;
  /** Text für die signierende Ärztin. */
  hinweis: string | null;
  erstelltAm: string;
  vorbereitetVon: string;
  /** Rezept-ID und AccessCode aus dem E-Rezept-Fachdienst, ab dem Senden. */
  rezeptId: string | null;
  accessCode: string | null;
  signiertVon: string | null;
  gesendetAm: string | null;
  geloeschtAm: string | null;
}
