import { mitZeitzone } from './fhir/zeit.js';

/**
 * Die Demo-Uhr — die einzige Quelle für „jetzt“ in Praxissystem und Simulator.
 *
 * Die Demo spielt an einem festen Tag (`DEMO_HEUTE`), mit der Uhrzeit, die gerade in Deutschland
 * gilt — unabhängig von der Zeitzone des Rechners. So fallen Einträge von Praxis und Akte in
 * denselben Besuch, Befugnisse laufen nach dieser Uhr ab, und die öffentliche Demo zeigt außerhalb
 * Deutschlands dieselben Zeitpunkte wie im Land.
 *
 * Die Uhr läuft streng steigend: Zwei Aufrufe ergeben nie denselben Zeitpunkt, auch nicht in der
 * Nacht der Zeitumstellung. Läuft eine Sitzung über Mitternacht, geht sie auf den nächsten Tag
 * weiter, statt auf 00:00 desselben Tages zurückzuspringen; gezählt wird ab dem Tag, an dem die
 * Uhr zum ersten Mal gelesen wurde. Zeitpunkte bleiben so als Zeichenkette vergleichbar, etwa für
 * „neu seit dem letzten Aufruf“.
 *
 * Intern ohne Zone (`2026-09-09T11:00:00.123`), in FHIR mit dem deutschen Versatz (`fhir/zeit.ts`).
 */

/** Der Tag, den Praxis und Aktensystem der Demo als „heute“ führen. */
export const DEMO_HEUTE = '2026-09-09';

const DEUTSCHLAND = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Datum und Uhrzeit eines Zeitpunkts in deutscher gesetzlicher Zeit, ohne Zone (`JJJJ-MM-TTThh:mm:ss`). */
export function ortszeitDeutschland(zeitpunkt: Date): string {
  const t = Object.fromEntries(DEUTSCHLAND.formatToParts(zeitpunkt).map((p) => [p.type, p.value]));
  return `${t['year']}-${t['month']}-${t['day']}T${t['hour']}:${t['minute']}:${t['second']}`;
}

const TAG_MS = 86_400_000;

function tagPlus(datum: string, tage: number): string {
  return new Date(Date.parse(`${datum}T00:00:00Z`) + tage * TAG_MS).toISOString().slice(0, 10);
}

function millisekundeWeiter(lokal: string): string {
  return new Date(Date.parse(`${lokal}Z`) + 1).toISOString().slice(0, 23);
}

let quelle: () => number = () => Date.now();
let startTag: string | null = null;
let zuletzt = '';

/**
 * Jetzt nach der Demo-Uhr: Demo-Tag und deutsche Uhrzeit, ohne Zone, mit Millisekunden,
 * streng steigend.
 */
export function demoZeitpunkt(): string {
  const echt = quelle();
  const ort = ortszeitDeutschland(new Date(echt));
  startTag ??= ort.slice(0, 10);
  const tage = Math.round(
    (Date.parse(`${ort.slice(0, 10)}T00:00:00Z`) - Date.parse(`${startTag}T00:00:00Z`)) / TAG_MS,
  );
  const ms = String(((echt % 1000) + 1000) % 1000).padStart(3, '0');
  let wert = `${tagPlus(DEMO_HEUTE, tage)}${ort.slice(10)}.${ms}`;
  if (wert <= zuletzt) wert = millisekundeWeiter(zuletzt);
  zuletzt = wert;
  return wert;
}

/** Wie `demoZeitpunkt`, auf die Sekunde — für Einträge ohne Millisekunden. */
export function demoZeitpunktSekunden(): string {
  return demoZeitpunkt().slice(0, 19);
}

/** Uhrzeit der Demo-Uhr, `hh:mm:ss`. */
export function demoUhrzeit(): string {
  return demoZeitpunkt().slice(11, 19);
}

/** Jetzt nach der Demo-Uhr als Zeitpunkt — für Vergleiche mit Angaben, die eine Zone tragen. */
export function demoJetzt(): Date {
  return new Date(mitZeitzone(demoZeitpunkt()));
}

/** Nur für Tests: Uhr auf eine andere Zeitquelle stellen und neu beginnen lassen. */
export function demoUhrNeuStellen(neueQuelle: () => number = () => Date.now()): void {
  quelle = neueQuelle;
  startTag = null;
  zuletzt = '';
}
