import { demoUhrNeuBeginnen } from '@demo-pvs/kern';
import { betriebslage, STANDARD_BETRIEBSLAGE } from './betrieb.ts';
import { epsAblageLeeren } from './epa-eps.ts';
import { erezepteLeeren } from './erezept.ts';
import { postausgangLeeren } from './kim.ts';
import { startbestandAufbauen } from './startbestand.ts';

/**
 * Setzt den ganzen Simulator auf den Startbestand zurück — Akten, Befugnisse, E-Rezepte samt
 * laufender Übertragungen, KIM-Postausgang, erzeugte ePS, Betriebslage und die Demo-Uhr.
 *
 * Eine Funktion für alle drei Anlässe: Start des Servers (`anwendung.ts`), Start im Browser
 * (`browser.ts`) und die Demo-Steuerung `POST /verwaltung/zuruecksetzen` (`wege.ts`). Vorher
 * setzte jede Stelle etwas anderes zurück; erzeugte ePS überlebten das Zurücksetzen.
 */
export function simulatorZuruecksetzen(): void {
  // Die Uhr zuerst: Der Startbestand rechnet vom Demo-Tag aus.
  demoUhrNeuBeginnen();
  startbestandAufbauen();
  erezepteLeeren();
  postausgangLeeren();
  epsAblageLeeren();
  Object.assign(betriebslage, STANDARD_BETRIEBSLAGE);
}
