/**
 * Zeitpunkte beim Übergang nach FHIR.
 *
 * Die Demo-Uhr führt Zeitpunkte intern ohne Zeitzone („2026-09-09T11:00:00") — alle stammen aus
 * derselben Uhr und lassen sich als Zeichenkette vergleichen. FHIR R4 verlangt dagegen bei
 * `dateTime` mit Uhrzeit eine Zeitzone, bei `instant` immer. Deshalb gilt eine Regel an einer
 * Stelle: **Intern ohne Zone, in FHIR mit Zone.** Ergänzt wird die gesetzliche Zeit in
 * Deutschland — +01:00, von Ende März bis Ende Oktober +02:00 —, unabhängig von der Zeitzone
 * des Rechners, auf dem die Demo läuft.
 */

const OHNE_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** Tag des letzten Sonntags im Monat (1–12). */
function letzterSonntag(jahr: number, monat: number): number {
  const letzter = new Date(Date.UTC(jahr, monat, 0));
  return letzter.getUTCDate() - letzter.getUTCDay();
}

/** Versatz der deutschen gesetzlichen Zeit für einen lokalen Zeitpunkt. */
export function versatzDeutschland(lokal: string): '+01:00' | '+02:00' {
  const jahr = Number(lokal.slice(0, 4));
  const monat = Number(lokal.slice(5, 7));
  const tag = Number(lokal.slice(8, 10));
  const stunde = Number(lokal.slice(11, 13) || '12');
  if (monat < 3 || monat > 10) return '+01:00';
  if (monat > 3 && monat < 10) return '+02:00';
  const sonntag = letzterSonntag(jahr, monat);
  // Umstellung um 2 Uhr (März) und 3 Uhr (Oktober) Ortszeit.
  if (monat === 3) return tag > sonntag || (tag === sonntag && stunde >= 2) ? '+02:00' : '+01:00';
  return tag < sonntag || (tag === sonntag && stunde < 3) ? '+02:00' : '+01:00';
}

/** Ein Zeitpunkt mit Zone. Datumsangaben ohne Uhrzeit und Zeitpunkte mit Zone bleiben, wie sie sind. */
export function mitZeitzone(wert: string): string {
  return OHNE_ZONE.test(wert) ? `${wert}${versatzDeutschland(wert)}` : wert;
}

/**
 * Ergänzt in einer FHIR-Struktur jede Uhrzeit ohne Zone. Der Erzähltext (`div`) bleibt
 * unberührt. Für die Übergänge nach FHIR: Brief, Laborbefund, E-Rezept und die Antworten des
 * Simulators.
 */
export function zeitzonenErgaenzen<T>(wert: T): T {
  if (typeof wert === 'string') return mitZeitzone(wert) as T;
  if (Array.isArray(wert)) return wert.map((x) => zeitzonenErgaenzen(x)) as T;
  if (typeof wert === 'object' && wert !== null) {
    return Object.fromEntries(
      Object.entries(wert).map(([k, v]) => [k, k === 'div' ? v : zeitzonenErgaenzen(v)]),
    ) as T;
  }
  return wert;
}

/** Zeitpunkte gleich welcher Schreibweise vergleichbar machen: die Zone weglassen. */
export function ohneZeitzone(wert: string): string {
  return wert.replace(/(Z|[+-]\d{2}:\d{2})$/, '');
}
