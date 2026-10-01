/**
 * Der eine Weg, auf dem das Praxissystem HTTP-Anfragen stellt.
 *
 * Lokal gehen sie über `fetch` an den Entwicklungsserver und von dort an den Simulator. In der
 * gehosteten Demo gibt es keinen Server; dort beantwortet der Simulator im Browser die Wege der
 * ePA, des Fachdienstes und der Demo-Steuerung (ADR 0025). Anfragen, Kopfzeilen und Antworten
 * sind in beiden Fällen dieselben.
 */

export type Abruf = (pfad: string, init: RequestInit) => Promise<Response>;

let abruf: Abruf = (pfad, init) => fetch(pfad, init);

export function transportSetzen(neu: Abruf): void {
  abruf = neu;
}

export function abrufen(pfad: string, init: RequestInit): Promise<Response> {
  return abruf(pfad, init);
}

/** Wege, die der Simulator beantwortet. */
export const SIMULATORWEGE = /^\/(epa|information|erp|verwaltung)\//;
