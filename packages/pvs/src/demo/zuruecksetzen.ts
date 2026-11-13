import { useSyncExternalStore } from 'react';
import { zuruecksetzen } from '../speicher/speicher.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { epaFensterSchliessen } from '../epa/fenster.js';
import { entwuerfeLeeren } from '../module/arztbrief/entwurf.js';
import { aktensystemZuruecksetzen } from './steuerung.js';

/**
 * Durchgang der Demo: zählt jedes Zurücksetzen. Die Ansichten hängen daran (`key`) und beginnen
 * neu — sonst behielten offene Formulare Eingaben aus der Zeit vor dem Zurücksetzen, etwa ein
 * Suchbegriff oder eine gewählte Kategorie.
 */
let durchgang = 0;
const hoerer = new Set<() => void>();

export function useDurchgang(): number {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => {
        hoerer.delete(h);
      };
    },
    () => durchgang,
    () => durchgang,
  );
}

/**
 * Praxis und Aktensystem gemeinsam zurücksetzen — sonst stünden in der ePA Einträge, die die
 * Praxis nicht mehr kennt, und umgekehrt. Erst das Aktensystem: Scheitert es, bleibt auch die
 * Praxis, wie sie war, und der Fehler geht an den Aufrufer. Danach schließt das ePA-Fenster, und
 * die Ansichten beginnen neu. Genutzt vom Kopf („Zurücksetzen“) und von den Klickpfaden
 * (ADR 0061).
 */
export async function demoZuruecksetzen(): Promise<void> {
  await aktensystemZuruecksetzen();
  zuruecksetzen();
  klientZuruecksetzen();
  entwuerfeLeeren();
  epaFensterSchliessen();
  durchgang += 1;
  hoerer.forEach((h) => h());
}
