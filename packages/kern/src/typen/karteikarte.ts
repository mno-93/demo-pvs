/**
 * Karteikartenkürzel nach verbreiteter Praxisgewohnheit. Sie sind kein Standard, sondern
 * die Konvention, mit der in Praxen tatsächlich gearbeitet wird.
 */
export type Kuerzel = 'A' | 'B' | 'D' | 'AL' | 'I' | 'T' | 'L' | 'M' | 'R' | 'DK' | 'S';

export const KUERZEL_BEZEICHNUNG: Record<Kuerzel, string> = {
  A: 'Anamnese',
  B: 'Befund',
  D: 'Diagnose',
  AL: 'Allergie',
  I: 'Impfung',
  T: 'Therapie',
  L: 'Labor',
  M: 'Medikation',
  R: 'Rezept',
  DK: 'Dokument',
  S: 'Sonstiges',
};

/**
 * Kürzel, unter denen frei erfasst wird. Alles Übrige entsteht nicht als Karteitext,
 * sondern aus dem jeweiligen Datenbestand — siehe `verlaufBilden`.
 */
export const FREITEXT_KUERZEL: readonly Kuerzel[] = ['A', 'B', 'T', 'S'];

/** Kürzel, deren Einträge aus einem Datenbestand abgeleitet werden. */
export const ABGELEITETE_KUERZEL: readonly Kuerzel[] = ['D', 'AL', 'I', 'L', 'M', 'R', 'DK'];

/**
 * Eine frei erfasste Notiz auf der Karteikarte.
 *
 * Strukturierte Sachverhalte — Diagnosen, Allergien, Laborwerte, Medikation — werden
 * **nicht** als Karteitext gespeichert. Sie stehen in ihrem eigenen Bestand und erscheinen
 * im Verlauf als abgeleiteter Eintrag. Sonst gäbe es sie zweimal, und die zweite Fassung
 * veraltete beim ersten Ändern.
 */
export interface Karteikarteneintrag {
  id: string;
  patientId: string;
  fallId: string | null;
  /** ISO-Zeitpunkt. */
  zeitpunkt: string;
  kuerzel: Kuerzel;
  text: string;
  verfasser: string;
}
