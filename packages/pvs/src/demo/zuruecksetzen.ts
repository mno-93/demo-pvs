import { zuruecksetzen } from '../speicher/speicher.js';
import { klientZuruecksetzen } from '../epa/klient.js';
import { entwuerfeLeeren } from '../module/arztbrief/entwurf.js';
import { aktensystemZuruecksetzen } from './steuerung.js';

/**
 * Praxis und Aktensystem gemeinsam zurücksetzen — sonst stünden in der ePA Einträge, die die
 * Praxis nicht mehr kennt, und umgekehrt. Erst das Aktensystem: Scheitert es, bleibt auch die
 * Praxis, wie sie war, und der Fehler geht an den Aufrufer. Genutzt vom Kopf („Zurücksetzen“)
 * und vom Start eines Klickpfads (ADR 0061).
 */
export async function demoZuruecksetzen(): Promise<void> {
  await aktensystemZuruecksetzen();
  zuruecksetzen();
  klientZuruecksetzen();
  entwuerfeLeeren();
}
