import { useSyncExternalStore } from 'react';
import { WEG } from '@demo-pvs/kern';

/**
 * Protokoll der Aufrufe an die ePA.
 *
 * Es ist nicht Teil des fachlichen Zustands, sondern eine technische Beobachtung — deshalb
 * ein eigener, kleiner Speicher. Sein Zweck ist die Vorführung: In Architekturgesprächen
 * soll sichtbar sein, welche Schnittstelle ein Bildschirm tatsächlich anspricht, auf welcher
 * Grundlage — und was passiert, wenn die ePA nicht antwortet.
 */

export interface Aufruf {
  id: number;
  zeitpunkt: number;
  methode: string;
  pfad: string;
  status: number | null;
  dauerMs: number;
  /** Kurzfassung der Antwort für die Anzeige. */
  ergebnis: string;
  fehler: string | null;
  /** Spezifikationsgrundlage des Wegs, etwa „MHD ITI-67 · Konzept 3.1.3". */
  grundlage: string;
  /** Gesendete Kopfzeilen — x-insurantid, x-useragent, X-Request-ID. */
  kopfzeilen: Record<string, string>;
  /** Gesendeter Körper, bei schreibenden Operationen die Parameters-Ressource. */
  koerper: unknown;
}

/** Pfad für enge Anzeigen: die langen Basispfade der Fachdienste gekürzt, der Vorschlag markiert. */
export function pfadKurz(pfad: string): string {
  return pfad
    .replace(WEG.medikation, '…/fhir')
    .replace(WEG.diagnosedienst, '✦ …/diagnosis')
    .replace(WEG.information, '…/ehr');
}

let aufrufe: Aufruf[] = [];
let sichtbar = false;
let naechsteId = 1;
const hoerer = new Set<() => void>();

function melden() {
  hoerer.forEach((h) => h());
}

export function aufrufNotieren(aufruf: Omit<Aufruf, 'id' | 'zeitpunkt'>): void {
  aufrufe = [{ ...aufruf, id: naechsteId++, zeitpunkt: Date.now() }, ...aufrufe].slice(0, 200);
  melden();
}

export function protokollLeeren(): void {
  aufrufe = [];
  melden();
}

export function protokollUmschalten(): void {
  sichtbar = !sichtbar;
  melden();
}

export function protokollSchliessen(): void {
  if (!sichtbar) return;
  sichtbar = false;
  melden();
}

export function protokollOeffnen(): void {
  if (sichtbar) return;
  sichtbar = true;
  melden();
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

export function useAufrufe(): Aufruf[] {
  return useSyncExternalStore(
    abonnieren,
    () => aufrufe,
    () => aufrufe,
  );
}

export function useProtokollSichtbar(): boolean {
  return useSyncExternalStore(
    abonnieren,
    () => sichtbar,
    () => sichtbar,
  );
}
