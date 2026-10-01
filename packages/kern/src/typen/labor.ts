import type { Herkunft } from './herkunft.js';

export type Bewertung = 'normal' | 'hoch' | 'niedrig';

export interface Laborwert {
  id: string;
  patientId: string;
  loinc: string;
  bezeichnung: string;
  wert: string;
  einheit: string;
  referenz: string;
  bewertung: Bewertung;
  /** ISO-Datum der Abnahme. */
  erhobenAm: string;
  herkunft: Herkunft;
}
