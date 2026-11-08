import { betriebslageSetzen } from '../demo/steuerung.js';
import { demoZuruecksetzen } from '../demo/zuruecksetzen.js';
import { egkEinlesen } from '../epa/befugnis.js';
import { aufrufeLesen, protokollLeeren } from '../epa/protokoll.js';
import { alleFinden, erfuellt, zielBeschreibung } from './finden.js';
import type { Schritt, Szenario } from './szenario.js';

/**
 * Startzustand herstellen und Schritte selbst ausführen — für die Tests der Klickpfade, für
 * „zurück zum Pfad“ und für „für mich eintragen“ im Rundgang.
 */

/** Wartet, bis `pruefen` einen Wert liefert; sonst Fehler mit `was`. */
export async function warten<T>(pruefen: () => T | null, was: string, ms = 5000): Promise<T> {
  const bis = Date.now() + ms;
  for (;;) {
    const wert = pruefen();
    if (wert !== null) return wert;
    if (Date.now() > bis) throw new Error(`Klickpfad: ${was} nicht erreicht.`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Wartet, bis seit `ms` kein Aufruf an die ePA mehr dazukam — dann gehören alle Aufrufe zum
 * Schritt davor, und die Ansicht hat ihre Listen geladen. Gibt nach `hoechstens` auf, ohne Fehler:
 * Ruhe ist eine Zuordnungshilfe, keine Bedingung.
 */
export async function ruheAbwarten(ms = 150, hoechstens = 5000): Promise<void> {
  let zuletzt: number | undefined = -1;
  let seit = Date.now();
  const bis = Date.now() + hoechstens;
  for (;;) {
    const neuester = aufrufeLesen()[0]?.id;
    if (neuester !== zuletzt) {
      zuletzt = neuester;
      seit = Date.now();
    }
    if (Date.now() - seit > ms || Date.now() > bis) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Startzustand: Praxis und Aktensystem zurücksetzen, Ausbaustand setzen, eGK einlesen, zur
 * Ansicht springen und warten, bis sie geladen hat. Jeder Durchlauf beginnt damit gleich; was die
 * Ansicht beim Öffnen abruft, zählt nicht zum ersten Schritt.
 */
export async function startzustandHerstellen(
  s: Szenario,
  navigieren: (pfad: string) => void,
): Promise<void> {
  await demoZuruecksetzen();
  await betriebslageSetzen({ ausbaustand: s.start.ausbaustand });
  if (s.start.egkEinlesen) {
    const ergebnis = await egkEinlesen(s.start.patientId);
    if (!ergebnis.ok) throw new Error(`Klickpfad: ${ergebnis.text}`);
  }
  protokollLeeren();
  navigieren(s.start.pfad);
  await ruheAbwarten();
}

/** Setzt den Wert eines React-gesteuerten Felds so, als hätte die Person ihn eingegeben. */
export function wertSetzen(e: HTMLElement, wert: string): void {
  const art =
    e instanceof HTMLSelectElement
      ? HTMLSelectElement
      : e instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement
        : HTMLInputElement;
  Object.getOwnPropertyDescriptor(art.prototype, 'value')?.set?.call(e, wert);
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Das eine Element eines Schritts — wartet, bis es erscheint und eindeutig ist. */
export function zielAbwarten(schritt: Schritt, ms?: number): Promise<HTMLElement> {
  return warten(
    () => {
      const treffer = alleFinden(schritt.ziel);
      return treffer.length === 1 ? treffer[0]! : null;
    },
    `${zielBeschreibung(schritt.ziel)} (genau einmal)`,
    ms,
  );
}

/** Einen Schritt ausführen: Handlung vornehmen oder warten, bis der Prüfpunkt erfüllt ist. */
export async function schrittAusfuehren(schritt: Schritt): Promise<void> {
  const e = await zielAbwarten(schritt);
  const h = schritt.handlung;
  if (!h) {
    await warten(() => {
      const aktuell = alleFinden(schritt.ziel)[0];
      return aktuell && erfuellt(schritt, aktuell) ? true : null;
    }, `Prüfpunkt „${schritt.kurz}“`);
    return;
  }
  if (h.art === 'klicken') e.click();
  else wertSetzen(e, h.wert);
}

/**
 * Startzustand und die ersten `bis` Schritte — „zurück zum Pfad“, „Schritt zurück“ und die Tests.
 * Wartet am Ende auf Ruhe, damit nachgeladene Listen nicht dem nächsten Schritt zugerechnet werden.
 */
export async function pfadNachspielen(
  s: Szenario,
  bis: number,
  navigieren: (pfad: string) => void,
): Promise<void> {
  await startzustandHerstellen(s, navigieren);
  for (const schritt of s.schritte.slice(0, bis)) await schrittAusfuehren(schritt);
  if (bis > 0) await ruheAbwarten();
}
