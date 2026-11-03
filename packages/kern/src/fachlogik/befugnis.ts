const BERLIN = 'Europe/Berlin';

/**
 * Ende einer Befugnis nach OpenAPI `I_Entitlement_Management` 1.8.0: Kalendertag des Erteilens
 * plus Dauer minus eins, 23:59:59 in deutscher Zeit — etwa „2025-01-03T23:59:59+01:00" für
 * eine Apotheke, die am 01.01.2025 befugt wird. Simulator und Praxissystem rechnen gleich.
 */
export function befugnisende(ab: Date, tage: number): string {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ab);
  const wert = (typ: string) => Number(teile.find((t) => t.type === typ)?.value);
  const tag = new Date(Date.UTC(wert('year'), wert('month') - 1, wert('day') + tage - 1, 12));
  const datum = tag.toISOString().slice(0, 10);
  // Versatz der deutschen Zeit an diesem Tag: MEZ +01:00 oder MESZ +02:00.
  const versatz =
    new Intl.DateTimeFormat('en-US', { timeZone: BERLIN, timeZoneName: 'shortOffset' })
      .formatToParts(tag)
      .find((t) => t.type === 'timeZoneName')?.value ?? 'GMT+1';
  const stunden = Number(versatz.replace('GMT', '') || '0');
  const zeichen = stunden >= 0 ? '+' : '-';
  return `${datum}T23:59:59${zeichen}${String(Math.abs(stunden)).padStart(2, '0')}:00`;
}

/** Dauer einer Befugnis durch das Einlesen der eGK in einer Praxis: 90 Tage (Konzept 3.1.3). */
export const BEFUGNIS_TAGE_PRAXIS = 90;
