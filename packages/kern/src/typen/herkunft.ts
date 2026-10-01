/**
 * Woher ein Datensatz stammt. Die Herkunftskennzeichnung ist im Projekt eine frühe
 * Festlegung: Sie muss von Beginn an im Datenmodell liegen,
 * weil sie sich später nur mit einem Bruch nachrüsten ließe.
 */
export type Bestand = 'lokal' | 'epa';

export const BESTAND_BEZEICHNUNG: Record<Bestand, string> = {
  lokal: 'Praxissystem',
  epa: 'elektronische Patientenakte (ePA)',
};

export interface Herkunft {
  /** In welchem der beiden Bestände der Eintrag geführt wird. */
  bestand: Bestand;
  /** Einrichtung oder Anwendung, aus der er stammt. */
  quelle: string;
  /** ISO-Zeitpunkt der Entstehung. */
  zeitpunkt: string;
  /** Person, die ihn verantwortet. */
  verantwortlich: string;
  /** Verweis auf das Quelldokument in der Akte, sofern vorhanden. */
  dokumentId: string | null;
}
