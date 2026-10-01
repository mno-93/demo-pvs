/**
 * Dokumente im Praxissystem.
 *
 * Ein Praxissystem führt seine eigene Dokumentenablage. Was in der elektronischen
 * Patientenakte liegt, ist damit nicht automatisch lokal vorhanden — und umgekehrt.
 * Diese Trennung ist derselbe Gedanke wie bei Diagnosen und Allergien und der Grund,
 * warum der Abgleich zwischen beiden Beständen eine eigene Ansicht bekommt.
 */

export type Dokumentart =
  | 'Arztbrief'
  | 'Entlassbrief'
  | 'Laborbefund'
  | 'Befundbericht'
  | 'Bescheinigung'
  | 'Scan'
  | 'Sonstiges';

export type Dokumentursprung = 'akte' | 'praxis' | 'labor';

export const DOKUMENTURSPRUNG_BEZEICHNUNG: Record<Dokumentursprung, string> = {
  akte: 'aus der ePA übernommen',
  praxis: 'in der Praxis erfasst',
  labor: 'vom Labor übermittelt',
};

export interface LokalesDokument {
  id: string;
  patientId: string;
  titel: string;
  art: Dokumentart;
  /**
   * Wie das Dokument in die Praxis kam. `akte`: aus der elektronischen Patientenakte
   * übernommen. `praxis`: hier eingescannt oder erzeugt. `labor`: vom beauftragten Labor
   * direkt übermittelt — der Weg, auf dem Laborbefunde heute in die Praxis gelangen.
   * Die Unterscheidung überlebt das Einstellen in die Akte und macht im Abgleich
   * sichtbar, in welche Richtung ein Dokument gelaufen ist.
   */
  ursprung: Dokumentursprung;
  /** ISO-Datum der Erstellung des Dokuments, nicht der Speicherung. */
  datum: string;
  /** Kennung in der Akte, sofern das Dokument von dort stammt oder dorthin eingestellt wurde. */
  epaId: string | null;
  einrichtung: string;
  autor: string;
  dateiname: string;
  inhaltstyp: string;
  groesseBytes: number;
  /** ISO-Zeitpunkt der lokalen Speicherung. */
  gespeichertAm: string;
  gespeichertVon: string;
  /**
   * Inhalt des Dokuments. Bei aus der Akte übernommenen Dokumenten das FHIR-Bundle,
   * bei eingescannten Unterlagen ein Platzhalter — die Demo bildet keine Bilddaten ab.
   */
  inhalt: unknown;
  notiz: string | null;
}

/** Zustand eines Dokuments im Abgleich zwischen Akte und Praxissystem. */
export type Abgleichstatus =
  /** Liegt in der ePA, nicht im Praxissystem. */
  | 'nur-in-epa'
  /** Liegt in beiden Beständen. */
  | 'in-beiden'
  /** Liegt nur im Praxissystem und wurde nie in die ePA eingestellt. */
  | 'nur-lokal'
  /** Liegt lokal und wurde von hier aus in die ePA eingestellt. */
  | 'lokal-eingestellt';

export const ABGLEICHSTATUS_BEZEICHNUNG: Record<Abgleichstatus, string> = {
  'nur-in-epa': 'nur in ePA',
  'in-beiden': 'lokal vorhanden',
  'nur-lokal': 'nur lokal',
  'lokal-eingestellt': 'lokal, in ePA eingestellt',
};
