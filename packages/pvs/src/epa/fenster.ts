import { useSyncExternalStore } from 'react';

/**
 * Zustand des ePA-Fensters.
 *
 * Die ePA ist kein Bereich der Patientenkartei, sondern ein fremdes System, das die Praxis
 * aufruft. Deshalb öffnet sie sich als eigenes Fenster über der Kartei — eine Ebene höher,
 * mit eigenem Kopf und eigenem Schließen — und nicht als weiterer Reiter neben Diagnosen
 * und Abrechnung (ADR 0014).
 */

export type EpaBereich =
  'summary' | 'uebersicht' | 'dokumente' | 'medikation' | 'listen' | 'labor' | 'inhalte' | 'lotse';

export const EPA_BEREICHE: {
  schluessel: EpaBereich;
  beschriftung: string;
  /** Nur, wenn das Aktensystem den ✦ Dienst anbietet (ADR 0018, 0021, 0032). */
  bedingung?: 'listen' | 'summary' | 'lotse';
}[] = [
  { schluessel: 'summary', beschriftung: 'Patient Summary', bedingung: 'summary' },
  { schluessel: 'uebersicht', beschriftung: 'Übersicht' },
  { schluessel: 'dokumente', beschriftung: 'Dokumente' },
  { schluessel: 'medikation', beschriftung: 'Medikation' },
  { schluessel: 'listen', beschriftung: 'Diagnosen und Allergien', bedingung: 'listen' },
  { schluessel: 'labor', beschriftung: 'Laborbefunde' },
  { schluessel: 'inhalte', beschriftung: 'Inhalte aus Dokumenten' },
  // ✦ Der Aktenlotse ist eine Anwendung der ePA — er steht deshalb auch hier, nicht nur im PVS.
  { schluessel: 'lotse', beschriftung: 'Aktenlotse ✦', bedingung: 'lotse' },
];

export interface EpaFensterzustand {
  offen: boolean;
  patientId: string | null;
  bereich: EpaBereich;
}

let zustand: EpaFensterzustand = {
  offen: false,
  patientId: null,
  bereich: 'uebersicht',
};
const hoerer = new Set<() => void>();

function setzen(teil: Partial<EpaFensterzustand>) {
  zustand = { ...zustand, ...teil };
  hoerer.forEach((h) => h());
}

export function epaFensterOeffnen(patientId: string, bereich: EpaBereich = 'uebersicht'): void {
  setzen({ offen: true, patientId, bereich });
}

export function epaFensterSchliessen(): void {
  setzen({ offen: false });
}

export function epaBereichWaehlen(bereich: EpaBereich): void {
  setzen({ bereich });
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

export function useEpaFenster(): EpaFensterzustand {
  return useSyncExternalStore(
    abonnieren,
    () => zustand,
    () => zustand,
  );
}
