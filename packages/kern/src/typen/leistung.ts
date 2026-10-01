export interface Leistungsziffer {
  id: string;
  patientId: string;
  fallId: string;
  ziffer: string;
  bezeichnung: string;
  /** ISO-Datum der Leistungserbringung. */
  datum: string;
  anzahl: number;
  erfasstVon: string;
}
