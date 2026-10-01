import type { Herkunft } from './herkunft.js';
import type { Kodierung } from './kodierung.js';

/**
 * Eine Impfung — in der Praxis dokumentiert oder aus der ✦ Impfliste der ePA übernommen.
 *
 * Abgebildet nach `immunization-eu-core` (HL7 Europe), wie ihn die Section „Immunizations" der
 * European Patient Summary verlangt: Impfstoff, Datum, Zielkrankheiten, Dosis, Charge.
 */
export interface Impfung {
  id: string;
  patientId: string;
  impfstoff: {
    bezeichnung: string;
    atc: string;
    atcVersion: string;
    pzn: string | null;
  };
  /** Krankheiten, gegen die geimpft wurde (SNOMED CT). */
  zielkrankheiten: Kodierung[];
  /** ISO-Datum der Impfung. */
  datum: string;
  /** Nummer der Dosis in der Impfserie, sofern bekannt. */
  dosis: number | null;
  charge: string | null;
  /** Wer geimpft hat — Person und Einrichtung. */
  geimpftVon: string;
  status: 'erfolgt' | 'fehlerhaft';
  herkunft: Herkunft;
  /** Kennung des Eintrags in der Impfliste der ePA, wenn er dort geführt wird. */
  epaId: string | null;
  notiz: string | null;
}
